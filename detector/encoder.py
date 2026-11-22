"""Signal 2: the encoder. Two modes, picked automatically:

1. FINE-TUNED (preferred): models/flag_encoder/ exists (made by train_encoder.py).
   One forward pass per message, 13 sigmoid outputs = 13 flag probabilities.
   Input = (message, context) as a sentence pair; context = channel, sender, earlier messages.

2. ZERO-SHOT (fallback): the pretrained NLI head, asked once per statement in
   config/hypotheses.json. No training. Also used for type_scores().

If torch/transformers aren't installed, available() is False and the pipeline skips this signal.
"""
import json
import os
import re
from functools import lru_cache
from pathlib import Path

from catalog import ROOT, load_config

MODEL_NAME = os.environ.get("SCAM_NLI_MODEL", "MoritzLaurer/mDeBERTa-v3-base-xnli-multilingual-nli-2mil7")
# SCAM_MODELS_DIR lets tuning use dev-held-out models kept elsewhere (e.g. on D:), while models/ holds
# the delivered --final models (trained on train+dev). tune.py checks the dev fingerprint either way.
MODELS_DIR = Path(os.environ.get("SCAM_MODELS_DIR", ROOT / "models"))
FT_DIR = MODELS_DIR / "flag_encoder"
MAX_LEN = 256
CONTEXT_MESSAGES = 2


URL_RX = re.compile(r"\b(?:https?://)?(?:www\.)?(?:[\w-]+\.)+[a-z]{2,}\b(?:/\S*)?", re.I)
EMAIL_RX = re.compile(r"\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b")
PHONE_RX = re.compile(r"(?:\+\d{2,3}[\s.-]?|\b0)\d[\dx\s.-]{6,}\d")
NUM_RX = re.compile(r"\d[\d.,]*")


def mask_entities(text: str) -> str:
    """Links, e-mails, phones, numbers -> <URL> <EMAIL> <TEL> <NUM>. Applied to every encoder input
    (training and inference), so the model learns the request, not one fake domain or amount.
    Links/numbers are judged by the rules against the official catalog anyway."""
    text = EMAIL_RX.sub("<EMAIL>", text or "")
    text = URL_RX.sub("<URL>", text)
    text = PHONE_RX.sub("<TEL>", text)
    return NUM_RX.sub("<NUM>", text)


def format_context(scenario: dict, earlier: list[dict]) -> str:
    """Second half of the input pair. Training and inference MUST use this same function."""
    s = scenario["sender"]
    who = "contact salvat" if s.get("known_contact") else "expeditor necunoscut"
    head = f"{scenario['channel']} | {who} | {s.get('name') or ''}"
    lines = [("Expeditor: " if m["from"] == "sender" else "Cititor: ") + mask_entities(m["text"])
             for m in earlier[-CONTEXT_MESSAGES:]]
    return " || ".join([head] + lines)


TYPE_DIR = MODELS_DIR / "type_encoder"
TYPE_MAX_LEN = 512


def format_thread(scenario: dict) -> str:
    """Input of the type model: sender metadata + the whole conversation. Shared with train_type.py."""
    s = scenario["sender"]
    who = "contact salvat" if s.get("known_contact") else "expeditor necunoscut"
    lines = [f"{scenario['channel']} | {who} | {s.get('name') or ''}"]
    lines += [("Expeditor: " if m["from"] == "sender" else "Cititor: ") + mask_entities(m["text"])
              for m in scenario["messages"]]
    return "\n".join(lines)


# ---------------- mode 1: fine-tuned ----------------

@lru_cache(maxsize=2)
def _load(model_dir):
    if not (model_dir / "labels.json").exists():
        return None
    try:
        import torch
        from transformers import AutoModelForSequenceClassification, AutoTokenizer
    except ImportError:
        return None
    # SCAM_ENCODER_DEVICE=cpu frees the GPU for other processes: two processes taking turns on one GPU
    # (CUDA + Vulkan) is very slow on one laptop GPU. The encoders are small; CPU is fine.
    device = os.environ.get("SCAM_ENCODER_DEVICE") or ("cuda" if torch.cuda.is_available() else "cpu")
    tok = AutoTokenizer.from_pretrained(model_dir)
    model = AutoModelForSequenceClassification.from_pretrained(model_dir).to(device).eval()
    labels = json.loads((model_dir / "labels.json").read_text(encoding="utf-8"))
    return tok, model, labels, device


def _finetuned():
    return _load(FT_DIR)


def _finetuned_probs(text: str, context: str) -> dict[str, float]:
    import torch
    tok, model, labels, device = _finetuned()
    enc = tok(mask_entities(text), context, truncation=True, max_length=MAX_LEN, return_tensors="pt").to(device)
    with torch.no_grad():
        probs = torch.sigmoid(model(**enc).logits.float())[0]
    return {label: round(float(p), 4) for label, p in zip(labels, probs)}


# ---------------- mode 2: zero-shot NLI ----------------

@lru_cache(maxsize=1)
def _classifier():
    try:
        import torch
        from transformers import pipeline
    except ImportError:
        return None
    # CPU on purpose: mDeBERTa's GPU kernels are wrong on the RTX 5060 with torch 2.11+cu128
    # (logits 1e-2 off the CPU result, TF32 off or on). 13 statements x a few messages is fine on CPU.
    return pipeline("zero-shot-classification", model=MODEL_NAME, device=-1)


def _hypotheses(section: str) -> dict[str, str]:
    # Skip entries you haven't written yet (empty strings).
    return {k: v for k, v in load_config("hypotheses.json")[section].items() if v.strip()}


def _score(text: str, hyps: dict[str, str], multi_label: bool) -> dict[str, float]:
    clf = _classifier()
    if clf is None or not hyps or not text.strip():
        return {}
    out = clf(text, candidate_labels=list(hyps.values()),
              hypothesis_template="{}",  # use our sentences exactly as written
              multi_label=multi_label)
    by_sentence = {sentence: key for key, sentence in hyps.items()}
    return {by_sentence[label]: round(float(score), 4) for label, score in zip(out["labels"], out["scores"])}


# ---------------- public API ----------------

def mode() -> str | None:
    if _finetuned() is not None:
        return "finetuned"
    if _hypotheses("flags") and _classifier() is not None:
        return "zeroshot"
    return None


def available() -> bool:
    return mode() is not None


def model_id() -> str:
    """Goes into the pipeline's cache key, so switching models never reuses stale outputs."""
    return f"{mode()}:{FT_DIR if mode() == 'finetuned' else MODEL_NAME}"


def flag_probs(text: str, context: str = "") -> dict[str, float]:
    if not text.strip():
        return {}
    if _finetuned() is not None:
        return _finetuned_probs(text, context)
    return _score(text, _hypotheses("flags"), multi_label=True)


def type_scores(text: str) -> dict[str, float]:
    """Zero-shot type scores (CPU, slow). Fallback only when no fine-tuned type model exists."""
    return _score(text, _hypotheses("types"), multi_label=False)


def type_model_available() -> bool:
    return _load(TYPE_DIR) is not None


def type_model_probs(scenario: dict) -> dict[str, float]:
    """Fine-tuned type model: softmax over the 12 scam types, from the whole thread."""
    loaded = _load(TYPE_DIR)
    if loaded is None:
        return {}
    import torch
    tok, model, labels, device = loaded
    enc = tok(format_thread(scenario), truncation=True, max_length=TYPE_MAX_LEN, return_tensors="pt").to(device)
    with torch.no_grad():
        probs = torch.softmax(model(**enc).logits.float(), dim=-1)[0]
    return {label: round(float(p), 4) for label, p in zip(labels, probs)}
