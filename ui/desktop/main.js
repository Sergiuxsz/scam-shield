/*
 * Scam Shield desktop: a background listener with a floating pill.
 *
 * Flow (modelled on a meeting notetaker's floating pane):
 *   - the local port quietly receives messages from any provider;
 *   - the pill shows it is listening, flashes while checking, and stays small for safe messages;
 *   - on a suspicious or scam message the pill lights up and the pane opens on its own;
 *   - hiding the pane never stops listening. Quitting is explicit.
 */
'use strict';

const { app, BrowserWindow, ipcMain, screen, shell, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { createShieldServer } = require('./core/server');

// Preview mode (npm run preview): plays a short demo on open. It runs as its own instance
// on its own port, so demo alerts never mix with the real listener or its history.
const DEMO = process.argv.includes('--demo') || process.env.SCAM_SHIELD_DEMO === '1';
if (DEMO && !process.env.SCAM_SHIELD_PROFILE) process.env.SCAM_SHIELD_PROFILE = 'demo';
const PORT = Number(process.env.SCAM_SHIELD_PORT || (DEMO ? 7790 : 7777));
const MAX_HISTORY = 50;
const PILL_W = 600;
const PILL_H = 540; // room for the island to cascade down; the transparent rest lets clicks through

// SCAM_SHIELD_PROFILE=test runs a separate instance (own token, own lock) next to the normal one.
if (process.env.SCAM_SHIELD_PROFILE) {
  app.setPath('userData', path.join(app.getPath('appData'), 'scam-shield-' + process.env.SCAM_SHIELD_PROFILE.replace(/[^a-z0-9-]/gi, '')));
}
if (!app.requestSingleInstanceLock()) {
  app.quit();
  return;
}
app.setAppUserModelId('ro.scamshield.desktop');
// The alert sound plays without a click (the pill never takes focus).
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

let pill = null;
let pane = null;
let token = null;
const state = { status: 'starting', port: PORT, error: null, checked: 0, history: [], selectedId: null, activity: null, demo: DEMO, paneFull: false };

function loadToken() {
  if (process.env.SCAM_SHIELD_TOKEN) return process.env.SCAM_SHIELD_TOKEN;
  const file = path.join(app.getPath('userData'), 'token.txt');
  try { const t = fs.readFileSync(file, 'utf8').trim(); if (t) return t; } catch (e) { /* first run */ }
  const t = crypto.randomBytes(24).toString('base64url');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, t, { mode: 0o600 });
  return t;
}

function snapshot() {
  return {
    status: state.status, port: state.port, error: state.error, checked: state.checked, demo: state.demo, paneFull: state.paneFull,
    activity: state.activity, selectedId: state.selectedId,
    // Narrate alerts automatically (demo flow). SCAM_SHIELD_AUTOSPEAK=0 to wait for the Ascultă button instead.
    autoSpeak: process.env.SCAM_SHIELD_AUTOSPEAK !== '0',
    unseen: state.history.filter((h) => !h.seen && h.result.verdict === 'SCAM').length,
    history: state.history
  };
}
function push() {
  const snap = snapshot();
  for (const w of [pill, pane]) if (w && !w.isDestroyed()) w.webContents.send('shield:state', snap);
  if (SNAP_DIR) debugSnapshot();
}

/* Debug only: SCAM_SHIELD_SNAPSHOT_DIR=<folder> saves PNGs of both windows after each change. */
const SNAP_DIR = process.env.SCAM_SHIELD_SNAPSHOT_DIR || null;
let snapTimer = null, snapCount = 0;
function debugSnapshot() {
  clearTimeout(snapTimer);
  snapTimer = setTimeout(async () => {
    snapCount += 1;
    fs.mkdirSync(SNAP_DIR, { recursive: true });
    for (const [name, w] of [['pill', pill], ['pane', pane]]) {
      if (!w || w.isDestroyed() || !w.isVisible()) continue;
      const img = await w.webContents.capturePage();
      fs.writeFileSync(path.join(SNAP_DIR, String(snapCount).padStart(2, '0') + '-' + name + '.png'), img.toPNG());
    }
  }, 700);
}

