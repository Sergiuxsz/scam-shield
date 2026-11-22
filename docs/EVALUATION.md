# Evaluation

## How a scenario is scored

Exactly as the jury does (`evaluation/evaluate.py: jury_points`):

| | Points |
|---|---|
| Correct verdict | 3 |
| Correct scam type | 2 |
| Correct first alert (SCAM threads only) | 2, or 1 if one message late; V11 accepts messages 3-5 |
| Scam or suspicious marked SAFE | −3 |

The total is scaled to 30. The exact risk score and flag list are not graded; they're printed as
diagnostics (flag precision/recall, exact-score matches).

## Test sets

| Set | Size | What it measures | Caveat |
|---|---|---|---|
| **V01-V11** (organisers) | 11 | The official examples; must stay 30/30 | Tiny, and the rules were written while reading it |
| **Eval, all** (synthetic) | 300 | Held-out conversations from the dataset generator | 931/1,700 train conversations share a template sentence with it: optimistic |
| **Eval, CLEAN** | 129 | Eval conversations sharing **no** masked template sentence with train | The honest held-out number |
| Eval subsets | | `regular`, `contrast` (minimal pairs), `truncation` (threads cut just before the first signal, must stay SAFE), `hard` (44 that a TF-IDF baseline gets wrong) | Same generator as train |
| **Hand-written** (team) | 20 + 8 | Messages written by people, closest to the jury's | `franci` was looked at while writing type rules |
| `data/ood/` | template | For new hand-written scenarios; `benchmark.py` picks them up | Empty except the example |

## Commands

```powershell
python evaluation\evaluate.py                         # V01-V11, full system
python evaluation\evaluate.py --no-encoder            # V01-V11, rules only
python evaluation\evaluate.py data\handwritten\franci\scenarios --csv data\handwritten\franci\expected_results.csv
python evaluation\benchmark.py                        # rules / model / both on every eval subset + V01-V11,
                                                      # with the points lost per category and wrong-type table
```

## Current results (rules + fine-tuned models)

| Set | Score | Verdict | Type | Missed scams | False alarms |
|---|---|---|---|---|---|
| V01-V11 | **30.0** | 100% | 100% | 0 | 0 |
| Eval CLEAN (129) | **28.4** | 95% | 95% | 1 | 0 |
| Eval all (300) | **28.0** | 95% | 90% | 1 | 0 |
| Eval `hard` (44) | **26.5** | 86% | 91% | 0 | 0 |
| Hand-written `franci` (20) | 23.1 | | | | |
| Hand-written `fix_T1732-T1741` (8) | 21.9 | | | | |

Ablation on the same data:

| | V01-V11 | CLEAN | All | `hard` |
|---|---|---|---|---|
| Rules only | 30.0 | 19.9 | 15.2 | 8.5 |
| Model only | 25.7 | 23.0 | 24.3 | 17.3 |
| **Rules + model** | **30.0** | **28.4** | **28.0** | **26.5** |

Where the remaining points go (all 300): type 62, verdict 42, first alert 7, missed-scam penalty 3.

## How we got here

| Step | Eval all | CLEAN | Notes |
|---|---|---|---|
| Rules only (written on V01-V11) | 14.8 | | 58 missed scams |
| + fine-tuned flag model (XLM-R, 5 epochs) | 25.0 | | 3 missed, 8 false alarms |
| + thread-level type model, 8 epochs, `claim()` fix, tighter rules | 27.9 | | type 71% to 94% |
| + model-alone floor, NEW_NUMBER rules-only | 28.5 | | false alarms 6 to 2 |
| + legitimacy signals | 28.6 | | false alarms 2 to 1 |
| **Leak-free retrain** (group split, masking, augmentation, `--final`) | 27.8 | 27.6 | earlier rows were tuned on a leaky dev: optimistic |
| + rule fixes from dev errors (link shorteners, negation) | | 28.0 | |
| + "clear stories" for the type | 28.0 | **28.4** | dev type 76% to 86%; hand-written 17.9 to 23.1 |
| Local LLM as a third signal | | 28.0 vs 28.0 | no gain in any configuration; removed |

## Honest limits

- **One generator.** Training, dev and eval all come from the same synthetic generator; the template-clean subset removes shared sentences, not shared style. The jury's hand-written messages are harder, and the hand-written sets score ~22-23/30.
- **Small sets.** One scenario is ~1.5 points on V01-V11 and ~0.25 on CLEAN; differences under ~1 point on CLEAN are within noise.
- **Labelling conventions.** Some type rules follow the dataset's choices (a utility bill is OTHER, a friend's bait link is ACCOUNT_TAKEOVER), which a different answer key may not share.
- **Rules were written while reading V01-V11,** so 30/30 there shows the plumbing works, not generalisation.
