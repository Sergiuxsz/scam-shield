"""Leak-free splits for training.

The dataset is generated from sentence templates with entity slots (names, organisations, amounts,
links). A random split puts the same template on both sides, so dev scores are inflated (dev F1 0.987,
type accuracy 1.0 while eval was lower). Here we:

1. GROUP conversations: two conversations are in one group if
     - they are linked in meta (pair_id / pair_with / truncated_from), or
     - they share a sender sentence after masking entities (see signature()).
   Union-find over those links. Whole conversations always stay on one side.
2. SPLIT dev by group (~15% of conversations), so dev sentences come from templates train never saw.
3. FILTER train: drop conversations sharing a masked sentence with V01-V11, or overlapping V01-V11
   text heavily (character 8-grams), so the final test set is not leaked into training.
4. EVAL-CLEAN subset: 931 of 1700 training conversations share a masked template sentence with eval,
   so the dataset's eval is only partly template-held-out. Instead of throwing half the training
   data away, benchmark.py reports eval on the conversations sharing NO masked sentence with train
   (eval_clean_ids). That is the honest held-out number.

Usage (stats):  .venv\\Scripts\\python data_split.py
"""
import sys as _sys
from pathlib import Path as _Path
_REPO = _Path(__file__).resolve().parents[1]
_sys.path[:0] = [str(_REPO / d) for d in ("detector", "training", "evaluation")]  # flat imports across folders

import json
import random
import re
from functools import lru_cache
from pathlib import Path

from catalog import DATA, norm

DATASET = DATA / "dataset"
MIN_TOKENS = 4          # shorter sentences ("Bună!", "Da.") are too generic to link conversations
V_OVERLAP_MAX = 0.5     # char-8gram overlap with any V01-V11 message above this -> drop from train

from encoder import mask_entities  # noqa: E402  (shared with the encoder input, so they always match)


def signature(text: str) -> str | None:
    """Template fingerprint of a sentence: masked, capitalised words (names, organisations) dropped
    except the first word, lowercased, no diacritics. None if too short to be distinctive."""
    words = mask_entities(text).split()
    kept = [w for i, w in enumerate(words) if i == 0 or not w[:1].isupper()]
    tokens = re.findall(r"<\w+>|[a-z]+", norm(" ".join(kept)))
    return " ".join(tokens) if len(tokens) >= MIN_TOKENS else None


def sentence_signatures(conv: dict) -> set[str]:
    out = set()
    for m in conv["messages"]:
        if m["from"] == "sender":
            for sentence in re.split(r"(?<=[.!?])\s+", m["text"]):
                sig = signature(sentence)
                if sig:
                    out.add(sig)
    return out


def load_jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def _groups(convs: list[dict]) -> dict[str, int]:
    parent = {c["id"]: c["id"] for c in convs}

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a, b):
        if a in parent and b in parent:
            parent[find(a)] = find(b)

    by_sig: dict[str, str] = {}
    by_pair: dict[str, str] = {}
    for c in convs:
        meta = c.get("meta", {})
        for key in ("pair_with", "truncated_from"):
            if meta.get(key):
                union(c["id"], meta[key])
        if meta.get("pair_id"):
            union(c["id"], by_pair.setdefault(meta["pair_id"], c["id"]))
        for sig in sentence_signatures(c):
            union(c["id"], by_sig.setdefault(sig, c["id"]))
    # Name each group by its smallest conversation id. The union-find ROOT depends on set iteration
    # order, which Python randomises per process (hash seed), so numbering groups by root made the
    # "seeded" split differ between train_encoder.py and tune.py. Min id is the same in every process.
    first = {}
    for c in sorted(convs, key=lambda c: c["id"]):
        first.setdefault(find(c["id"]), c["id"])
    names = sorted(set(first.values()))
    index = {name: i for i, name in enumerate(names)}
    return {c["id"]: index[first[find(c["id"])]] for c in convs}


def _grams(text: str, n: int = 8) -> set[str]:
    t = re.sub(r"\s+", " ", norm(text))
    return {t[i:i + n] for i in range(max(0, len(t) - n + 1))}


@lru_cache(maxsize=1)
def _protected() -> tuple[frozenset, list]:
    """Signatures of V01-V11 sentences, and 8-gram sets of V01-V11 messages."""
    sigs = set()
    v_grams = []
    for p in sorted((DATA / "validation_set").glob("*.json")):
        v = json.loads(p.read_text(encoding="utf-8-sig"))
        sigs |= sentence_signatures(v)
        v_grams += [_grams(m["text"]) for m in v["messages"] if m.get("from") == "sender"]
    return frozenset(sigs), v_grams


def leaks(conv: dict) -> str | None:
    """Why this training conversation would leak V01-V11 into training, or None."""
    sigs, v_grams = _protected()
    if sentence_signatures(conv) & sigs:
        return "shares a template sentence with V01-V11"
    for m in conv["messages"]:
        g = _grams(m["text"])
        if len(g) >= 30 and any(len(g & vg) / len(g) > V_OVERLAP_MAX for vg in v_grams):
            return "near-copy of a V01-V11 message"
    return None