function lockDown(win) {
  // The windows only ever show our own files: no navigation, no new windows.
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

function createPill() {
  const area = screen.getPrimaryDisplay().workArea;
  pill = new BrowserWindow({
    width: PILL_W, height: PILL_H,
    x: Math.round(area.x + (area.width - PILL_W) / 2), y: area.y + 8,
    frame: false, transparent: true, resizable: false, movable: false, hasShadow: false,
    alwaysOnTop: true, skipTaskbar: true, focusable: true, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false }
  });
  pill.setAlwaysOnTop(true, 'screen-saver');
  pill.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  pill.setIgnoreMouseEvents(true, { forward: true }); // clicks pass through the transparent area
  lockDown(pill);
  pill.loadFile(path.join(__dirname, 'renderer', 'pill.html'));
  pill.once('ready-to-show', () => { pill.showInactive(); push(); });
}

function createPane() {
  const area = screen.getPrimaryDisplay().workArea;
  const w = 460, h = Math.min(760, area.height - 96);
  pane = new BrowserWindow({
    width: w, height: h, minWidth: 380, minHeight: 420,
    x: area.x + area.width - w - 16, y: area.y + 80,
    frame: false, alwaysOnTop: true, skipTaskbar: false, show: false,
    title: 'Scam Shield', backgroundColor: '#0f1716',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false }
  });
  pane.setAlwaysOnTop(true, 'floating');
  lockDown(pane);
  pane.loadFile(path.join(__dirname, 'renderer', 'pane.html'));
  pane.on('close', (e) => { if (!app.isQuitting) { e.preventDefault(); pane.hide(); } });
  pane.on('focus', () => markSeen(state.selectedId));
  pane.webContents.once('did-finish-load', push);
}

function showPane(focus) {
  if (!pane) return;
  if (focus) { pane.show(); pane.focus(); } else if (!pane.isVisible()) pane.showInactive();
}

function markSeen(id) {
  const item = state.history.find((h) => h.id === id);
  if (item && !item.seen) { item.seen = true; push(); }
}

function onIncoming(e) {
  state.activity = { kind: 'checking', channel: e.channel, at: Date.now() };
  push();
}

function onResult(e) {
  state.checked += 1;
  const r = e.result;
  let item = state.history.find((h) => h.threadId === e.thread_id);
  if (!item) {
    item = { id: crypto.randomUUID(), threadId: e.thread_id, seen: true };
  } else {
    state.history = state.history.filter((h) => h !== item);
  }
  Object.assign(item, { at: e.at, channel: e.channel, sender: e.sender, n: e.n, result: r });
  // Only a scam interrupts. Safe and suspicious messages go quietly into the history.
  const isAlert = e.raised && r.verdict === 'SCAM';
  // alertAt orders the alert queue: the pill shows the OLDEST unseen alert first, so a new scam arriving
  // while one is being read waits its turn instead of replacing it mid-sentence.
  if (isAlert) { item.seen = false; item.alertAt = item.alertAt || Date.now(); }
  state.history.unshift(item);
  state.history = state.history.slice(0, MAX_HISTORY);

  // The island cascades down by itself (pill.js); that is the one interruption.
  // No pane popping open and no system notification on top of it.
  if (isAlert) state.selectedId = item.id;
  push();
  if (isAlert && e2eHook) e2eHook();
}

/* ---------- IPC from the windows ---------- */

