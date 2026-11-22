# Out-of-distribution test set (written by the team)

Every number so far comes from **one generator** (the dataset) or **11 examples** (V01–V11).
This folder is for 40–60 scenarios **written by hand by people on the team**, never generated,
never copied from the dataset or V01–V11. It is the number to quote in the pitch, because it is the
closest thing to the jury's secret Test Set.

## What to write

Aim for roughly the jury's mix, heavier on traps:

| Kind | How many | Examples |
|---|---|---|
| Genuine messages that look dangerous | 15–20 | real bank SMS with a code + "nu comunicați"; courier notice with the official link; ANAF refund "nu este necesară nicio acțiune"; a real son who changed number and asks what to bring Sunday; a friend asking to split a restaurant bill |
| Scams, single message | 10–15 | each scam type at least once, including ROMANCE, JOB_OFFER, INVESTMENT |
| Scam threads that build trust first | 10–15 | 4–10 messages, the hook at message 3–7; count reader replies in `n` |
| Suspicious (25–49 points) | 5 | a prize SMS without a link; "new number" with no request yet + channel switch |

Rules:
- Use only the fictional organisations and contacts from `data/official_catalog.json` (plus ANAF).
- Write the way people really write: no diacritics, typos, emoji, abbreviations, Romglish.
- Label honestly with the 13 official `RF_` codes, then compute the score with the official points
  (`python -c "import scoring; print(scoring.risk_score([...]))"`), the verdict from the bands,
  and `first_alert` = the first message after which the score reaches 25.
- Ideally the person who writes a message is not the person who labels it.

## Format

One JSON file per scenario, same format as `data/validation_set` (see `O00_EXAMPLE.json`),
ids `O01`, `O02`, … Then one row per scenario in `ood_expected_results.csv`, same columns as
`validation_expected_results.csv`. Delete the `O00_EXAMPLE` row and file once you have real ones.

## Run

```
cd reference
..\.venv\Scripts\python benchmark.py
```
`benchmark.py` picks this folder up automatically and prints an `OOD` line for every configuration.
