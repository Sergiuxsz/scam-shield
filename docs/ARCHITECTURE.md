# Architecture

Scam Shield turns one scenario (a single message or a conversation) into the official outputs:
red flags, risk score, verdict, scam type, first alert, and a Romanian warning.

```
                     scenario JSON  {id, channel, sender{name,address,known_contact}, messages[{n,from,text}]}
                            │  loader.py: fills missing fields, never crashes on odd input
                            ▼
      ┌──────────── for each SENDER message n (reader replies count in numbering only) ────────────┐
      │                                                                                            │
      │  rules.py                                   encoder.py                                     │
      │  ├ links / e-mails / phones vs catalog      ├ input: (masked message, context)             │
      │  ├ request patterns + negation              │   context = channel | sender | last 2 msgs   │
      │  ├ claim(): who it says it is               └ fine-tuned XLM-R -> 13 probabilities         │
      │  └ legitimacy(): signs of a genuine notice                                                 │
      │                     │                                    │                                 │
      │                     └──────────► fusion.py ◄─────────────┘                                 │
      │                     rule hits always count; the encoder counts above its per-flag          │
      │                     threshold, unless the message looks genuine                            │
      │                                       │                                                    │
      │            new flags of message n -> added to the thread (each flag counts once)           │
      │            fusion.counted(): impersonation alone doesn't count                             │
      │            scoring.py: risk = min(100, Σ points) -> first n with risk >= 25 = first alert  │
      └────────────────────────────────────────────────────────────────────────────────────────────┘
                            ▼
      verdict  = band of the final risk (0-24 SAFE, 25-49 SUSPICIOUS, 50-100 SCAM)
      type     = NONE if SAFE, else: keyword ladder + type model + "clear stories"  (scam_type.py)
      warning  = Romanian template (warnings_ro.py); numbers only from the official catalog
```

Everything after the two signals is deterministic: the same input always gives the same answer, which
the jury's live re-run requires (a mismatch with the dashboard sets accuracy to 0).

## Modules (`detector/`)

| File | Responsibility |
|---|---|
| `catalog.py` | Reads `data/official_catalog.json` (points, bands, types, official contacts). `norm()` lowercases and strips diacritics **without changing the length**, so a regex position found on the normalised text cuts the evidence out of the original text. `is_official_domain()` accepts a domain or a real subdomain (`plati.anaf.ro` yes, `fakeanaf.ro` no). |
| `loader.py` | Files, folders, pasted text and the desktop pill's ingest payloads into one scenario format. |
| `rules.py` | Signal 1. All vocabulary lives in `config/rules.toml`; the file is only logic. `detect()` returns the flags the rules are sure about, with evidence; `claim()` returns who the message claims to be (catalog names as whole words first, then generic claims); `legitimacy()` returns signs of a genuine notice. |
| `encoder.py` | Signal 2. Loads the fine-tuned flag model and the thread-level type model from `models/`. Links, e-mails, phones and numbers are masked to `<URL> <EMAIL> <TEL> <NUM>` in training and at runtime. Falls back to zero-shot NLI (`config/hypotheses.json`, on CPU) if no fine-tuned model exists. |
| `fusion.py` | One decision per flag per message (rules first, then the encoder above its threshold), plus the thread-level gates in `counted()`. |
| `scoring.py` | The official formula only: points, cap at 100, bands. |
| `scam_type.py` | The keyword ladder (`classify`) and `certain_type()`: explicit stories (who they claim to be, a relative asking for money, a code sent "by mistake", a prize, a job...) that override the model. |
| `warnings_ro.py` | Three-sentence Romanian warnings from templates. The web app and the pill have their own copy of the warning logic (`ui/app/src/warnings.js` + `ui/app/tools/warnings_ro.py`), kept identical by `check_warnings_parity.js`; that is the text the jury saw. |
| `pipeline.py` | Runs everything per message, caches model outputs in memory, chooses the type, returns the result. |
| `api.py` | Local HTTP server (127.0.0.1:8000) used by the web app and the pill: `POST /analyze`, `GET /health`. Rejects non-local hosts; one request at a time. |