ipcMain.on('shield:pill-hover', (_e, over) => {
  if (pill && !pill.isDestroyed()) pill.setIgnoreMouseEvents(!over, { forward: true });
});
ipcMain.on('shield:open-pane', (_e, id) => {
  if (typeof id === 'string') state.selectedId = id;
  else {
    const firstUnseen = state.history.find((h) => !h.seen && h.result.verdict === 'SCAM');
    if (firstUnseen) state.selectedId = firstUnseen.id;
  }
  showPane(true);
  markSeen(state.selectedId);
  push();
});
ipcMain.on('shield:toggle-pane', () => {
  // An unseen alert always opens; otherwise the pill toggles the pane like a dock icon.
  const unseen = state.history.some((h) => !h.seen && h.result.verdict === 'SCAM');
  if (!unseen && pane.isVisible()) pane.hide();
  else ipcMain.emit('shield:open-pane', {}, null);
});
/* "Vezi tot": the full-screen state, one alert, everything in one calm view. */
ipcMain.on('shield:open-full', (_e, id) => {
  if (typeof id === 'string') state.selectedId = id;
  markSeen(state.selectedId);
  state.paneFull = true;
  pane.setBounds(screen.getPrimaryDisplay().workArea);
  showPane(true);
  push();
});
ipcMain.on('shield:restore-pane', () => {
  state.paneFull = false;
  const area = screen.getPrimaryDisplay().workArea;
  const w = 460, h = Math.min(760, area.height - 96);
  pane.setBounds({ x: area.x + area.width - w - 16, y: area.y + 80, width: w, height: h });
  push();
});
ipcMain.on('shield:hide-pane', () => {
  if (!pane) return;
  pane.hide();
  if (state.paneFull) ipcMain.emit('shield:restore-pane');
});
ipcMain.on('shield:select', (_e, id) => { if (typeof id === 'string') { state.selectedId = id; markSeen(id); push(); } });
ipcMain.on('shield:dismiss-all', () => { state.history.forEach((h) => { h.seen = true; }); push(); });
/* Close ONE alert; the next one in the queue (if any) cascades in. */
ipcMain.on('shield:dismiss', (_e, id) => { if (typeof id === 'string') markSeen(id); });
ipcMain.on('shield:clear-history', () => { state.history = []; state.selectedId = null; push(); });
ipcMain.on('shield:quit', () => { app.isQuitting = true; app.quit(); });
ipcMain.handle('shield:integration', () => ({ port: PORT, token, url: 'http://127.0.0.1:' + PORT }));
ipcMain.on('shield:copy', (_e, text) => { if (typeof text === 'string' && text.length < 4000) clipboard.writeText(text); });
ipcMain.on('shield:call', (_e, number) => {
  // Only digits, spaces and a leading +: the number always comes from the official catalog.
  if (typeof number === 'string' && /^\+?[0-9 ]{6,20}$/.test(number)) shell.openExternal('tel:' + number.replace(/\s/g, ''));
});
ipcMain.on('shield:share', (_e, text) => {
  if (typeof text === 'string' && text.length < 500) shell.openExternal('https://wa.me/?text=' + encodeURIComponent(text));
});

/*
 * The cat's voice: always Romanian, female whenever possible.
 *   1. Azure "Alina" (ro-RO-AlinaNeural, female, natural) when AZURE_SPEECH_KEY and AZURE_SPEECH_REGION are set.
 *      Only the app's own warning text is sent (verdict, reasons, the action), never the message itself.
 *   2. The Windows Romanian voice through the system speech API (core/tts.ps1), a female one if installed.
 *      Windows ships only "Andrei" (male); Electron's own speech can't see it, so we ask Windows directly.
 * Text goes to PowerShell on stdin, never on the command line. Results are cached per text.
 * Returns { url, voice, female } or null (the window then falls back to the browser's speech).
 */
const AZURE_KEY = process.env.AZURE_SPEECH_KEY || null;
const AZURE_REGION = process.env.AZURE_SPEECH_REGION || null;
const AZURE_VOICE = process.env.AZURE_SPEECH_VOICE || 'ro-RO-AlinaNeural';

function xmlEscape(s) { return s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c])); }

