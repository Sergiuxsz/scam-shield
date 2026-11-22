"""Compare detector configurations on the held-out eval set and on V01-V11.

Configurations:   rules only  |  encoder only  |  rules + encoder
Eval subsets:     all, regular, contrast, truncation, hard (TF-IDF baseline fails these),
                  unique (no sender message identical to a training message)
Scored like the jury (accuracy /30), plus verdict/type accuracy, missed scams, false alarms.

Usage:  ..\\.venv\\Scripts\\python benchmark.py
"""
import sys as _sys
from pathlib import Path as _Path
_REPO = _Path(__file__).resolve().parents[1]
_sys.path[:0] = [str(_REPO / d) for d in ("detector", "training", "evaluation")]  # flat imports across folders

import json
import sys
from pathlib import Path

import encoder
import evaluate
import loader
import pipeline
from catalog import DATA, norm

DS = DATA / "dataset"


def score(rows) -> str:
    if not rows:
        return "—"
    pts = sum(r["pts"] for r in rows)
    mx = sum(r["max"] for r in rows)
    v = sum(r["got"]["verdict"] == r["exp"]["verdict"] for r in rows) / len(rows)
    t = sum(r["got"]["scam_type"] == r["exp"]["scam_type"] for r in rows) / len(rows)
    missed = sum(r["exp"]["verdict"] != "SAFE" and r["got"]["verdict"] == "SAFE" for r in rows)
    false_alarm = sum(r["exp"]["verdict"] == "SAFE" and r["got"]["verdict"] != "SAFE" for r in rows)
    return f"{30 * max(pts, 0) / mx:5.1f}/30  verdict {v:4.0%}  type {t:4.0%}  missed {missed:3}  false alarms {false_alarm:3}"


def breakdown(rows, label: str) -> None:
    """Where the jury points go: lost points per category, plus the wrong-type confusions."""
    lost = {"verdict": 0, "type": 0, "first alert": 0, "missed-scam penalty": 0}
    confusions: dict[str, int] = {}
    alerts: list[str] = []
    for r in rows:
        e, g = r["exp"], r["got"]
        if g["verdict"] != e["verdict"]:
            lost["verdict"] += 3
        if g["scam_type"] != e["scam_type"]:
            lost["type"] += 2
            if e["verdict"] != "SAFE" and g["verdict"] != "SAFE":
                key = f"{e['scam_type']} -> {g['scam_type']}"
                confusions[key] = confusions.get(key, 0) + 1
        if e["verdict"] != "SAFE" and g["verdict"] == "SAFE":
            lost["missed-scam penalty"] += 3
        alert_lost = r["max"] - r["pts"] - (3 if g["verdict"] != e["verdict"] else 0) \
            - (2 if g["scam_type"] != e["scam_type"] else 0) - (3 if e["verdict"] != "SAFE" and g["verdict"] == "SAFE" else 0)
        if alert_lost > 0:
            lost["first alert"] += alert_lost
            alerts.append(f"{r['id']}:{g['first_alert']}≠{e['first_alert']}")
    total = sum(lost.values())
    print(f"   lost points ({label}): {total}  " + "  ".join(f"{k} {v}" for k, v in lost.items()))
    if confusions:
        print("   wrong types: " + ", ".join(f"{k} ×{v}" for k, v in sorted(confusions.items(), key=lambda x: -x[1])))
    if alerts:
        print("   first alert off: " + ", ".join(alerts[:12]))


def run(scenarios, expected, cfg) -> list[dict]:
    rows = []
    for s in scenarios:
        got = pipeline.analyse(s, **cfg)
        exp = expected[s["id"]]
        pts, mx = evaluate.jury_points(exp, got, len(s["messages"]))
        rows.append({"id": s["id"], "got": got, "exp": exp, "pts": pts, "max": mx})
    return rows


def main():
    configs = {"rules only": dict(use_rules=True, use_encoder=False)}
    if encoder.available():
        configs["encoder only"] = dict(use_rules=False, use_encoder=True)
        configs["rules + encoder"] = dict(use_rules=True, use_encoder=True)
    print("encoder mode:", encoder.mode())

    eval_sc = loader.load_folder(DS / "eval_kit")
    eval_exp = evaluate.load_expected(DS / "eval_expected_results.csv")
    meta = {json.loads(l)["id"]: json.loads(l)["meta"] for l in (DS / "eval.jsonl").read_text(encoding="utf-8").splitlines()}
    train_msgs = {norm(m["text"]) for l in (DS / "train.jsonl").read_text(encoding="utf-8").splitlines()
                  for m in json.loads(l)["messages"]}
    unique = {s["id"] for s in eval_sc
              if not any(m["from"] == "sender" and norm(m["text"]) in train_msgs for m in s["messages"])}
    from data_split import eval_clean_ids
    clean = eval_clean_ids()
    val_sc = loader.load_folder(DATA / "validation_set")
    val_exp = evaluate.load_expected(DATA / "validation_expected_results.csv")
    # Team-written out-of-distribution set (data/ood), used when present. The example file is skipped.
    ood_csv = DATA / "ood" / "ood_expected_results.csv"
    ood_exp = evaluate.load_expected(ood_csv) if ood_csv.exists() else {}
    ood_sc = [s for s in loader.load_folder(DATA / "ood") if s["id"] in ood_exp and s["id"] != "O00_EXAMPLE"] \
        if ood_exp else []

    subsets = {
        "eval all": lambda r: True,
        "  regular": lambda r: meta[r["id"]].get("subset") == "regular",
        "  contrast": lambda r: meta[r["id"]].get("subset") == "contrast",
        "  truncation": lambda r: meta[r["id"]].get("subset") == "truncation",
        "  hard": lambda r: meta[r["id"]].get("hard"),
        "  unique": lambda r: r["id"] in unique,
        "  CLEAN": lambda r: r["id"] in clean,  # no masked template sentence shared with train: the honest number
    }
    for name, cfg in configs.items():
        rows = run(eval_sc, eval_exp, cfg)
        print(f"\n=== {name} ===")
        for sub, keep in subsets.items():
            sel = [r for r in rows if keep(r)]
            print(f"{sub:13} n={len(sel):3}  {score(sel)}")
        if name != "rules only":
            breakdown(rows, "eval all")
            breakdown([r for r in rows if r["id"] in clean], "CLEAN")
        vrows = run(val_sc, val_exp, cfg)
        print(f"{'V01-V11':13} n={len(vrows):3}  {score(vrows)}")
        if ood_sc:
            orows = run(ood_sc, ood_exp, cfg)
            print(f"{'OOD (team)':13} n={len(orows):3}  {score(orows)}")
        wrong = [f"{r['id']}:{r['got']['verdict']}/{r['got']['scam_type']}/{r['got']['first_alert']}"
                 for r in vrows if r["pts"] < r["max"]]
        if wrong:
            print("   V wrong:", ", ".join(wrong))


if __name__ == "__main__":
    main()
