# Training and tuning

Everything runs from the repo root. About 5 minutes in total on an RTX 5060 (8 GB); slower on CPU.

## Setup

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install torch --index-url https://download.pytorch.org/whl/cu128   # NVIDIA (CUDA 12.8); or .../whl/cpu
pip install -r requirements.txt
```

The first run downloads `xlm-roberta-base` (~1 GB) from Hugging Face and caches it.

## The sequence

```powershell
# 1. Tuning models: trained WITHOUT the dev split, so dev can choose settings honestly
python training\train_encoder.py          # 13-flag model; writes per-flag thresholds to config\fusion.json
python training\train_type.py             # 12-type thread model

# 2. Settings, chosen on dev (refuses to run if a model was trained on a different dev split)
python training\tune.py                   # type strategy + model-alone floor -> config\fusion.json

# 3. Delivered models: same settings, trained on train + dev
python training\train_encoder.py --final  # keeps the dev-tuned thresholds
python training\train_type.py --final

# 4. Check
python evaluation\evaluate.py             # V01-V11 must stay 30/30
python evaluation\benchmark.py
```

Useful options:

| Command | What |
|---|---|
| `python training\data_split.py` | Prints the grouping and split statistics (groups, dev size, leak checks) |
| `python training\train_encoder.py --retune` | Re-tunes thresholds of the saved model on dev without retraining |
| `SCAM_MODELS_DIR=D:\models\dev` | Keep the tuning models somewhere else (e.g. another drive) while `models\` holds the final ones |
| `SCAM_ENCODER_DEVICE=cpu` | Run the encoders on CPU (e.g. when another program needs the GPU) |

## What the trainers do

**`train_encoder.py` (flags).**
- One example per sender message: (masked message, context), where context = channel, saved contact or not, sender name, and the last 2 messages.
- 13 sigmoid outputs, BCE loss.
- XLM-R base, lr 3e-5, batch 16, 8 epochs, 10% warmup, gradient clipping at 1.0, bf16 autocast, fused AdamW.
- Augmentation each epoch: no diacritics 30%, ALL CAPS 5%, one swapped letter pair 15%.
- Keeps the best epoch by dev micro-F1, then tunes one threshold per flag (ties toward 0.5, fewer than 15 dev examples keeps 0.5).
- Weights are saved in bf16 (~550 MB).

**`train_type.py` (type).**
- One example per SCAM/SUSPICIOUS thread: sender metadata + every message, masked, up to 512 tokens.
- 12-way softmax, cross-entropy, 6 epochs.

**`tune.py`.** Runs the full pipeline on dev and picks, by jury score:
- the type strategy (how the keyword ladder and the type model combine)
- the model-alone floor, the highest one that loses no dev points

It checks both models' `dev_fingerprint` first.

## The split (`training/data_split.py`)

1. Drop the 13 training conversations that would leak V01-V11 (a shared template sentence, or more than 50% character 8-gram overlap).
2. Group conversations: union-find over metadata links (`pair_id`, `pair_with`, `truncated_from`) and shared masked sentence signatures of 4+ tokens. Looser linking was tested and leaked: at 8 tokens, 178/254 dev conversations shared a template with train.
3. Whole groups go to dev until ~15%. A group bigger than that (strict linking chains generic sentences into one ~1,200-conversation group) always stays in train.
4. Group names use the smallest conversation id, so the split is identical in every process.

## Pitfalls we hit (and the fixes in the code)

| Symptom | Cause | Fix |
|---|---|---|
| NaN loss from the first epoch, even in fp32 | mDeBERTa's GPU kernels give wrong results on this GPU/torch | `xlm-roberta-base` |
| All weights NaN after one optimizer step | default AdamW on this GPU/torch | `AdamW(fused=True)` |
| "Not enough space on the disk" while saving | full C: drive, fp32 checkpoints | bf16 checkpoints; `SCAM_MODELS_DIR` |
| Dev type accuracy 1.00 | random dev shared templates with train | group split |
| Tuning on the wrong dev | split numbering depended on hash seed | min-id group names + dev fingerprint |
