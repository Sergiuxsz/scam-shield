"""Fine-tune a thread-level scam-type classifier (one of the 12 scam types).

Why a separate model: the keyword ladder in scam_type.py gave up on stories it had no words for
(ROMANCE -> OTHER x13, PRIZE -> OTHER x9 on eval). A model reading the whole thread learns the story.

One example per SCAM/SUSPICIOUS conversation (SAFE ones are always NONE, decided by the score):
    input = format_thread(conversation)   (sender metadata + every message, with speaker tags)
    label = labels.scam_type              (softmax over 12 types, cross-entropy)
Same train/dev split as train_encoder.py. Eval (300) untouched.

Output: models/type_encoder/   model, tokenizer, labels.json, report.json
Usage:  .venv\\Scripts\\python train_type.py [--epochs 6]
"""
import sys as _sys
from pathlib import Path as _Path
_REPO = _Path(__file__).resolve().parents[1]
_sys.path[:0] = [str(_REPO / d) for d in ("detector", "training", "evaluation")]  # flat imports across folders

import argparse
import json
import random
import time

import torch
from transformers import AutoModelForSequenceClassification, AutoTokenizer, get_linear_schedule_with_warmup

from catalog import scam_types
from encoder import TYPE_DIR, TYPE_MAX_LEN, format_thread
from data_split import augment, fingerprint, split_convs

TYPES = [t for t in scam_types() if t != "NONE"]


def to_examples(convs):
    return [{"text": format_thread(c), "label": TYPES.index(c["labels"]["scam_type"])}
            for c in convs if c["labels"]["verdict"] != "SAFE"]


def batches(examples, tok, size, shuffle, rng=None):
    order = list(range(len(examples)))
    if shuffle:
        rng.shuffle(order)
    for start in range(0, len(order), size):
        chunk = [examples[i] for i in order[start:start + size]]
        texts = [augment(e["text"], rng) if shuffle else e["text"] for e in chunk]  # augmentation: training only
        enc = tok(texts, truncation=True, max_length=TYPE_MAX_LEN, padding=True, return_tensors="pt")
        enc["labels"] = torch.tensor([e["label"] for e in chunk])
        yield enc


@torch.no_grad()
def accuracy(model, tok, examples, device):
    model.eval()
    right, confusion = 0, {}
    for b in batches(examples, tok, 32, shuffle=False):
        y = b.pop("labels")
        with torch.autocast(device_type="cuda", dtype=torch.bfloat16, enabled=device == "cuda"):
            pred = model(**{k: v.to(device) for k, v in b.items()}).logits.argmax(-1).cpu()
        right += (pred == y).sum().item()
        for g, p in zip(y.tolist(), pred.tolist()):
            if g != p:
                key = f"{TYPES[g]} -> {TYPES[p]}"
                confusion[key] = confusion.get(key, 0) + 1
    return right / len(examples), confusion


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="xlm-roberta-base")
    ap.add_argument("--epochs", type=int, default=6)
    ap.add_argument("--lr", type=float, default=3e-5)
    ap.add_argument("--batch", type=int, default=16)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--final", action="store_true", help="after tuning: train on train+dev, save the last epoch")
    args = ap.parse_args()

    torch.manual_seed(args.seed)
    rng = random.Random(args.seed)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    train_convs, dev_convs = split_convs(seed=args.seed)
    train_ex, dev_ex = to_examples(train_convs), to_examples(dev_convs)
    if args.final:
        train_ex, dev_ex = train_ex + dev_ex, []
    print(f"device={device}  train {len(train_ex)} threads   dev {len(dev_ex)} threads   {len(TYPES)} types")

    tok = AutoTokenizer.from_pretrained(args.base)
    model = AutoModelForSequenceClassification.from_pretrained(
        args.base, num_labels=len(TYPES), id2label=dict(enumerate(TYPES)),
        label2id={t: i for i, t in enumerate(TYPES)}).to(device)
    steps = args.epochs * ((len(train_ex) + args.batch - 1) // args.batch)
    # fused=True: see train_encoder.py (default AdamW misbehaves on this GPU/torch combination)
    opt = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=0.01, fused=device == "cuda")
    sched = get_linear_schedule_with_warmup(opt, int(0.1 * steps), steps)
    loss_fn = torch.nn.CrossEntropyLoss()

    best, history = -1.0, []
    for epoch in range(1, args.epochs + 1):
        model.train()
        t0, total = time.time(), 0.0
        for i, b in enumerate(batches(train_ex, tok, args.batch, shuffle=True, rng=rng), start=1):
            y = b.pop("labels").to(device)
            with torch.autocast(device_type="cuda", dtype=torch.bfloat16, enabled=device == "cuda"):
                logits = model(**{k: v.to(device) for k, v in b.items()}).logits
            loss = loss_fn(logits.float(), y)
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
        acc, confusion = accuracy(model, tok, dev_ex, device)
        history.append({"epoch": epoch, "loss": total / i, "dev_acc": acc})
        print(f"epoch {epoch}: loss {total / i:.4f}  dev accuracy {acc:.3f}  ({time.time() - t0:.0f}s)")
        if acc > best:
            best, best_confusion = acc, confusion
            TYPE_DIR.mkdir(parents=True, exist_ok=True)
            model.save_pretrained(TYPE_DIR, state_dict={k: v.to(torch.bfloat16) for k, v in model.state_dict().items()})
            tok.save_pretrained(TYPE_DIR)

    if args.final:
        TYPE_DIR.mkdir(parents=True, exist_ok=True)
        model.save_pretrained(TYPE_DIR, state_dict={k: v.to(torch.bfloat16) for k, v in model.state_dict().items()})
        tok.save_pretrained(TYPE_DIR)
        (TYPE_DIR / "labels.json").write_text(json.dumps(TYPES), encoding="utf-8")
        (TYPE_DIR / "report.json").write_text(json.dumps(
            {"base": args.base, "args": vars(args), "final": True, "dev_fingerprint": "final (trained on train+dev)",
             "history": history}, indent=2), encoding="utf-8")
        print(f"\nfinal model saved to {TYPE_DIR}")
        return

    (TYPE_DIR / "labels.json").write_text(json.dumps(TYPES), encoding="utf-8")
    (TYPE_DIR / "report.json").write_text(json.dumps(
        {"base": args.base, "args": vars(args), "dev_fingerprint": fingerprint(dev_convs), "history": history, "best_dev_acc": best,
         "dev_confusions": best_confusion}, indent=2), encoding="utf-8")
    print(f"\nbest dev accuracy {best:.3f}; remaining confusions: {best_confusion}\nsaved to {TYPE_DIR}")


if __name__ == "__main__":
    main()
