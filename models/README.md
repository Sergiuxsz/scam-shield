# models/

The trained models are **not in git** (about 1.1 GB; GitHub refuses files over 100 MB). The detector
runs without them on rules only (V01-V11 still 30/30, but much weaker on unseen wording).

Expected layout once trained:

```
models/
├─ flag_encoder/   XLM-RoBERTa-base + 13-output head (one probability per red flag)
│                  config.json, model.safetensors (~550 MB, bf16), tokenizer files,
│                  labels.json, thresholds.json, report.json
└─ type_encoder/   XLM-RoBERTa-base + 12-way head (scam type of a whole thread)
                   same files, report.json
```

## Get them

**Retrain (about 5 minutes on an RTX 5060, longer on CPU).** See [docs/TRAINING.md](../docs/TRAINING.md):

```
python training/train_encoder.py           # tuning run: dev split, thresholds -> config/fusion.json
python training/train_type.py
python training/tune.py                    # type strategy + encoder floor, chosen on dev
python training/train_encoder.py --final   # delivered models: train + dev
python training/train_type.py --final
```

**Or download** a release zip if the team attached one (GitHub repo -> Releases), and unzip it here.

To keep models elsewhere (for example another drive), set `SCAM_MODELS_DIR` to the folder that
contains `flag_encoder/` and `type_encoder/`.
