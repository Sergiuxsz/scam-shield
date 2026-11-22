"""Fine-tune a multilingual encoder for the 13 red flags.

One training example per SENDER message:
    input  = (message text, format_context(earlier messages + sender metadata))   sentence pair
    labels = 13 zeros/ones, the message's own flags from data/dataset/train.jsonl
Model  = pretrained XLM-RoBERTa encoder + NEW head with 13 outputs (sigmoid each, BCE loss).

Generalisation measures (see data_split.py):
  - dev is split by TEMPLATE GROUP: no dev conversation shares a (masked) sentence with train
  - training conversations that leak V01-V11 are dropped
  - links / e-mails / phones / numbers are masked to <URL> <EMAIL> <TEL> <NUM> (train and inference)
  - surface augmentation each epoch: no diacritics, ALL CAPS, swapped letters
Dev is used for (a) picking the best epoch and (b) tuning one threshold per flag.
The 300 eval conversations are never touched here: they're for benchmark.py.

Output:
    models/flag_encoder/         model, tokenizer, labels.json, thresholds.json, report.json
    config/fusion.json           per_flag thresholds updated from dev

Usage:  .venv\\Scripts\\python train_encoder.py [--epochs 4] [--lr 3e-5] [--batch 16]
"""
import sys as _sys
from pathlib import Path as _Path
_REPO = _Path(__file__).resolve().parents[1]
_sys.path[:0] = [str(_REPO / d) for d in ("detector", "training", "evaluation")]  # flat imports across folders

import argparse
import json
import random
import time
from pathlib import Path

import torch
from transformers import AutoModelForSequenceClassification, AutoTokenizer, get_linear_schedule_with_warmup

from catalog import CONFIG, ROOT, flag_codes
from data_split import augment, fingerprint, load_jsonl, split_convs
from encoder import CONTEXT_MESSAGES, FT_DIR, MAX_LEN, format_context, mask_entities

FLAGS = flag_codes()
DATASET = ROOT / "data" / "dataset"
MIN_SUPPORT = 15  # a flag needs this many positive dev messages before its threshold is tuned


def to_examples(convs: list[dict]) -> list[dict]:
    out = []
    for c in convs:
        msgs = c["messages"]
        for i, m in enumerate(msgs):
            if m["from"] != "sender" or not m["text"].strip():
                continue
            out.append({
                "text": mask_entities(m["text"]),
                "context": format_context(c, msgs[:i]),
                "labels": [1.0 if f in m["flags"] else 0.0 for f in FLAGS],
            })
    return out


def batches(examples, tok, size, shuffle, rng=None):
    """shuffle=True means training: also apply random surface augmentation (fresh every epoch)."""
    order = list(range(len(examples)))
    if shuffle:
        rng.shuffle(order)
    for start in range(0, len(order), size):
        chunk = [examples[i] for i in order[start:start + size]]
        texts = [augment(e["text"], rng) if shuffle else e["text"] for e in chunk]
        enc = tok(texts, [e["context"] for e in chunk],
                  truncation=True, max_length=MAX_LEN, padding=True, return_tensors="pt")
        enc["labels"] = torch.tensor([e["labels"] for e in chunk])
        yield enc


@torch.no_grad()
def predict(model, tok, examples, device, size=64):
    model.eval()
    probs, gold = [], []
    for b in batches(examples, tok, size, shuffle=False):
        labels = b.pop("labels")
        with torch.autocast(device_type="cuda", dtype=torch.bfloat16, enabled=device == "cuda"):
            logits = model(**{k: v.to(device) for k, v in b.items()}).logits
        probs.append(torch.sigmoid(logits.float()).cpu())
        gold.append(labels)
    return torch.cat(probs), torch.cat(gold)


def prf(pred: torch.Tensor, gold: torch.Tensor) -> tuple[float, float, float]:
    tp = (pred * gold).sum().item()
    p = tp / max(pred.sum().item(), 1)
    r = tp / max(gold.sum().item(), 1)
    return p, r, 2 * p * r / max(p + r, 1e-9)


