# Scam Shield app

A static web app: no build step, no install, no internet needed. React and the design system are bundled in this folder.

## Run it

Double-click `index.html`, or serve the kit folder (some browsers only allow the "Lipește" paste button on localhost):

```
python -m http.server 8765 --directory ..
```

then open http://localhost:8765/app/

## Screens

- **Verifică** (`#verifica`): the grandparent screen. Paste a message, a WhatsApp copy (`[date, time] Name: text`), lines starting with `Eu:` for the reader's replies, an e-mail with `From:`/`Subject:` headers, or open a scenario `.json`. Drag a `.json` onto the page to open it too.
- **Rezultate** (`#rezultate`): the jury dashboard. **Load folder** (or drag the folder onto the page) runs every `.json`. Include the answer-key `.csv` in the selection, or load it with **Load answer key**, to see which rows differ. Click a row for the detail: warning, risk meter, score per message, and the highlighted conversation.

## Warnings (warnings_ro)

The warning text follows `tools/warnings_ro.py`: a title, the two most serious reasons, and one action through an official channel, **one sentence per line, at most 6 lines**, never repeating a link or number from the message. The app uses the identical JS port in `src/warnings.js`; check they agree with:

```
node app/tools/check_warnings_parity.js
```

`check_validation.js` also fails if a warning has more than 6 lines or repeats a contact from the message. Note: the brief asks for at most three short sentences (M6); 6 lines is a deliberate team choice.

## Mobile

`mobile.html` is the phone version, with everything the PC has, under a bottom bar:

- **Acasă**: calm home, the island at the top, **Vezi o demonstrație** (real validation scenarios, one message at a time, through the real detector). A scam cascades the island into the cat's reasons (▶ Ascultă, Vezi tot); the page dims and Android phones vibrate.
- **Verifică**: paste, open a scenario file, "a fost un apel", who wrote → the result sheet (any verdict): warning lines, call the official number, ask someone you trust, read aloud, reasons, the marked message.
- **Istoric**: every conversation checked in this session; tap to reopen. Nothing is kept after the page closes.
- **Juriu**: the results dashboard (`index.html#rezultate`).

Sheets close with **Închide**, a swipe down on the bar, or the phone's Back gesture. Read-aloud uses a Romanian voice, female when the phone has one (iPhone "Ioana", Edge "Alina", Google's Romanian voice). It can be added to the home screen as an app (`manifest.webmanifest`, icons in `icons/`, regenerate with `npx electron tools/make-icons.js` from `desktop/`); Android only offers "Install" over HTTPS, over plain HTTP it is a shortcut.

A web page cannot read a phone's SMS or WhatsApp in the background; that needs a native app.

To open it on a phone on the same Wi-Fi, serve **only the app folder**: `python -m http.server 8765 --directory app` (from the kit folder), then open `http://<laptop-ip>:8765/mobile.html`. Stop it with Ctrl+C.

## Files

| File | What it does |
| --- | --- |
| `src/detector.js` | The rules detector: red flags per message, score, verdict, first alert, scam type. Deterministic. |
| `src/warnings.js` | The three-sentence Romanian warning and the one action. Contacts come only from the official catalog. |
| `src/parse.js` | Pasted text and files into the brief's scenario format; the answer-key comparison; CSV export. |
| `src/analyzer.js` | One entry point for verdicts. Caches each result by content, so a live re-run matches the dashboard. |
| `src/config.js` | Set `apiUrl` to use your own backend (contract in the file). Never put API keys here. |
| `src/app.js`, `src/app.css` | The two screens. |
| `design-system/` | The Scam Shield design system (`bundle.js`, `bundle.css`, `tokens.json`). |
| `src/catalog.js`, `design-system/tokens.css` | Generated. After changing `official_catalog.json` or `tokens.json`, run `python app/tools/build.py`. |

## Check the detector

```
node app/tools/check_validation.js
```

Runs the validation set against `validation_expected_results.csv` and prints every warning. It currently passes all 11. Pass a folder and a CSV to check another set: `node app/tools/check_validation.js path/to/folder path/to/expected.csv`.

## Known limits

- The detector is phrase rules tuned on 11 scenarios. Expect misses on the secret Test Set. The backend hook in `config.js` connects the trained detector (detector/api.py); the app keeps computing score, verdict and first alert itself.
- Fonts load from Google Fonts. Offline, the app falls back to the system font.
- The call button uses `tel:`, which does nothing on most laptops; the number is always shown as text too.
- "Citește cu voce tare" needs a Romanian voice installed in the operating system, or it reads with the default voice.
