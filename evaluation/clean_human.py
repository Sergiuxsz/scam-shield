"""Clean a batch of hand-written test scenarios, the same way every time.

Input: a .zip or folder with a *labeled.jsonl (one conversation per line, per-message "flags", "labels").
Output folder: scenarios/*.json (the brief's input format, no labels), expected_results.csv, labeled.jsonl,
REPORT.md (every automatic fix and every warning for a human to decide).

Automatic (mechanical, from the brief's rules):
  - labels recomputed from the per-message flags: red_flags, risk score (capped), verdict band,
    first alert (first message where the running score reaches 25), SAFE -> type NONE and no alert
  - unknown flag codes / scam types reported
Warnings (a human decides, nothing is changed):
  - a link not on the official list without RF_SUSPICIOUS_CONTACT (the brief: "anything not on this list
    counts as unofficial"), or RF_SUSPICIOUS_CONTACT on a message with only official links
  - links that aren't valid domains, or that give the answer away ("fals", "fake", "scam", "exemplu")
  - ACCOUNT_TAKEOVER without a code request or a link (the brief: "I sent you a code by mistake")
  - near-duplicates of V01-V11 or of another scenario in the batch
  - duplicate ids, empty messages

Usage:  ..\\.venv\\Scripts\\python clean_human.py <zip-or-folder> <out-folder>
Then:   ..\\.venv\\Scripts\\python evaluate.py <out>/scenarios --csv <out>/expected_results.csv
NEVER tune rules or thresholds on these: they are the honest test.
"""
import sys as _sys
from pathlib import Path as _Path
_REPO = _Path(__file__).resolve().parents[1]
_sys.path[:0] = [str(_REPO / d) for d in ("detector", "training", "evaluation")]  # flat imports across folders

import csv
import json
import re
import sys
import tempfile
import zipfile
from difflib import SequenceMatcher
from pathlib import Path

from catalog import DATA, catalog, is_official_domain, norm, points, scam_types
from rules import URL_RE

GIVEAWAY = re.compile(r"fals|fake|scam|exemplu|example|phish|teapa", re.I)
RAW_LINK = re.compile(r"(?:https?://)?(?:[\w-]+\.)+[a-z]{2,}(?:/\S*)?", re.I)


def verdict(score: int) -> str:
    for name, (lo, hi) in catalog()["verdict_bands"].items():
        if lo <= score <= hi:
            return name
    return "SAFE"


def load(src: Path) -> list[dict]:
    if src.suffix.lower() == ".zip":
        tmp = Path(tempfile.mkdtemp())
        with zipfile.ZipFile(src) as z:
            z.extractall(tmp)
        src = tmp
    files = sorted(src.rglob("*labeled*.jsonl")) or sorted(src.rglob("*.jsonl"))
    if not files:
        sys.exit(f"no .jsonl with labels found in {src}")
    return [json.loads(l) for f in files for l in f.read_text(encoding="utf-8").splitlines() if l.strip()]


def sender_text(c: dict) -> str:
    return " ".join(m["text"] for m in c["messages"] if m.get("from") == "sender")