def tune_thresholds(probs, gold) -> dict[str, float]:
    """Per flag: among thresholds (0.05..0.95) within 0.01 F1 of the best on dev, the one CLOSEST TO 0.5.
    (Breaking ties toward the lowest threshold picked 0.15 for REMOTE_ACCESS, and then V01's
    'accesați <URL>' at 0.31 counted as remote access.)"""
    out = {}
    grid = [x / 20 for x in range(1, 20)]
    for j, flag in enumerate(FLAGS):
        if gold[:, j].sum() < MIN_SUPPORT:  # too few dev examples to tune on: keep 0.5
            out[flag] = 0.5
            continue
        f1 = {t: prf((probs[:, j] >= t).float(), gold[:, j])[2] for t in grid}
        best = max(f1.values())
        out[flag] = min((t for t in grid if f1[t] >= best - 0.01), key=lambda t: (abs(t - 0.5), t))
    return out


def write_thresholds(model, tok, dev_ex, device, report: dict) -> None:
    """Tune per-flag thresholds on dev, save them with the model and into config/fusion.json."""
    probs, gold = predict(model, tok, dev_ex, device)
    thresholds = tune_thresholds(probs, gold)
    print("\nper-flag on dev (tuned threshold):")
    per_flag = {}
    for j, flag in enumerate(FLAGS):
        p, r, f = prf((probs[:, j] >= thresholds[flag]).float(), gold[:, j])
        per_flag[flag] = {"threshold": thresholds[flag], "p": p, "r": r, "f1": f, "support": int(gold[:, j].sum())}
        print(f"  {flag:24} t={thresholds[flag]:.2f}  P {p:.3f}  R {r:.3f}  F1 {f:.3f}  (n={int(gold[:, j].sum())})")
    (FT_DIR / "labels.json").write_text(json.dumps(FLAGS), encoding="utf-8")
    (FT_DIR / "thresholds.json").write_text(json.dumps(thresholds, indent=2), encoding="utf-8")
    (FT_DIR / "report.json").write_text(json.dumps({**report, "dev_per_flag": per_flag}, indent=2), encoding="utf-8")
    fusion_path = CONFIG / "fusion.json"
    cfg = json.loads(fusion_path.read_text(encoding="utf-8"))
    cfg["per_flag"] = {f: {"encoder_alone": t} for f, t in thresholds.items()}
    fusion_path.write_text(json.dumps(cfg, indent=2), encoding="utf-8")
    print(f"\nthresholds saved to {FT_DIR / 'thresholds.json'} and {fusion_path}")


