# Scam Shield

**Detects scam messages and conversations in Romanian, and warns the reader in words a grandparent
understands.** Built in one day for the R Systems side challenge at EESTEC LC Bucharest (14th edition),
where it won **2nd place**. Team *Echipa Surpriza*: Stefan Bejenescu, Francesca Micu, Sergiu Baroiamn.

You paste a message, open a conversation file, or let the desktop pill listen in the background.
Scam Shield finds the official **red flags** message by message, computes the official **risk score**,
**verdict** (SAFE / SUSPICIOUS / SCAM), **scam type** and **first alert** (the message where a thread
turns dangerous), and writes a three-sentence Romanian warning with one safe action through an
official channel. Everything runs locally; no message leaves the computer.

```
"Mami, am o problemă... Poți să-mi faci tu un transfer de 1.850 lei?"  (message 5 of a thread)
 -> SCAM · FAMILY_EMERGENCY · risk 80 · first alert at message 5
 -> "Atenție, pare o țeapă! Cineva de pe un număr nou se dă drept o rudă, vă cere bani și vă cere
     să nu spuneți nimănui. Nu trimiteți bani: sunați-vă ruda la numărul vechi, pe care îl cunoașteți."
```

## How it works

```
scenario (one message or a thread)
   │  for each message n, with the thread so far as context
   ├─► rules      links / phones vs the official catalog, request patterns with negation,
   │              claimed identity, signs of a genuine notice              (detector/rules.py)
   └─► encoder    fine-tuned XLM-RoBERTa: 13 red-flag probabilities        (detector/encoder.py)
         ▼
      fusion      one decision per flag, per-flag thresholds tuned on dev  (detector/fusion.py)
         ▼        deterministic from here
      scoring     official points -> risk, verdict, first alert            (detector/scoring.py)
      scam type   claimed identity + "clear stories" + a thread-level type model
      warning     Romanian templates; phone numbers only from the official catalog
```

Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Why it is built this way:
[docs/DECISIONS.md](docs/DECISIONS.md).

## Results

Scored like the jury (verdict 3 + type 2 + first alert 2 points per scenario, −3 for a missed scam,
scaled to 30). Full protocol and history in [docs/EVALUATION.md](docs/EVALUATION.md).

| Test set | Rules only | Model only | **Rules + model** |
|---|---|---|---|
| Validation V01-V11 (organisers) | 30.0 | 25.7 | **30.0** |
| Held-out eval, template-clean (129) | 19.9 | 23.0 | **28.4** |
| Held-out eval, all (300) | 15.2 | 24.3 | **28.0** |
| Held-out eval, `hard` (44) | 8.5 | 17.3 | **26.5** |
| Hand-written by the team (20, `franci`) | | | 23.1 * |
| Hand-written by the team (8, `fix_T1732-T1741`) | | | 21.9 * |

\* The hand-written sets are the closest thing to the jury's unseen messages, but some type rules were
written while looking at the `franci` set, so it is not a blind test any more.

The template-clean subset is the honest held-out number: 931 of the 1,700 training conversations share
a sentence template with the dataset's eval set, so "all 300" is optimistic.

## Repository layout

| Folder | What |
|---|---|
| [`detector/`](detector) | The detector: rules, encoder, fusion, scoring, type, warnings, pipeline, and `api.py` (local HTTP server for the UI) |
| [`training/`](training) | Leak-free data split, fine-tuning of the flag and type models, settings search on dev |
| [`evaluation/`](evaluation) | `evaluate.py` (one folder vs its answer key), `benchmark.py` (all configurations and subsets), `clean_human.py` (cleans hand-written sets) |
| [`config/`](config) | `rules.toml` (all rule vocabulary), `fusion.json` (thresholds and switches), `hypotheses.json` (zero-shot fallback) |
| [`data/`](data) | Official catalog + validation set, the synthetic dataset, hand-written test sets, a template for new ones. See [docs/DATA.md](docs/DATA.md) |
| [`models/`](models) | Trained models (not in git; retrain or download, see `models/README.md`) |
| [`ui/app/`](ui/app) | Web app: check screen, results dashboard, mobile view (plain HTML/JS, rules fallback in the browser) |
| [`ui/desktop/`](ui/desktop) | Desktop pill (Electron): listens on a local port, alerts only on scams, reads the warning aloud |
| [`ui/streamlit/`](ui/streamlit) | Developer GUI used during the build |
| [`ui/demo_scenarios/`](ui/demo_scenarios) | The files used for the live demo |
| [`scripts/`](scripts) | `start_demo.ps1`: starts detector + web app (+ pill) |
| [`pitch/`](pitch) | Pitch deck, explainer, mascot images |
| [`docs/`](docs) | Architecture, decisions, evaluation, training, data, and the LLM experiment record |

## Quick start (Windows, PowerShell)

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install torch --index-url https://download.pytorch.org/whl/cu128   # or .../whl/cpu
pip install -r requirements.txt
```

Get the models (retrain in ~5 min, see [models/README.md](models/README.md)), then:

```powershell
python evaluation\evaluate.py                       # V01-V11 against the official answer key
.\scripts\start_demo.ps1                            # detector on :8000 + web app on :8765
.\scripts\start_demo.ps1 -Pill                      # also the desktop pill (npm install in ui\desktop first)
```

Without models everything still runs on rules only (`python evaluation\evaluate.py --no-encoder`).

## Privacy and safety

- Local only: the detector binds to 127.0.0.1 and rejects other hosts; no cloud AI is called.
- Messages are not stored. Warnings never repeat a link or number from the suspicious message; phone
  numbers come only from the official catalog.
- All organisations, links and numbers in the data are fictional, except ANAF.

## Acknowledgements

Challenge, official catalog and validation scenarios: R Systems × EESTEC LC Bucharest.
Base model: [xlm-roberta-base](https://huggingface.co/FacebookAI/xlm-roberta-base).