def split_convs(dev: float = 0.15, seed: int = 0) -> tuple[list[dict], list[dict]]:
    """(train, dev): leaky conversations removed, then whole GROUPS assigned to dev until ~dev share."""
    convs = [c for c in load_jsonl(DATASET / "train.jsonl") if not leaks(c)]
    group_of = _groups(convs)
    members: dict[int, list[dict]] = {}
    for c in convs:
        members.setdefault(group_of[c["id"]], []).append(c)
    order = sorted(members)
    random.Random(seed).shuffle(order)
    # Strict linking (MIN_TOKENS 4) chains generic sentences into one giant group (~1200 conversations).
    # Looser linking was tested and leaks: at 8 tokens, 178/254 dev conversations shared a template
    # with train. So: strict groups, and a group bigger than the dev target always stays in train.
    target, dev_set, train_set = dev * len(convs), [], []
    for g in order:
        fits = len(members[g]) <= target and len(dev_set) < target
        (dev_set if fits else train_set).extend(members[g])
    return train_set + _extra_train(), dev_set


def _extra_train() -> list[dict]:
    """Opt-in extra TRAINING conversations (e.g. hand-written ones), never dev:
    SCAM_EXTRA_TRAIN = labeled.jsonl paths separated by ';', SCAM_EXTRA_REPEAT = oversampling (default 5).
    Unset (the default) -> nothing added, the split is exactly as before."""
    import os
    paths = [p for p in os.environ.get("SCAM_EXTRA_TRAIN", "").split(";") if p.strip()]
    repeat = int(os.environ.get("SCAM_EXTRA_REPEAT", "5"))
    extra = [c for p in paths for c in load_jsonl(Path(p))]
    return [{**c, "id": f"{c['id']}#x{k}"} for k in range(repeat) for c in extra]


# ---------------- augmentation (training only) ----------------

def augment(text: str, rng: random.Random) -> str:
    """Random surface noise so the model learns intent, not spelling: no diacritics (30%),
    ALL CAPS (5%), one swapped pair of adjacent letters (15%). Placeholders are left intact."""
    if rng.random() < 0.30:
        text = _strip_diacritics(text)
    if rng.random() < 0.05:
        text = re.sub(r"<\w+>|[^<]+", lambda m: m.group() if m.group().startswith("<") else m.group().upper(), text)
    if rng.random() < 0.15:
        spots = [i for i in range(len(text) - 1) if text[i].isalpha() and text[i + 1].isalpha()]
        if spots:
            i = rng.choice(spots)
            text = text[:i] + text[i + 1] + text[i] + text[i + 2:]
    return text


def _strip_diacritics(text: str) -> str:
    """Like norm() but keeps upper/lower case: 'Plătiți ACUM' -> 'Platiti ACUM'."""
    return "".join(c if norm(c) == c.lower() else (norm(c).upper() if c.isupper() else norm(c)) for c in text)


def fingerprint(convs: list[dict]) -> str:
    """Short hash of a set of conversation ids. Trainers store it; tune.py checks it matches."""
    import hashlib
    return hashlib.sha256(",".join(sorted(c["id"] for c in convs)).encode()).hexdigest()[:12]


def eval_clean_ids() -> set[str]:
    """Eval conversations that share no masked template sentence with ANY training conversation."""
    train_sigs = set().union(*(sentence_signatures(c) for c in load_jsonl(DATASET / "train.jsonl")))
    return {c["id"] for c in load_jsonl(DATASET / "eval.jsonl") if not sentence_signatures(c) & train_sigs}


if __name__ == "__main__":
    all_convs = load_jsonl(DATASET / "train.jsonl")
    reasons = {}
    for c in all_convs:
        r = leaks(c)
        if r:
            reasons[r] = reasons.get(r, 0) + 1
    kept = [c for c in all_convs if not leaks(c)]
    g = _groups(kept)
    sizes = sorted(((list(g.values()).count(i)) for i in set(g.values())), reverse=True)
    tr, dv = split_convs()
    tr_sigs = set().union(*(sentence_signatures(c) for c in tr))
    shared = sum(bool(sentence_signatures(c) & tr_sigs) for c in dv)
    print(f"train.jsonl: {len(all_convs)} conversations; dropped as leaks: {reasons}")
    print(f"groups: {len(sizes)}  largest: {sizes[:8]}  singletons: {sizes.count(1)}")
    print(f"split: train {len(tr)}  dev {len(dv)}  | dev conversations sharing a template sentence with train: {shared}")
    print(f"dev verdicts: { {v: sum(c['labels']['verdict'] == v for c in dv) for v in ('SAFE', 'SUSPICIOUS', 'SCAM')} }")
    print(f"dev types: {sorted({c['labels']['scam_type'] for c in dv})}")
