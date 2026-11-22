/*
 * Scam Shield integration server.
 *
 * Providers (an SMS gateway, a mail hook, a WhatsApp bot, a chat app) POST each
 * incoming message here. Messages with the same thread_id are one conversation:
 * the whole thread is re-scored on every message, so the alert fires at the right
 * message, not at the end.
 *
 * Security: listens on 127.0.0.1 only, checks the Host header (blocks DNS rebinding),
 * and requires a token on every call except /v1/health and /v1/openapi.json. Nothing is written
 * to disk; threads live in memory and expire.
 *
 * Integration surface (see INTEGRATION.md):
 *   POST /v1/messages                one message, JSON or form-encoded; many field-name aliases accepted
 *   POST /v1/analyze                 a whole scenario, stateless
 *   GET  /v1/threads/{id}            the current verdict of a conversation
 *   DELETE /v1/threads/{id}          forget a conversation
 *   GET  /v1/events                  Server-Sent Events stream of every result
 *   GET|POST /v1/webhooks/whatsapp   WhatsApp Cloud API webhook (verify handshake + messages)
 *   POST /v1/webhooks/twilio         Twilio SMS/WhatsApp webhook (form-encoded), answers empty TwiML
 *   GET  /v1/openapi.json            machine-readable contract
 * Duplicate deliveries (webhook retries) with the same message_id are answered from memory, not re-counted.
 * Behind a tunnel (ngrok, Cloudflare) add its host to SCAM_SHIELD_ALLOWED_HOSTS.
 */
'use strict';

const http = require('http');
const crypto = require('crypto');
const { analyze, forgetCache } = require('./engine');

const VERSION = '1';
const CHANNELS = ['sms', 'whatsapp', 'email', 'chat', 'call_transcript'];
const MAX_BODY = 64 * 1024;
const MAX_TEXT = 10000;
const MAX_THREADS = 500;
const MAX_MESSAGES = 50;
const THREAD_TTL_MS = 24 * 60 * 60 * 1000;
const LEVEL = { SAFE: 0, SUSPICIOUS: 1, SCAM: 2 };

