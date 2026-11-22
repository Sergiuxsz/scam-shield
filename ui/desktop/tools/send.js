#!/usr/bin/env node
/*
 * Provider simulator: plays scenarios into Scam Shield message by message,
 * the way an SMS gateway or WhatsApp bot would, so you can demo the pill.
 *
 *   node tools/send.js                    V04 thread, then a genuine bank SMS (V03)
 *   node tools/send.js path/to/V07.json   one scenario
 *   node tools/send.js path/to/folder     every .json in a folder
 *   node tools/send.js --text "Felicitări! Ați câștigat..."   one SMS
 *
 * Options: --delay 2500 (ms between messages), --port 7777, --token <token>
 * The token is read from SCAM_SHIELD_TOKEN or from the file the app writes on first start.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const args = process.argv.slice(2);
function opt(name, def) { const i = args.indexOf('--' + name); if (i < 0) return def; const v = args[i + 1]; args.splice(i, 2); return v; }
const delay = Number(opt('delay', 2500));
const port = Number(opt('port', process.env.SCAM_SHIELD_PORT || 7777));
const text = opt('text', null);
const tokenArg = opt('token', null);

function tokenFile() {
  const base = process.env.APPDATA
    || (process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Application Support') : path.join(os.homedir(), '.config'));
  return path.join(base, 'scam-shield-desktop', 'token.txt');
}
const token = tokenArg || process.env.SCAM_SHIELD_TOKEN || (fs.existsSync(tokenFile()) ? fs.readFileSync(tokenFile(), 'utf8').trim() : null);
if (!token) { console.error('No token. Start the app once (npm start), or pass --token / SCAM_SHIELD_TOKEN.'); process.exit(1); }

const kit = path.resolve(__dirname, '..', '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function post(body) {
  const res = await fetch('http://127.0.0.1:' + port + '/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify(body)
  });
  const json = await res.json();
  if (!res.ok) throw new Error(res.status + ' ' + json.error);
  return json;
}

async function play(sc) {
  const threadId = 'demo-' + sc.id + '-' + Date.now();
  console.log('\n' + sc.id + ' (' + sc.channel + ')');
  for (const m of sc.messages) {
    const r = await post({ thread_id: threadId, channel: sc.channel, sender: sc.sender, from: m.from, text: m.text });
    console.log('  #' + m.n + ' ' + m.from.padEnd(6) + ' → ' + r.verdict.padEnd(10) + ' score ' + String(r.risk_score).padStart(3) + (r.raised && r.verdict === 'SCAM' ? '  ← pill lights up' : ''));
    await sleep(delay);
  }
}

(async () => {
  try {
    if (text) {
      const r = await post({ channel: 'sms', sender: { address: '+40 7xx xxx 000' }, text });
      console.log(r.verdict, r.scam_type, r.risk_score, '\n' + r.warning);
      return;
    }
    let files;
    if (args[0]) {
      const p = path.resolve(args[0]);
      files = fs.statSync(p).isDirectory() ? fs.readdirSync(p).filter((f) => f.endsWith('.json')).sort().map((f) => path.join(p, f)) : [p];
    } else {
      files = ['V04.json', 'V03.json'].map((f) => path.join(kit, 'validation_set', f));
    }
    for (const f of files) await play(JSON.parse(fs.readFileSync(f, 'utf8')));
  } catch (e) {
    console.error(e.cause && e.cause.code === 'ECONNREFUSED' ? 'Scam Shield is not running on port ' + port + '. Start it with: npm start' : e.message);
    process.exit(1);
  }
})();
