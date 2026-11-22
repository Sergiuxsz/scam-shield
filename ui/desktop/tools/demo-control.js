/*
 * Demo control panel: a local page with one button per demo step.
 * Each button sends REAL messages through the same API a provider (WhatsApp, SMS...) would use,
 * so the pill reacts exactly as it would in real life.
 *
 *   npm start            (the pill, in another terminal)
 *   npm run control      -> opens http://127.0.0.1:7801
 *
 * Reads the pill's token from its settings folder, so nothing needs to be copied by hand.
 * Listens on 127.0.0.1 only.
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');

const PILL = 'http://127.0.0.1:' + (process.env.SCAM_SHIELD_PORT || 7777);
const AI = 'http://127.0.0.1:8000/health';
const PORT = 7801;
const KIT = path.resolve(__dirname, '..', '..');

function readToken() {
  if (process.env.SCAM_SHIELD_TOKEN) return process.env.SCAM_SHIELD_TOKEN;
  const appData = process.env.APPDATA || path.join(os.homedir(), 'Library', 'Application Support');
  for (const dir of ['scam-shield-desktop', 'Scam Shield', 'scam-shield']) {
    try { return fs.readFileSync(path.join(appData, dir, 'token.txt'), 'utf8').trim(); } catch (e) { /* next */ }
  }
  return null;
}
const scenario = (id) => JSON.parse(fs.readFileSync(path.join(KIT, 'validation_set', id + '.json'), 'utf8'));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let log = [];
const note = (s) => { log.push(new Date().toLocaleTimeString('ro-RO') + '  ' + s); log = log.slice(-40); };

async function api(p, body, type = 'json') {
  const token = readToken();
  if (!token) throw new Error('Nu găsesc tokenul pill-ului. Porniți întâi "npm start".');
  const res = await fetch(PILL + p, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': type === 'form' ? 'application/x-www-form-urlencoded' : 'application/json' },
    body: type === 'form' ? new URLSearchParams(body) : JSON.stringify(body)
  });
  const text = await res.text();
  try { return JSON.parse(text); } catch (e) { return { raw: text, status: res.status }; }
}

/* Plays a validation scenario message by message, like a real conversation. */
async function play(id, gap, runId) {
  const sc = scenario(id);
  const thread = 'demo-' + id + '-' + runId;
  for (const m of sc.messages) {
    const r = await api('/v1/messages', { thread_id: thread, channel: sc.channel, sender: sc.sender, from: m.from, text: m.text });
    note(`${id} #${m.n} ${m.from === 'reader' ? '(răspuns)' : ''} → ${r.verdict || r.error}${r.raised ? '  ⚠ ALERTĂ' : ''}`);
    await wait(gap);
  }
}

const ACTIONS = {
  real: () => play('V03', 0, Date.now()),
  family: () => play('V04', 2500, Date.now()),
  burst: async () => { const t = Date.now(); await Promise.all([play('V01', 0, t), play('V02', 0, t), play('V06', 0, t)]); },
  whatsapp: async () => {
    const r = await api('/v1/webhooks/whatsapp', { object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: {
      contacts: [{ profile: { name: 'Maria (vecina)' }, wa_id: '40700000260' }],
      messages: [{ from: '40700000260', id: 'wamid.demo' + Date.now(), type: 'text', text: { body: 'Bună! Ți-am trimis din greșeală un cod de 6 cifre prin SMS. Mi-l poți trimite înapoi, te rog? E urgent!' } }] } }] }] });
    note('WhatsApp webhook → ' + JSON.stringify(r.results || r));
  },
  twilio: async () => {
    await api('/v1/webhooks/twilio', { From: '+40700000552', Body: 'CurierExpres: Coletul dvs. nu a putut fi livrat. Achitați taxa de 2,99 lei: curierexpres-livrare.info', MessageSid: 'SMdemo' + Date.now() }, 'form');
    note('Twilio SMS webhook → trimis');
  }
};

const STEPS = [
  { id: 'real', n: 1, title: 'Un SMS real de la bancă', btn: 'Trimite SMS-ul real (V03)',
    say: 'Un mesaj real cu un cod. Mulți detectori ar alarma aici, pentru că apare cuvântul „cod". Pill-ul rămâne liniștit: nu speriem oamenii pe mesaje adevărate.' },
  { id: 'family', n: 2, title: '„Mami, am număr nou"', btn: 'Pornește conversația (V04, 6 mesaje)',
    say: 'Mesajele 1–4 sunt nevinovate, deci nu se întâmplă nimic. La mesajul 5, cererea de bani, pill-ul se aprinde: întâi ce să faceți, apoi de ce. Apăsați „Ascultă".' },
  { id: 'burst', n: 3, title: 'Trei țepe în aceeași secundă', btn: 'Trimite 3 țepe deodată',
    say: 'Alertele nu se suprapun și nu se taie: intră la rând, „1 din 3", „Următoarea". Fiecare conversație e analizată în ordine.' },
  { id: 'whatsapp', n: 4, title: 'Integrare: WhatsApp', btn: 'Mesaj prin webhook-ul WhatsApp',
    say: 'Același format pe care îl trimite WhatsApp Cloud API. Orice aplicație se conectează cu un singur apel HTTP; nimic nu părăsește laptopul.' },
  { id: 'twilio', n: 5, title: 'Integrare: SMS prin Twilio', btn: 'SMS prin webhook-ul Twilio',
    say: 'Același lucru pentru SMS. Răspundem gol, deci escrocul nu primește nimic înapoi.' }
];