def main():
    ap = argparse.ArgumentParser()
    # xlm-roberta-base, not mDeBERTa: mDeBERTa's GPU kernels give wrong results on the RTX 5060 (torch 2.11+cu128).
    ap.add_argument("--base", default="xlm-roberta-base")
    ap.add_argument("--epochs", type=int, default=8)
    ap.add_argument("--lr", type=float, default=3e-5)
    ap.add_argument("--batch", type=int, default=16)
    ap.add_argument("--dev", type=float, default=0.15)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--retune", action="store_true", help="only re-tune thresholds of the saved model on dev")
    ap.add_argument("--final", action="store_true",
                    help="after tuning: train on train+dev for --epochs, keep the dev-tuned thresholds")
    args = ap.parse_args()

    random.seed(args.seed)
    torch.manual_seed(args.seed)
    device = "cuda" if torch.cuda.is_available() else "cpu"

    train_convs, dev_convs = split_convs(args.dev, args.seed)
    rng = random.Random(args.seed)
    train_ex, dev_ex = to_examples(train_convs), to_examples(dev_convs)
    report = {"base": args.base, "args": vars(args), "dev_fingerprint": fingerprint(dev_convs),
              "context_messages": CONTEXT_MESSAGES, "max_len": MAX_LEN}

    if args.retune:
        tok = AutoTokenizer.from_pretrained(FT_DIR)
        model = AutoModelForSequenceClassification.from_pretrained(FT_DIR).to(device)
        old = json.loads((FT_DIR / "report.json").read_text(encoding="utf-8"))
        if old.get("dev_fingerprint") != report["dev_fingerprint"]:
            raise SystemExit("saved model was not trained with this dev split (or is a --final model)")
        write_thresholds(model, tok, dev_ex, device, {**old, "retuned": True})
        return

    if args.final:
        # Settings were chosen on dev; now give the delivered model every template, dev included.
        train_ex, dev_ex = train_ex + dev_ex, []
        kept_thresholds = (FT_DIR / "thresholds.json").read_text(encoding="utf-8")
        report.update(final=True, dev_fingerprint="final (trained on train+dev)")
    print(f"device={device}  train: {len(train_ex)} msgs   dev: {len(dev_ex)} msgs   final={args.final}")

    tok = AutoTokenizer.from_pretrained(args.base)
    model = AutoModelForSequenceClassification.from_pretrained(
        args.base, num_labels=len(FLAGS), problem_type="multi_label_classification",
        id2label=dict(enumerate(FLAGS)), label2id={f: i for i, f in enumerate(FLAGS)},
        ignore_mismatched_sizes=True,  # the pretrained 3-way NLI head is replaced by a new 13-way head
    ).to(device)

    steps = args.epochs * ((len(train_ex) + args.batch - 1) // args.batch)
    # fused=True: with torch 2.11+cu128 on the RTX 5060, the default (foreach/for-loop) AdamW
    # turns every weight into NaN after one step even with finite gradients. The fused kernel is fine.
    opt = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=0.01, fused=device == "cuda")
    sched = get_linear_schedule_with_warmup(opt, int(0.1 * steps), steps)
    loss_fn = torch.nn.BCEWithLogitsLoss()

    best_f1, history = -1.0, []
    for epoch in range(1, args.epochs + 1):
        model.train()
        t0, total = time.time(), 0.0
        for i, b in enumerate(batches(train_ex, tok, args.batch, shuffle=True, rng=rng), start=1):
            labels = b.pop("labels").to(device)
            with torch.autocast(device_type="cuda", dtype=torch.bfloat16, enabled=device == "cuda"):
                logits = model(**{k: v.to(device) for k, v in b.items()}).logits
            loss = loss_fn(logits.float(), labels)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt.step()
            sched.step()
            opt.zero_grad()
            total += loss.item()
        if args.final:
            history.append({"epoch": epoch, "loss": total / i})
            print(f"epoch {epoch}: loss {total / i:.4f}  ({time.time() - t0:.0f}s)")
            continue
        probs, gold = predict(model, tok, dev_ex, device)
        p, r, f1 = prf((probs >= 0.5).float(), gold)
        history.append({"epoch": epoch, "loss": total / i, "dev_p": p, "dev_r": r, "dev_f1": f1})
        print(f"epoch {epoch}: loss {total / i:.4f}  dev micro P {p:.3f} R {r:.3f} F1 {f1:.3f}  ({time.time() - t0:.0f}s)")
        if f1 > best_f1:
            best_f1 = f1
            save(model, tok)
    report["history"] = history

    if args.final:
        save(model, tok)
        (FT_DIR / "labels.json").write_text(json.dumps(FLAGS), encoding="utf-8")
        (FT_DIR / "thresholds.json").write_text(kept_thresholds, encoding="utf-8")
        (FT_DIR / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
        print(f"\nfinal model saved to {FT_DIR} (dev-tuned thresholds kept)")
        return

    # Reload the best epoch, tune thresholds on dev.
    model = AutoModelForSequenceClassification.from_pretrained(FT_DIR).to(device)
    write_thresholds(model, tok, dev_ex, device, report)


def save(model, tok) -> None:
    FT_DIR.mkdir(parents=True, exist_ok=True)
    # bf16 on disk: half the size (~560 MB for XLM-R base); loads back as fp32 for inference.
    model.save_pretrained(FT_DIR, state_dict={k: v.to(torch.bfloat16) for k, v in model.state_dict().items()})
    tok.save_pretrained(FT_DIR)


if __name__ == "__main__":
    main()
