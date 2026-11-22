# Scam Shield desktop: the background listener

Scam Shield runs quietly in the background with a small pill at the top of the screen. Any message provider (an SMS gateway, a mail hook, a WhatsApp bot, a chat app) sends incoming messages to a local port. The pill:

| State | What the pill shows |
| --- | --- |
| Listening | The cat sits calmly and blinks · "Scam Shield · ascult · N verificate" |
| A message arrives | Her eyes follow it for a moment. No text, no colour: nothing to read. |
| Safe or suspicious | Nothing changes. The conversation goes quietly into **Istoric**. |
| Scam | The pill lights up and cascades down into a card. The cat, holding the stop sign, gives up to three short reasons one at a time; then **▶ Ascultă** reads the verdict, the reasons and the one thing to do aloud (the reason being spoken lights up, the cat's mouth moves), and **Vezi tot** opens the full-screen view: verdict, action, reasons and the message with the dangerous phrases marked. This card is the only interruption: no pane popping open, no system notification. |

**The voice is female whenever possible.** Windows ships only one Romanian voice, "Microsoft Andrei", and it is male. For the female voice "Alina" (Azure, natural), set these before `npm start`; the free tier covers 500,000 characters a month:

```
$env:AZURE_SPEECH_KEY = "<key from your Azure Speech resource>"
$env:AZURE_SPEECH_REGION = "westeurope"
```

Only the app's own warning text is sent to Azure (the verdict, reasons and action), never the message itself; declare it as a service you use. Without a key the app uses Andrei. The pane's **Integrare** tab says which voice is in use. Never put the key in a file in this folder.

**"Ascultă" needs a Romanian voice in Windows:** Settings › Time & language › Speech › Add voices › Romanian ("Microsoft Andrei"). It is a modern Windows voice that Electron's own speech can't see, so the app asks Windows for the audio directly (`core/tts.ps1`, through the system speech API; the text goes in on stdin). The audio is prepared as soon as the alert appears, so ▶ plays instantly. Without a Romanian voice it falls back to the browser speech. The pane's **Integrare** tab shows which voice is used. The audio starts only when the person taps play, so the warning is never read aloud to a room unasked.

Only scams interrupt. Suspicious conversations are still in the history, marked "Atenție". The API's `raised` field still reports every level change, so a provider can treat SUSPICIOUS its own way.

The pane shows the warning, the one action (official number only), "De ce?" highlights, read-aloud, the history of checked conversations, and an **Integrare** tab with the port and token. Hiding the pane (**Ascunde**) never stops the listening. To stop Scam Shield: **Integrare → Stop Scam Shield**.

## Run

```
cd desktop
npm install
npm start
```

To just see the alerts, run `npm run preview` instead. It opens the app and plays a demo on its own: a genuine SMS and a suspicious one arrive quietly, then the "new number" conversation lights the pill at message 5, then a fake bank SMS adds a second alert. Preview runs as a separate, clearly labelled instance on port 7790, so its test alerts never mix with the real listener. `npm start` never shows demo alerts.

Or, with `npm start` running, in a second terminal play a demo conversation into it (V04 arrives message by message, then a genuine bank SMS):

```
npm run demo
```

Other demos: `node tools/send.js ../validation_set/V07.json`, a whole folder `node tools/send.js ../validation_set`, or one SMS `node tools/send.js --text "Felicitări! Ați câștigat un telefon"`. Use `--delay 1500` to speed it up.

## Integrate a provider

Base URL: `http://127.0.0.1:7777` (change with the `SCAM_SHIELD_PORT` environment variable).

**Authentication:** every call except `/v1/health` needs the token: `Authorization: Bearer <token>`. If the provider can't set headers (some webhook tools), it can use `?token=<token>` instead. The token is created on first start, shown in the pane's **Integrare** tab, and stored in `%APPDATA%\scam-shield-desktop\token.txt` (macOS: `~/Library/Application Support/scam-shield-desktop/`). Set `SCAM_SHIELD_TOKEN` to choose your own.

### `POST /v1/messages`: one incoming message

```json
{
  "channel": "whatsapp",
  "thread_id": "wa-+40700000318",
  "sender": { "name": null, "address": "+40 7xx xxx 318", "known_contact": false },
  "from": "sender",
  "text": "Mami, poți să-mi faci tu un transfer de 1.850 lei?"
}
```

| Field | Required | Notes |
| --- | --- | --- |
| `text` | yes | Up to 10,000 characters. |
| `channel` | no | `sms`, `whatsapp`, `email`, `chat` or `call_transcript`. Default `sms`. |
| `thread_id` | no | Messages with the same id are one conversation and are scored together. Default: channel + sender address. |
| `sender` | no | Same shape as the brief's scenario files. |
| `from` | no | `sender` (default) or `reader`, for the protected person's own replies. |

Answer:

```json
{
  "thread_id": "wa-+40700000318", "n": 5, "raised": true,
  "verdict": "SCAM", "scam_type": "FAMILY_EMERGENCY", "risk_score": 60, "first_alert": 5,
  "red_flags": ["RF_NEW_NUMBER", "RF_PAYMENT_REQUEST", "RF_URGENCY"],
  "warning": "Cineva de pe un număr nou se dă drept copilul dumneavoastră și cere bani urgent. …",
  "action": { "label": "Sunați-l pe Andrei la numărul vechi", "detail": "…", "tel": null },
  "messages": [{ "n": 1, "from": "sender", "text": "…", "red_flags": ["RF_NEW_NUMBER"], "spans": [], "risk_score": 20 }],
  "engine": "rules"
}
```

`raised` is true when this message raised the conversation's level (SAFE → SUSPICIOUS → SCAM). That's when the pill lights up. The provider can use it to hold or flag the message in its own UI.

### Other endpoints

| Call | What it does |
| --- | --- |
| `POST /v1/analyze` | A whole scenario in the brief's format; returns the same answer without keeping state. Add `"notify": true` to also light the pill. |
| `GET /v1/events` | A Server-Sent Events stream of every result, for other UIs (a dashboard, a logger). |
| `DELETE /v1/threads/{thread_id}` | Forget a conversation. |
| `GET /v1/health` | `{ "ok": true }`, no token needed. |

### Examples

```bash
curl -X POST http://127.0.0.1:7777/v1/messages \
  -H "Authorization: Bearer $SCAM_SHIELD_TOKEN" -H "Content-Type: application/json" \
  -d '{"channel":"sms","sender":{"address":"+40 7xx xxx 552"},"text":"Achitati taxa de 2,99 lei: curierexpres-livrare.info"}'
```

```python
import os, requests
r = requests.post("http://127.0.0.1:7777/v1/messages",
    headers={"Authorization": "Bearer " + os.environ["SCAM_SHIELD_TOKEN"]},
    json={"channel": "email", "sender": {"address": "notificari@anaf-rambursari.net"}, "text": body})
if r.json()["verdict"] != "SAFE": ...
```

```js
const res = await fetch('http://127.0.0.1:7777/v1/messages', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.SCAM_SHIELD_TOKEN}` },
  body: JSON.stringify({ channel: 'chat', thread_id: chatId, sender, text })
});
```

## Security and privacy

- Listens on `127.0.0.1` only: other computers on the network can't reach it. A cloud webhook (Twilio, Meta) needs a tunnel in front of it, and the token then matters even more.
- Rejects requests whose `Host` header isn't `127.0.0.1` or `localhost` (stops DNS-rebinding attacks from web pages).
- Browsers can't call it from another site: it sends no CORS headers, and the `Authorization` header forces a preflight it never approves.
- Messages and history live in memory only. Threads expire after 24 hours; nothing is written to disk except the token.
- Uses the same detector as the web app (`app/src`). Set `SCAM_SHIELD_API_URL` to use your backend instead; the rules detector is the fallback.

## Debug

- `SCAM_SHIELD_SNAPSHOT_DIR=<folder> npm start` saves a PNG of the pill and pane after every change.
- `SCAM_SHIELD_PROFILE=test SCAM_SHIELD_PORT=7788 npm start` runs a second, separate instance (own token and settings) next to the normal one.

## Known limits

- It runs from this folder, not as an installer. Packaging (electron-builder) is a next step.
- The pill is on the primary display only.
- On Windows the OS notification may show "electron" as the app name until the app is packaged.