const PAGE = `<!doctype html><html lang="ro"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Scam Shield · Demo</title><style>
:root{--bg:#0b1110;--card:#121a19;--line:#25322f;--ink:#eef3f2;--mut:#93a5a2;--brand:#7cc4d1;--ok:#3fb950;--warn:#d4a72c;--bad:#f0605a}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.45 "Segoe UI",system-ui,sans-serif}
header{display:flex;align-items:center;justify-content:space-between;padding:16px 28px;border-bottom:1px solid var(--line)}
h1{margin:0;font-size:20px}h1 small{display:block;font-size:13px;color:var(--mut);font-weight:500}
.st{display:flex;gap:10px}.chip{display:inline-flex;align-items:center;gap:8px;padding:6px 12px;border:1px solid var(--line);border-radius:10px;font-size:14px;font-weight:600;color:var(--mut)}
.dot{width:9px;height:9px;border-radius:50%;background:var(--mut)}.on .dot{background:var(--ok)}.off .dot{background:var(--bad)}
main{display:grid;grid-template-columns:1fr 360px;gap:24px;padding:24px 28px;max-width:1200px;margin:0 auto}
.step{display:grid;grid-template-columns:44px 1fr auto;gap:16px;align-items:center;padding:18px 20px;margin-bottom:12px;background:var(--card);border:1px solid var(--line);border-radius:14px}
.step.done{border-color:#2c4d3a}.num{width:36px;height:36px;border-radius:10px;display:grid;place-items:center;background:#1b2726;font-weight:800;color:var(--brand)}
.step.done .num{background:#173322;color:var(--ok)}h2{margin:0 0 4px;font-size:18px}.say{margin:0;color:var(--mut);font-size:15px}
button{font:inherit;font-weight:700;font-size:15px;padding:11px 16px;border-radius:10px;border:0;background:var(--brand);color:#06222a;cursor:pointer;white-space:nowrap}
button:disabled{opacity:.5;cursor:wait}button.ghost{background:transparent;color:var(--ink);border:1px solid var(--line)}
aside{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px;align-self:start;position:sticky;top:16px}
aside h3{margin:0 0 10px;font-size:14px;letter-spacing:.06em;text-transform:uppercase;color:var(--mut)}
pre{margin:0;font:13px/1.5 Consolas,monospace;white-space:pre-wrap;color:#cfe;max-height:420px;overflow:auto}
.curl{margin-top:14px;padding:12px;border-radius:10px;background:#0a0f0e;border:1px solid var(--line);font:12px/1.5 Consolas,monospace;color:var(--mut);word-break:break-all}
</style></head><body>
<header><h1>Scam Shield · Demo ghidat<small>Fiecare buton trimite mesaje reale prin API, ca o aplicație parteneră.</small></h1>
<div class="st"><span id="pill" class="chip"><span class="dot"></span>Pill</span><span id="ai" class="chip"><span class="dot"></span>AI</span>
<button class="ghost" onclick="window.open('http://localhost:8765/app/#rezultate')">Dashboard juriu</button></div></header>
<main><section id="steps"></section>
<aside><h3>Ce se întâmplă</h3><pre id="log">—</pre>
<div class="curl">curl -X POST http://127.0.0.1:7777/v1/messages -H "Authorization: Bearer &lt;token&gt;" -H "Content-Type: application/json" -d '{"text":"Achitați taxa de 2,99 lei: curier-taxa.info","sender":"+40 7xx xxx 552"}'</div></aside></main>
<script>
const STEPS=${JSON.stringify(STEPS)};
const box=document.getElementById('steps');
box.innerHTML=STEPS.map(s=>'<div class="step" id="s-'+s.id+'"><span class="num">'+s.n+'</span><div><h2>'+s.title+'</h2><p class="say">'+s.say+'</p></div><button onclick="run(\\''+s.id+'\\',this)">'+s.btn+'</button></div>').join('');
async function run(id,b){b.disabled=true;const t=b.textContent;b.textContent='Se trimite…';
 try{const r=await fetch('/run/'+id,{method:'POST'});const j=await r.json();if(j.error)alert(j.error);document.getElementById('s-'+id).classList.add('done');}
 finally{b.disabled=false;b.textContent=t;}}
async function tick(){try{const s=await (await fetch('/status')).json();
 for(const k of ['pill','ai']){const el=document.getElementById(k);el.className='chip '+(s[k]?'on':'off');el.lastChild.textContent=k==='pill'?(s.pill?' Pill ascultă':' Pill oprit'):(s.ai?' AI activ':' AI oprit');}
 document.getElementById('log').textContent=s.log.slice().reverse().join('\\n')||'—';}catch(e){}}
setInterval(tick,1000);tick();
</script></body></html>`;

async function up(url) { try { return (await fetch(url, { signal: AbortSignal.timeout(1500) })).ok; } catch (e) { return false; } }

http.createServer(async (req, res) => {
  const host = String(req.headers.host || '');
  if (host !== '127.0.0.1:' + PORT && host !== 'localhost:' + PORT) { res.writeHead(421); return res.end(); }
  if (req.method === 'GET' && req.url === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(PAGE); }
  if (req.method === 'GET' && req.url === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ pill: await up(PILL + '/v1/health'), ai: await up(AI), log }));
  }
  const m = req.method === 'POST' && req.url.match(/^\/run\/(\w+)$/);
  if (m && ACTIONS[m[1]]) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    try { await ACTIONS[m[1]](); return res.end('{}'); } catch (e) { note('Eroare: ' + e.message); return res.end(JSON.stringify({ error: e.message })); }
  }
  res.writeHead(404); res.end();
}).listen(PORT, '127.0.0.1', () => {
  const url = 'http://127.0.0.1:' + PORT;
  console.log('Demo control panel: ' + url);
  if (!process.argv.includes('--no-open')) exec((process.platform === 'win32' ? 'start "" ' : process.platform === 'darwin' ? 'open ' : 'xdg-open ') + url);
});