## The signals in more detail

### Rules (precision layer)

- **Contacts.** Every link whose domain is not on the official list is `RF_SUSPICIOUS_CONTACT`. Phone numbers and sender e-mail domains count only when the message claims an organisation (otherwise every friend's number would be 25 points).
- **Requests with negation.** `RF_CODE_REQUEST` needs a code word *and* a send/read/tell verb that is not negated ("Nu comunicați acest cod" is a warning, not a request). Data, payment and remote-access requests are also cancelled by a "nu" just before them or "niciodată / nicio bancă / nimeni de la" in the sentence.
- **Claims.** `claim()` gives `{org, category}` (bank, courier, authority, tech support, marketplace, shop). It drives the type and the warning's official contact.
- **Legitimacy signals.** "Nu este necesară nicio acțiune", "aveți de primit", an official link only, an official sender address... These never add or remove points. They stop the encoder from turning a flag on by itself in that message, and only when the rules see nothing else wrong there (refund scams also say "aveți de primit", but come with a fake link).

### Encoder (recall layer)

- Two fine-tuned `xlm-roberta-base` models:
  - **flag model:** one example per sender message, 13 sigmoid outputs, input = (masked message, context)
  - **type model:** one example per risky thread, 12-way softmax over the whole masked thread
- Per-flag thresholds are tuned on a leak-free dev split and live in `config/fusion.json`.
- `RF_SUSPICIOUS_CONTACT` and `RF_NEW_NUMBER` are **rules-only**: only code can check the catalog, and "new number" is a factual claim the rules catch reliably.

### Thread-level gates (`fusion.counted`)

- `RF_IMPERSONATION` alone does not count: a real Banca Dunărea SMS also starts with "Banca Dunărea:". As soon as anything else shows up, it counts (V11: the "Casa de Pensii" claim at message 1 starts counting with the "good news" at message 3, which reproduces the answer key's first alert).
- Optional (`encoder_alone_needs_support`, off): ignore a thread whose every flag comes from the encoder alone.

### Scam type

1. `scam_type.classify()`: a keyword ladder in a fixed order (claimed identity first, then flags and story words).
2. If the type model exists, `pipeline.choose_type()` combines them with the strategy chosen on dev (`model_unless_claim`: trust the model unless an organisation claim or remote access makes the ladder certain).
3. `scam_type.certain_type()`: explicit stories override both (switch: `type_stories` in `fusion.json`).
4. SAFE is always `NONE`.

## Result format

`pipeline.analyse(scenario)` returns:

```
{id, verdict, scam_type, risk_score, first_alert, red_flags, warning, claim,
 flag_details: {flag: {n, evidence, source: "rules" | "encoder"}},
 per_message: [{n, from, text, new_flags, legit, score}],
 signals: {rules, encoder, llm: false}, llm_calls: 0}
```

`signals.llm` and `llm_calls` are always false/0 (the LLM was removed, see
[LLM_EXPERIMENTS.md](LLM_EXPERIMENTS.md)); they stay because the UI reads them.

## User interfaces (`ui/`)

- **Web app (`ui/app/`).** Check screen (paste or open a file, big result, warning, "De ce?" highlights, read aloud), results dashboard (load a folder, one row per scenario, click for details), and a mobile view. It POSTs each scenario to `api.py`. The **UI recomputes score, verdict and first alert itself** with the official formula from the flags it receives, and falls back to its own rules detector (`ui/app/src/detector.js`) if the backend is down: rows then show a yellow "rules" tag. See `ui/app/README.md`.
- **Desktop pill (`ui/desktop/`).** Electron app with a local, token-protected ingest API (`127.0.0.1:7777`) for SMS gateways, mail hooks or chat bots. It interrupts only on SCAM, and reads the warning aloud on request. See `ui/desktop/README.md` and `INTEGRATION.md`.
- **Streamlit (`ui/streamlit/app.py`).** The developer GUI from the build; talks to the pipeline directly.