def main():
    src, out = Path(sys.argv[1]), Path(sys.argv[2])
    convs = load(src)
    P, TYPES = points(), set(scam_types())
    fixes, warns = [], []
    val = {p.stem: sender_text(json.loads(p.read_text(encoding="utf-8")))
           for p in (DATA / "validation_set").glob("*.json")}
    seen = {}

    for c in convs:
        cid, L = c["id"], c.setdefault("labels", {})
        if cid in seen:
            warns.append(f"{cid}: duplicate id")
        seen[cid] = True
        # ---- per-message checks
        for m in c["messages"]:
            m["flags"] = [f for f in m.get("flags", []) if f]
            for f in m["flags"]:
                if f not in P:
                    warns.append(f"{cid}#{m['n']}: unknown flag {f}")
            if not m["text"].strip():
                warns.append(f"{cid}#{m['n']}: empty message")
            if m.get("from") != "sender":
                continue
            raw = [x.group(0) for x in RAW_LINK.finditer(m["text"])]
            doms = [x.group(1) for x in URL_RE.finditer(norm(m["text"]))]
            for r in raw:
                if "_" in r.split("/")[0]:
                    warns.append(f"{cid}#{m['n']}: '{r}' is not a valid domain (underscore); links won't be detected")
                if GIVEAWAY.search(r):
                    warns.append(f"{cid}#{m['n']}: link '{r}' gives the answer away")
            unofficial = [d for d in doms if not is_official_domain(d)]
            if unofficial and "RF_SUSPICIOUS_CONTACT" not in m["flags"]:
                warns.append(f"{cid}#{m['n']}: link {unofficial} not on the official list but no RF_SUSPICIOUS_CONTACT")
            if doms and not unofficial and "RF_SUSPICIOUS_CONTACT" in m["flags"] and "@" not in (c["sender"].get("address") or ""):
                warns.append(f"{cid}#{m['n']}: RF_SUSPICIOUS_CONTACT but every link is official")
        # ---- recompute labels from the per-message flags
        old = dict(L)
        seen_f, run, fa = [], 0, None
        for m in c["messages"]:
            for f in m["flags"]:
                if f in P and f not in seen_f:
                    seen_f.append(f)
                    run += P[f]
            if fa is None and min(run, 100) >= 25:
                fa = m["n"]
        L["red_flags"], L["risk_score"] = seen_f, min(100, run)
        L["verdict"] = verdict(L["risk_score"])
        if L["verdict"] == "SAFE":
            L["scam_type"], fa = "NONE", None
        elif L.get("scam_type") in (None, "", "NONE"):
            L["scam_type"] = "OTHER"
            warns.append(f"{cid}: non-SAFE without a type, set to OTHER (check)")
        L["first_alert"] = fa
        for k in ("verdict", "risk_score", "first_alert", "scam_type"):
            if old.get(k) != L[k]:
                fixes.append(f"{cid}: {k} {old.get(k)!r} -> {L[k]!r} (recomputed from the message flags)")
        if sorted(old.get("red_flags", [])) != sorted(seen_f):
            fixes.append(f"{cid}: red_flags {old.get('red_flags')} -> {seen_f}")
        if L["scam_type"] not in TYPES:
            warns.append(f"{cid}: unknown scam type {L['scam_type']}")
        if L["scam_type"] == "ACCOUNT_TAKEOVER" and not ({"RF_CODE_REQUEST", "RF_SUSPICIOUS_CONTACT"} & set(seen_f)):
            warns.append(f"{cid}: ACCOUNT_TAKEOVER without a code request or link (OTHER?)")
        # ---- near-duplicates
        t = norm(sender_text(c))
        for vid, vt in val.items():
            if SequenceMatcher(None, t, norm(vt)).ratio() > 0.7:
                warns.append(f"{cid}: very similar to validation {vid}")

    texts = [(c["id"], norm(sender_text(c))) for c in convs]
    for i in range(len(texts)):
        for j in range(i + 1, len(texts)):
            if SequenceMatcher(None, texts[i][1], texts[j][1]).ratio() > 0.85:
                warns.append(f"{texts[i][0]} and {texts[j][0]} are near-duplicates")

    # ---- write
    (out / "scenarios").mkdir(parents=True, exist_ok=True)
    (out / "labeled.jsonl").write_text("".join(json.dumps(c, ensure_ascii=False) + "\n" for c in convs), encoding="utf-8")
    for c in convs:
        sc = {"id": c["id"], "channel": c["channel"], "sender": c["sender"],
              "messages": [{"n": m["n"], "from": m["from"], "text": m["text"]} for m in c["messages"]]}
        (out / "scenarios" / f"{c['id']}.json").write_text(json.dumps(sc, ensure_ascii=False, indent=2), encoding="utf-8")
    with open(out / "expected_results.csv", "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["id", "verdict", "scam_type", "risk_score", "first_alert", "red_flags"])
        for c in convs:
            L = c["labels"]
            w.writerow([c["id"], L["verdict"], L["scam_type"], L["risk_score"], L["first_alert"] or "", ";".join(L["red_flags"])])
    v = [c["labels"]["verdict"] for c in convs]
    threads = sum(len(c["messages"]) > 1 for c in convs)
    late = sum((c["labels"]["first_alert"] or 0) > 1 for c in convs)
    report = [f"# Clean report: {src.name}", "",
              f"{len(convs)} scenarios: SAFE {v.count('SAFE')}, SUSPICIOUS {v.count('SUSPICIOUS')}, SCAM {v.count('SCAM')}; "
              f"{threads} threads, {late} with the alert after message 1.", "",
              "## Automatic fixes", *([f"- {x}" for x in fixes] or ["- none"]), "",
              "## Warnings (a human decides)", *([f"- {x}" for x in warns] or ["- none"])]
    (out / "REPORT.md").write_text("\n".join(report) + "\n", encoding="utf-8")
    print("\n".join(report))


if __name__ == "__main__":
    main()