const EXTRA_HOSTS = String(process.env.SCAM_SHIELD_ALLOWED_HOSTS || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
const MAX_SEEN_IDS = 200;

function pick(o, keys) {
  for (const k of keys) {
    const v = k.split('.').reduce((x, p) => (x && x[p] !== undefined ? x[p] : undefined), o);
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

/*
 * Accept the shapes providers actually send, so most of them need no code:
 *   text:      text | body | message | content | msg | Body
 *   channel:   channel | source | platform          (sms, whatsapp, email, chat, call_transcript)
 *   sender:    sender{} | sender (string) | from_number | phone | From
 *   name:      sender.name | sender_name | name | ProfileName
 *   thread:    thread_id | conversation_id | chat_id | metadata.thread_id
 *   id:        message_id | id | MessageSid | metadata.message_id   (duplicates are ignored)
 *   who wrote: from = "sender" | "reader"  (also direction = "inbound" | "outbound")
 */
function normalizeMessage(b) {
  const text = pick(b, ['text', 'body', 'message', 'content', 'msg', 'Body']);
  const rawSender = b.sender && typeof b.sender === 'object' ? b.sender : {};
  const address = rawSender.address || (typeof b.sender === 'string' ? b.sender : undefined) || pick(b, ['from_number', 'phone', 'From', 'address']);
  const direction = String(pick(b, ['from', 'direction']) || 'sender').toLowerCase();
  let channel = String(pick(b, ['channel', 'source', 'platform']) || '').toLowerCase();
  if (!channel && /^whatsapp:/i.test(String(address || ''))) channel = 'whatsapp';
  return {
    text: typeof text === 'number' ? String(text) : text,
    channel: CHANNELS.includes(channel) ? channel : (channel === 'call' ? 'call_transcript' : 'sms'),
    sender: {
      name: rawSender.name || pick(b, ['sender_name', 'name', 'ProfileName']),
      address: address ? String(address).replace(/^whatsapp:/i, '') : undefined,
      known_contact: rawSender.known_contact === true || b.known_contact === true || b.known_contact === 'true'
    },
    from: direction === 'reader' || direction === 'outbound' ? 'reader' : 'sender',
    thread_id: pick(b, ['thread_id', 'conversation_id', 'chat_id', 'metadata.thread_id']),
    message_id: pick(b, ['message_id', 'id', 'MessageSid', 'SmsSid', 'metadata.message_id'])
  };
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function publicResult(r, extra) {
  return Object.assign({
    id: r.id,
    verdict: r.verdict,
    scam_type: r.scamType,
    risk_score: r.score,
    first_alert: r.firstAlert,
    red_flags: r.flags,
    warning: r.warning,
    warning_lines: r.lines || [],
    action_line: r.actionLine,
    reasons: r.reasons || [],
    action: r.action ? { label: r.action.label, detail: r.action.detail || null, tel: r.action.tel || null } : null,
    messages: r.messages.map((m) => ({ n: m.n, from: m.from, text: m.text, red_flags: m.flags, spans: m.spans, risk_score: m.score })),
    engine: r.engine
  }, extra || {});
}

function createShieldServer(opts) {
  const port = opts.port;
  const token = opts.token;
  const onResult = opts.onResult || function () {};
  const onIncoming = opts.onIncoming || function () {};
  const threads = new Map(); // thread_id -> { channel, sender, messages, lastVerdict, touched }
  const sse = new Set();
  let analyses = 0;

  function prune() {
    const now = Date.now();
    for (const [id, t] of threads) if (now - t.touched > THREAD_TTL_MS) threads.delete(id);
    while (threads.size > MAX_THREADS) threads.delete(threads.keys().next().value);
    if (++analyses % 500 === 0) forgetCache();
  }

  function send(res, status, body) {
    const json = JSON.stringify(body);
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(json);
  }
  function fail(res, status, message) { send(res, status, { error: message }); }

  function broadcast(event) {
    const line = 'data: ' + JSON.stringify(event) + '\n\n';
    for (const res of sse) res.write(line);
  }

  function readJson(req) {
    return new Promise((resolve, reject) => {
      const type = String(req.headers['content-type'] || '');
      const form = type.includes('application/x-www-form-urlencoded');
      if (!type.includes('application/json') && !form) return reject(Object.assign(new Error('Content-Type must be application/json or application/x-www-form-urlencoded'), { status: 415 }));
      let size = 0;
      const chunks = [];
      req.on('data', (c) => {
        size += c.length;
        if (size > MAX_BODY) { reject(Object.assign(new Error('Body larger than 64 KB'), { status: 413 })); req.destroy(); return; }
        chunks.push(c);
      });
      req.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        if (form) return resolve(Object.fromEntries(new URLSearchParams(raw)));
        try { resolve(JSON.parse(raw || '{}')); }
        catch (e) { reject(Object.assign(new Error('Body is not valid JSON'), { status: 400 })); }
      });
      req.on('error', reject);
    });
  }

  function cleanSender(s) {
    s = s && typeof s === 'object' ? s : {};
    const str = (v) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 200) : null);
    return { name: str(s.name), address: str(s.address), known_contact: s.known_contact === true };
  }

  /* POST /v1/messages: one message from a provider. */
  async function ingest(raw) {
    const body = normalizeMessage(raw || {});
    if (typeof body.text !== 'string') throw Object.assign(new Error('"text" (string) is required (also accepted: body, message, content)'), { status: 422 });
    const channel = body.channel;
    const sender = cleanSender(body.sender);
    const from = body.from;
    const threadId = typeof body.thread_id === 'string' && body.thread_id.trim()
      ? body.thread_id.trim().slice(0, 200)
      : channel + ':' + (sender.address || sender.name || crypto.randomUUID());

    let t = threads.get(threadId);
    if (!t) { t = { channel, sender, messages: [], lastVerdict: 'SAFE', touched: 0, seenIds: new Map() }; threads.set(threadId, t); }
    const msgId = body.message_id != null ? String(body.message_id).slice(0, 200) : null;
    if (msgId && t.seenIds.has(msgId)) return Object.assign({}, await t.seenIds.get(msgId), { duplicate: true });
    if (from === 'sender' && (sender.name || sender.address)) t.sender = sender;
    t.messages.push({ n: t.messages.length + 1, from, text: body.text.slice(0, MAX_TEXT) });
    if (t.messages.length > MAX_MESSAGES) t.messages.splice(0, t.messages.length - MAX_MESSAGES);
    t.messages.forEach((m, i) => { m.n = i + 1; });
    t.touched = Date.now();
    threads.delete(threadId); threads.set(threadId, t); // most recent last
    prune();

    onIncoming({ channel: t.channel, thread_id: threadId, from });
    // Messages of one thread are analysed strictly in arrival order (a per-thread queue), each on a snapshot
    // of the thread at its arrival. Without this, two quick messages race and an older result can land after
    // a newer one (wrong "raised", wrong first alert). Different threads still run in parallel.
    const snapshot = { id: threadId, channel: t.channel, sender: Object.assign({}, t.sender), messages: t.messages.map((m) => Object.assign({}, m)) };
    const run = async () => {
      const r = await analyze(snapshot);
      const raised = LEVEL[r.verdict] > LEVEL[t.lastVerdict];
      if (raised) t.lastVerdict = r.verdict;
      const out = publicResult(r, { thread_id: threadId, n: snapshot.messages.length, raised });
      const event = { type: 'result', at: new Date().toISOString(), channel: t.channel, sender: t.sender, thread_id: threadId, n: out.n, raised, result: out };
      onResult(event);
      broadcast(event);
      return out;
    };
    const job = (t.chain || Promise.resolve()).then(run, run);
    t.chain = job.catch(() => {});
    if (msgId) {
      t.seenIds.set(msgId, job);
      if (t.seenIds.size > MAX_SEEN_IDS) t.seenIds.delete(t.seenIds.keys().next().value);
    }
    return job;
  }

  /* POST /v1/analyze: a whole scenario in the brief's format, no state kept. */
  async function analyzeScenario(body) {
    if (!Array.isArray(body.messages)) throw Object.assign(new Error('"messages" (array) is required'), { status: 422 });
    const r = await analyze(body);
    const out = publicResult(r);
    if (body.notify === true) {
      const event = { type: 'result', at: new Date().toISOString(), channel: r.channel, sender: r.sender, thread_id: 'scenario:' + r.id, n: r.messages.length, raised: r.verdict !== 'SAFE', result: out };
      onResult(event);
      broadcast(event);
    }
    return out;
  }

  /* WhatsApp Cloud API: entry[].changes[].value.{contacts[], messages[]}. Only text messages are analysed;
     statuses (sent/delivered/read) are acknowledged and ignored. Meta retries until it gets a 200. */
  async function whatsappWebhook(b) {
    let analysed = 0;
    const results = [];
    for (const entry of (b.entry || [])) for (const change of (entry.changes || [])) {
      const v = change.value || {};
      const names = Object.fromEntries((v.contacts || []).map((c) => [c.wa_id, c.profile && c.profile.name]));
      for (const m of (v.messages || [])) {
        const text = (m.text && m.text.body) || (m.button && m.button.text) ||
          (m.interactive && ((m.interactive.button_reply || m.interactive.list_reply || {}).title));
        if (typeof text !== 'string') continue;
        const out = await ingest({ text, channel: 'whatsapp', message_id: m.id, thread_id: 'whatsapp:' + m.from,
          sender: { address: '+' + String(m.from).replace(/^\+/, ''), name: names[m.from] } });
        analysed += 1;
        results.push({ message_id: m.id, thread_id: out.thread_id, verdict: out.verdict, raised: out.raised, duplicate: !!out.duplicate });
      }
    }
    return { received: true, analysed, results };
  }

  const server = http.createServer(async (req, res) => {
    try {
      const host = String(req.headers.host || '');
      if (host !== '127.0.0.1:' + port && host !== 'localhost:' + port && !EXTRA_HOSTS.includes(host.toLowerCase())) {
        return fail(res, 421, 'Unexpected Host header. Behind a tunnel? Add it to SCAM_SHIELD_ALLOWED_HOSTS.');
      }

      const url = new URL(req.url, 'http://127.0.0.1:' + port);
      if (req.method === 'GET' && url.pathname === '/v1/health') {
        return send(res, 200, { ok: true, version: VERSION, threads: threads.size });
      }
      if (req.method === 'GET' && url.pathname === '/v1/openapi.json') return send(res, 200, openapi(port));
      // WhatsApp Cloud API verification handshake: Meta calls GET with hub.verify_token = your Scam Shield token.
      if (req.method === 'GET' && url.pathname === '/v1/webhooks/whatsapp') {
        if (url.searchParams.get('hub.mode') === 'subscribe' && safeEqual(url.searchParams.get('hub.verify_token'), token)) {
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          return res.end(String(url.searchParams.get('hub.challenge') || ''));
        }
        return fail(res, 403, 'Verification failed: hub.verify_token must be your Scam Shield token');
      }

      const auth = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '') || req.headers['x-scam-shield-token'] || url.searchParams.get('token');
      if (!safeEqual(auth, token)) return fail(res, 401, 'Missing or wrong token. Send "Authorization: Bearer <token>".');

      if (req.method === 'POST' && url.pathname === '/v1/messages') return send(res, 200, await ingest(await readJson(req)));
      if (req.method === 'POST' && url.pathname === '/v1/webhooks/whatsapp') return send(res, 200, await whatsappWebhook(await readJson(req)));
      if (req.method === 'POST' && url.pathname === '/v1/webhooks/twilio') {
        const b = await readJson(req);
        await ingest({ text: b.Body, sender: { address: b.From, name: b.ProfileName }, channel: /^whatsapp:/i.test(String(b.From || '')) ? 'whatsapp' : 'sms', message_id: b.MessageSid || b.SmsSid });
        res.writeHead(200, { 'Content-Type': 'text/xml' });
        return res.end('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
      }
      if (req.method === 'GET' && url.pathname.startsWith('/v1/threads/')) {
        const id = decodeURIComponent(url.pathname.slice('/v1/threads/'.length));
        const t = threads.get(id);
        if (!t) return fail(res, 404, 'No such thread');
        return send(res, 200, { thread_id: id, channel: t.channel, sender: t.sender, messages: t.messages.length, verdict: t.lastVerdict });
      }
      if (req.method === 'POST' && url.pathname === '/v1/analyze') return send(res, 200, await analyzeScenario(await readJson(req)));
      if (req.method === 'DELETE' && url.pathname.startsWith('/v1/threads/')) {
        const id = decodeURIComponent(url.pathname.slice('/v1/threads/'.length));
        return send(res, 200, { deleted: threads.delete(id) });
      }
      if (req.method === 'GET' && url.pathname === '/v1/events') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
        res.write(': connected\n\n');
        sse.add(res);
        req.on('close', () => sse.delete(res));
        return;
      }
      return fail(res, 404, 'No such endpoint. See GET /v1/openapi.json');
    } catch (err) {
      return fail(res, err.status || 500, err.status ? err.message : 'Internal error');
    }
  });

  return {
    listen() {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', () => { server.off('error', reject); resolve(); });
      });
    },
    close() { for (const res of sse) res.end(); return new Promise((r) => server.close(() => r())); },
    forgetThreads() { threads.clear(); }
  };
}

