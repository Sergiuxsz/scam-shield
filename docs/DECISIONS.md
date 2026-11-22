# Design decisions

Why the system looks the way it does, in the order the decisions were made. Each entry says what was
decided, why, and the evidence. Numbers are jury-style accuracy out of 30 unless stated otherwise.

---

## 1. Predict the red flags; compute everything else

**Decision.** The models only answer "is flag X present in this message?". Score, verdict and first
alert come from the organisers' formula in plain code (`scoring.py`).

**Why.** The challenge fixes the formula: risk = min(100, Σ points of the flags found). Training a model
to predict the score or the verdict would mean learning something we can compute exactly. Splitting
"reading" (uncertain) from "deciding" (deterministic) also makes every answer explainable and
repeatable, which the live re-run requires.

## 2. Rules for precision, a fine-tuned encoder for recall

**Decision.** Two independent signals per message: hand-written rules and a fine-tuned multilingual
encoder, combined per flag in `fusion.py`.

**Evidence.** Rules written while looking at V01-V11 scored 30/30 there but only **15/30** on 300
held-out conversations (60% verdicts, 58 missed scams). Their precision was high (0.85-1.00), their
recall on new wording low (secrecy 0.10, threat 0.19). The encoder alone reached ~24/30 but cannot
check links against the catalog. **Together: 28/30.** Neither signal is enough alone.

## 3. All rule vocabulary in `config/rules.toml`

Patterns are data, not logic. Tuning a rule means editing one TOML file; teammates who don't write
Python can add Romanian phrases. TOML literal strings (`'\bpin\b'`) keep regexes readable without
double escaping.

## 4. XLM-RoBERTa, not mDeBERTa

**Decision.** Base model `xlm-roberta-base` for both fine-tuned models.

**Evidence.** The first choice was `mDeBERTa-v3-base-xnli`. Training produced NaN within ~30 steps,
and with fp32 too. Labels were clean (only 0/1, no NaN). The cause turned out to be **wrong GPU
results**: the same input gave logits 1.5e-2 away from the CPU result (6e-2 with TF32 off), while
XLM-R matched to 4e-7. That's a kernel problem in torch 2.11+cu128 on the RTX 5060 (Blackwell), not
the setup. The zero-shot NLI fallback (mDeBERTa) therefore runs on CPU.

Related: the default (foreach) AdamW also turned every weight into NaN on this GPU; the trainers use
`AdamW(fused=True)`.

## 5. A leak-free dev split, by template group

**Decision.** `training/data_split.py` groups conversations that share a sentence template (after
masking entities) or are linked in metadata (contrast pairs, truncations), and puts **whole groups** in
dev. Settings are chosen on dev only; the 300 eval conversations are scored once.

**Evidence.**
- With a random 15% dev, dev F1 was 0.987 and type accuracy 1.00, both inflated: dev shared templates with train.
- Grouping showed **931 of 1,700 training conversations share a template sentence with eval**, so the dataset's eval is only partly held out.
- We report the **template-clean** subset (129 conversations sharing no template with train) as the honest number.

**Bug caught on the way.** Group numbering depended on Python's per-process set ordering, so the "seeded"
split differed between the trainer and the tuner, and tuning secretly ran on training data. Groups are
now named by their smallest id, and every trainer writes a **dev fingerprint** that `tune.py` checks
before it runs.

## 6. Mask entities, augment the surface

Links, e-mails, phones and numbers become `<URL> <EMAIL> <TEL> <NUM>` in the encoder input (training
and runtime), so the model learns the *request*, not one fake domain or amount. Training text is
randomly stripped of diacritics, upper-cased or given a swapped letter, because real messages look
like that.

## 7. Thresholds: per flag, ties toward 0.5, then train on everything

- Thresholds are tuned per flag on dev for F1. **Among thresholds within 0.01 of the best, the one closest to 0.5 wins.** Breaking ties toward the lowest value had picked 0.15 for remote access, and V01's "accesați <URL>" then counted as remote access.
- Flags with fewer than 15 dev examples keep 0.5.
- After the settings are chosen, `--final` retrains both models on train + dev, so no template is missing from the delivered model.

## 8. Decided by the rules only: suspicious contact and new number

Only code can check a domain against the official catalog. "Ăsta e numărul nou" from a sender not in
the contacts is a factual claim the rules catch with 94% recall. The model had flagged "sunt Marco" in
a romance opener as a relative with a new number.

## 9. Real messages must stay SAFE

Three mechanisms, each from a measured false alarm:
- **Impersonation alone doesn't count** (V03 and V05 are genuine bank and courier messages).
- **Legitimacy signals** ("nu este necesară nicio acțiune", "aveți de primit", an official link only) stop the encoder from flagging a genuine notice on its own. They only apply when the rules see nothing else wrong in the message, because refund scams say "aveți de primit" too (V06).
- **Whole-word organisation matching.** A substring check read the sender "Ana (frate)" as ANAF.

False alarms on the held-out eval went from 8 to 0.

## 10. Scam type: who they claim to be decides

- Flags alone don't separate a fake bank from a fake ANAF; the claimed identity does.
- A thread-level type model lifted type accuracy from 71% to ~90%.
- `certain_type()` adds explicit "clear stories" on top (dev type accuracy 76% to 86%):
  - the claimed identity beats the technique (a bank scam that asks for AnyDesk is still BANK)
  - a relative + money is FAMILY_EMERGENCY
  - a code request is ACCOUNT_TAKEOVER only with its own story ("sent to you by mistake")
- Some of these rules follow this dataset's labelling choices (a utility bill is OTHER; a friend sending a bait link is ACCOUNT_TAKEOVER). The jury's key may label those differently.

## 11. No LLM

A local LLM was integrated as a third signal (llama.cpp; Qwen3.5-35B-A3B and Qwen2.5-7B), made fast
enough (0.2-1 s per call for the 7B), and calibrated per flag on dev. **It never improved any score.**
Where it disagreed with the encoder it was right 0-29% of the time, and its veto raised missed scams
from 2 to 8. It was removed: no gain, plus a server, timeouts and GPU contention in the live run.
Without it the system is still multi-signal (two models + rules + link/number checks + calibration).
Full record: [LLM_EXPERIMENTS.md](LLM_EXPERIMENTS.md).

## 12. Warnings from templates, numbers from the catalog

No model writes the warning text, so it can't invent a phone number or repeat the scammer's link. Three
short sentences (what, why, the one thing to do), "dumneavoastră", no jargon, as the brief requires.
The action uses the official contact from the catalog when the claimed organisation is in it
("sunați la CurierExpres, la 0800 300 400"), otherwise a safe generic step ("mergeți personal la
instituție").

## 13. Local-only, nothing stored

The brief disqualifies sending messages to cloud AI. `api.py` binds to 127.0.0.1 and rejects other
Host headers; the desktop pill's ingest API needs a token. Messages are processed in memory and not
logged. The encoders can run on CPU (`SCAM_ENCODER_DEVICE=cpu`) so the demo never fights over the GPU.
