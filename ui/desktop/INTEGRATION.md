# Integrating Scam Shield

Scam Shield runs on the protected person's computer and listens on a local port. **Any app that can make an
HTTP request can send it messages**: an SMS forwarder on the phone, a WhatsApp webhook, a mail rule, a chat bot,
Zapier/n8n/Make, or your own code. Each message comes back with a verdict, the reasons and a Romanian warning,
and the floating pill alerts the person at the right moment of the conversation.

- Base URL: `http://127.0.0.1:7777` (change with `SCAM_SHIELD_PORT`)
- Token: shown in the app (**Integrare** tab); send it as `Authorization: Bearer <token>`, or `?token=<token>`
  when the tool can't set headers
- Contract: `GET /v1/openapi.json` (import into Postman, or generate a client)
- Messages stay on this computer, in memory only. Nothing is stored on disk or sent anywhere.

## 1. The 30-second version

```bash
curl -X POST http://127.0.0.1:7777/v1/messages \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"text":"Achitati taxa de 2,99 lei: curierexpres-livrare.info","sender":"+40 7xx xxx 552"}'
```

Answer (shortened):

```json
{ "thread_id": "sms:+40 7xx xxx 552", "n": 1, "raised": true,
  "verdict": "SCAM", "scam_type": "COURIER_FEE", "risk_score": 65,
  "warning": "Atenție: acest mesaj pare o tentativă de fraudă. Vi se cer bani, iar linkul din mesaj nu este cel oficial. Nu plătiți nimic; ...",
  "action": { "label": "Sunați la CurierExpres", "tel": "0800 300 400" } }
```

**`raised: true` is the only thing most integrations need**: it means *this* message made the conversation
more dangerous (SAFE → SUSPICIOUS → SCAM), so hold the message, show the warning, or notify someone.

## 2. Send what you already have

`POST /v1/messages` accepts JSON **or** form-encoded, and the field names your tool already uses:

| Meaning | Accepted names |
|---|---|
| message text (required) | `text`, `body`, `message`, `content`, `msg`, `Body` |
| channel | `channel`, `source`, `platform` → `sms`, `whatsapp`, `email`, `chat`, `call_transcript` |
| who sent it | `sender: {name, address, known_contact}`, or `sender` as a string, `from_number`, `phone`, `From` |
| sender's name | `sender.name`, `sender_name`, `name`, `ProfileName` |
| conversation | `thread_id`, `conversation_id`, `chat_id`, `metadata.thread_id` (default: channel + sender) |
| provider's message id | `message_id`, `id`, `MessageSid`, `metadata.message_id` |
| the person's own replies | `from: "reader"` or `direction: "outbound"` |

- **Conversations:** messages with the same thread id are scored together, so "Hi mum, new number" stays
  quiet and the alert fires at the money request, not at the end.
- **Retries are safe:** a repeated `message_id` returns the earlier answer with `"duplicate": true` and is
  not counted twice.
- **Bursts are safe:** messages of one conversation are processed strictly in arrival order, even if they
  arrive at the same instant; different conversations run in parallel.

## 3. Ready-made adapters

### WhatsApp (Meta WhatsApp Cloud API)

1. Expose the port with a tunnel (e.g. `ngrok http 7777`) and allow its host:
   `SCAM_SHIELD_ALLOWED_HOSTS=<your-subdomain>.ngrok.app`.
2. In the Meta developer console → WhatsApp → Configuration → Webhook:
   - Callback URL: `https://<your-subdomain>.ngrok.app/v1/webhooks/whatsapp?token=<token>`
   - Verify token: your Scam Shield token
   - Subscribe to `messages`.
3. Done. Text, button and list replies are analysed; delivery/read statuses are acknowledged and ignored;
   Meta's retries are recognised by `wamid` and not counted twice.

### Twilio (SMS or WhatsApp)

Messaging → your number → "A message comes in" → Webhook, `HTTP POST`:
`https://<your-subdomain>.ngrok.app/v1/webhooks/twilio?token=<token>`. Scam Shield answers with an empty
TwiML `<Response/>`, so nothing is sent back to the scammer.

### Android SMS forwarders (no code)

Apps such as "SMS Forwarder" or Tasker/MacroDroid "HTTP request" actions: method `POST`, URL
`http://<laptop-ip-via-tunnel>/v1/messages?token=<token>`, body:

```json
{ "text": "%sms_body%", "sender": "%sms_from%", "channel": "sms", "message_id": "%sms_id%" }
```

(use your app's own placeholder names; form-encoded works too).

### E-mail

Any mail rule / Zapier / n8n / Google Apps Script that can POST:
`{ "text": "<subject> <body>", "channel": "email", "sender": { "address": "<from>" } }`.

## 4. Code

**Python**

```python
import os, requests
URL, TOKEN = "http://127.0.0.1:7777", os.environ["SCAM_SHIELD_TOKEN"]

def check(text, sender, thread_id=None, message_id=None):
    r = requests.post(f"{URL}/v1/messages", timeout=30,
                      headers={"Authorization": f"Bearer {TOKEN}"},
                      json={"text": text, "sender": sender, "thread_id": thread_id, "message_id": message_id})
    r.raise_for_status()
    return r.json()

res = check("Mami, poți să-mi faci un transfer de 1.850 lei?", "+40 7xx xxx 318", thread_id="wa-318")
if res["raised"]:
    print(res["verdict"], res["warning"])
```

**Node.js**

```js
const res = await fetch('http://127.0.0.1:7777/v1/messages', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.SCAM_SHIELD_TOKEN}` },
  body: JSON.stringify({ text, sender: { address: from }, channel: 'whatsapp', thread_id: chatId, message_id: id })
}).then((r) => r.json());
if (res.raised) showWarning(res.warning, res.action);
```

## 5. Listening to every result (dashboards, loggers)

`GET /v1/events` is a Server-Sent Events stream: one `data:` line per result.

```js
const es = new EventSource('http://127.0.0.1:7777/v1/events?token=' + TOKEN);
es.onmessage = (e) => { const ev = JSON.parse(e.data); if (ev.raised) console.log(ev.thread_id, ev.result.verdict); };
```

## 6. Reference

| Call | What it does |
|---|---|
| `GET /v1/health` | `{ ok: true }` (no token) |
| `GET /v1/openapi.json` | the contract (no token) |
| `POST /v1/messages` | one message → verdict for the conversation so far |
| `POST /v1/analyze` | a whole scenario (brief format), stateless; `"notify": true` also lights the pill |
| `GET /v1/threads/{id}` | current verdict of a conversation |
| `DELETE /v1/threads/{id}` | forget a conversation |
| `GET /v1/events` | Server-Sent Events of every result |
| `GET/POST /v1/webhooks/whatsapp` | WhatsApp Cloud API (verification + messages) |
| `POST /v1/webhooks/twilio` | Twilio SMS / WhatsApp |

Errors are JSON `{ "error": "..." }` with a clear message: `401` token, `415` content type, `413` body over
64 KB, `421` host not allowed, `422` missing text.

## Security

- Listens on `127.0.0.1` only. The `Host` header is checked (blocks DNS rebinding); a tunnel's host must be
  allowed explicitly with `SCAM_SHIELD_ALLOWED_HOSTS`.
- Every call except health and the contract needs the token; comparison is constant-time.
- No CORS: other websites can't call it from a browser.
- Messages live in memory only, threads expire after 24 h, at most 500 threads × 50 messages.
- The warning never repeats a link or number from the message; the call button only ever uses the official
  number from the catalog.