/* Minimal OpenAPI 3 contract, so integrators can generate a client or import it into Postman. */
function openapi(port) {
  const result = { type: 'object', properties: {
    thread_id: { type: 'string' }, n: { type: 'integer', description: 'messages in the thread so far' },
    raised: { type: 'boolean', description: 'true when THIS message raised the level (SAFE to SUSPICIOUS to SCAM): alert the user now' },
    duplicate: { type: 'boolean', description: 'same message_id already received; nothing was re-counted' },
    verdict: { type: 'string', enum: ['SAFE', 'SUSPICIOUS', 'SCAM'] }, scam_type: { type: 'string' },
    risk_score: { type: 'integer', minimum: 0, maximum: 100 }, first_alert: { type: 'integer', nullable: true },
    red_flags: { type: 'array', items: { type: 'string' } },
    warning: { type: 'string', description: 'Romanian warning, at most 3 short sentences' },
    warning_lines: { type: 'array', items: { type: 'string' } },
    action: { type: 'object', nullable: true, properties: { label: { type: 'string' }, tel: { type: 'string', description: 'official number from the catalog, never from the message' } } } } };
  const msg = { type: 'object', required: ['text'], properties: {
    text: { type: 'string', maxLength: 10000, description: 'also accepted: body, message, content' },
    channel: { type: 'string', enum: CHANNELS, description: 'also accepted: source, platform' },
    thread_id: { type: 'string', description: 'same id = same conversation. Default: channel + sender address' },
    message_id: { type: 'string', description: 'provider id; duplicates are ignored (safe for webhook retries)' },
    from: { type: 'string', enum: ['sender', 'reader'] },
    sender: { type: 'object', properties: { name: { type: 'string' }, address: { type: 'string' }, known_contact: { type: 'boolean' } } } } };
  const idParam = [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }];
  return {
    openapi: '3.0.3',
    info: { title: 'Scam Shield local API', version: VERSION, description: 'Send each incoming message; get a verdict, the reasons and a Romanian warning. Runs on this computer only.' },
    servers: [{ url: 'http://127.0.0.1:' + port }],
    components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer' }, token: { type: 'apiKey', in: 'query', name: 'token' } },
      schemas: { Message: msg, Result: result } },
    security: [{ bearer: [] }, { token: [] }],
    paths: {
      '/v1/health': { get: { security: [], summary: 'Is it running?', responses: { 200: { description: 'ok' } } } },
      '/v1/messages': { post: { summary: 'One incoming message (JSON or form-encoded)',
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Message' } }, 'application/x-www-form-urlencoded': { schema: { $ref: '#/components/schemas/Message' } } } },
        responses: { 200: { description: 'verdict for the whole thread so far', content: { 'application/json': { schema: { $ref: '#/components/schemas/Result' } } } } } } },
      '/v1/analyze': { post: { summary: 'A whole scenario in the brief format, stateless', responses: { 200: { description: 'verdict' } } } },
      '/v1/threads/{id}': { get: { summary: 'Current verdict of a conversation', parameters: idParam, responses: { 200: { description: 'thread' } } },
        delete: { summary: 'Forget a conversation', parameters: idParam, responses: { 200: { description: 'deleted' } } } },
      '/v1/events': { get: { summary: 'Server-Sent Events: every result as it happens', responses: { 200: { description: 'text/event-stream' } } } },
      '/v1/webhooks/whatsapp': { get: { summary: 'Meta verification (hub.verify_token = your token)', responses: { 200: { description: 'hub.challenge' } } },
        post: { summary: 'WhatsApp Cloud API webhook payload', responses: { 200: { description: 'analysed messages' } } } },
      '/v1/webhooks/twilio': { post: { summary: 'Twilio SMS / WhatsApp webhook (form-encoded)', responses: { 200: { description: 'empty TwiML' } } } }
    }
  };
}

module.exports = { createShieldServer, normalizeMessage };