async function azureTts(text) {
  if (!AZURE_KEY || !AZURE_REGION || !/^[a-z0-9]+$/i.test(AZURE_REGION)) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch('https://' + AZURE_REGION + '.tts.speech.microsoft.com/cognitiveservices/v1', {
      method: 'POST', signal: ctrl.signal,
      headers: {
        'Ocp-Apim-Subscription-Key': AZURE_KEY,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'riff-24khz-16bit-mono-pcm',
        'User-Agent': 'scam-shield-desktop'
      },
      body: "<speak version='1.0' xml:lang='ro-RO'><voice name='" + xmlEscape(AZURE_VOICE) + "'><prosody rate='-8%'>" + xmlEscape(text) + '</prosody></voice></speak>'
    });
    if (!res.ok) { console.error('Azure speech: HTTP ' + res.status); return null; }
    const buf = Buffer.from(await res.arrayBuffer());
    return { url: 'data:audio/wav;base64,' + buf.toString('base64'), voice: AZURE_VOICE + ' (Azure)', female: true };
  } catch (e) {
    console.error('Azure speech: ' + e.message);
    return null;
  } finally { clearTimeout(timer); }
}

function windowsTts(text) {
  if (process.platform !== 'win32') return Promise.resolve(null);
  return new Promise((resolve) => {
    const { spawn } = require('child_process');
    const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'core', 'tts.ps1')], { windowsHide: true });
    let out = '';
    const timer = setTimeout(() => ps.kill(), 20000);
    ps.stdout.on('data', (d) => { out += d; });
    ps.on('error', () => { clearTimeout(timer); resolve(null); });
    ps.on('close', (code) => {
      clearTimeout(timer);
      const [name, gender, b64] = out.trim().split('|');
      resolve(code === 0 && b64 && b64.length > 100 ? { url: 'data:audio/wav;base64,' + b64, voice: name, female: gender === 'Female' } : null);
    });
    ps.stdin.end(text, 'utf8');
  });
}

const ttsCache = new Map();
ipcMain.handle('shield:tts', (_e, text) => {
  if (typeof text !== 'string' || !text.trim() || text.length > 1500) return null;
  if (ttsCache.has(text)) return ttsCache.get(text);
  const job = azureTts(text).then((r) => r || windowsTts(text)).then((r) => { if (!r) ttsCache.delete(text); return r; });
  ttsCache.set(text, job);
  if (ttsCache.size > 30) ttsCache.delete(ttsCache.keys().next().value);
  return job;
});

/* ---------- Start ---------- */

let e2eHook = null; // testing only: see tools/e2e.js

app.whenReady().then(async () => {
  token = loadToken();
  createPill();
  createPane();
  if (process.env.SCAM_SHIELD_E2E) e2eHook = require('./tools/e2e')({ pill, getPane: () => pane, dir: process.env.SCAM_SHIELD_E2E });
  const server = createShieldServer({ port: PORT, token, onResult, onIncoming });
  try {
    await server.listen();
    state.status = 'listening';
    console.log('Scam Shield is listening on http://127.0.0.1:' + PORT);
    console.log('Token file: ' + path.join(app.getPath('userData'), 'token.txt'));
  } catch (err) {
    state.status = 'error';
    state.error = err.code === 'EADDRINUSE' ? 'Portul ' + PORT + ' este ocupat' : 'Nu pot porni serverul';
    console.error(err.message);
  }
  push();
  app.on('before-quit', () => { app.isQuitting = true; server.close(); });
  if (DEMO && state.status === 'listening') runDemo().catch((e) => console.error('Demo stopped: ' + e.message));
});

/* The demo plays real validation scenarios through the same port a provider would use. */
async function runDemo() {
  const folder = path.resolve(__dirname, '..', 'validation_set');
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const post = (body) => fetch('http://127.0.0.1:' + PORT + '/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify(body)
  });
  // A genuine SMS and a suspicious one stay quiet; the "new number" thread lights up at message 5;
  // the fake bank SMS adds a second alert (+1 on the pill).
  const plan = [['V03', 1500], ['V09', 1500], ['V04', 1800], ['V01', 1500]];
  await wait(2000);
  for (const [id, gap] of plan) {
    const sc = JSON.parse(fs.readFileSync(path.join(folder, id + '.json'), 'utf8'));
    for (const m of sc.messages) {
      await post({ thread_id: 'demo-' + id, channel: sc.channel, sender: sc.sender, from: m.from, text: m.text });
      await wait(gap);
    }
    await wait(2500);
  }
}

app.on('second-instance', () => showPane(true));
app.on('window-all-closed', (e) => e.preventDefault && e.preventDefault());
