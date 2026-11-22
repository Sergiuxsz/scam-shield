"""Choose settings on DEV (the 15% of train held out by split_convs), never on eval.

1. type_strategy        how the type model and the keyword ladder combine (best dev jury score)
2. encoder_alone_floor  minimum confidence for the model to turn a flag on ALONE.
                        Rule: the HIGHEST floor that loses no dev points. Dev shares templates with
                        train, so the model is overconfident there; among equally good settings we take
                        the most cautious, because unseen wording (eval, the jury) gives lower confidence
                        and false alarms on real messages are what the jury's traps test.
Results are written to config/fusion.json.

Usage:  ..\\.venv\\Scripts\\python tune.py
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
from catalog import CONFIG
from data_split import fingerprint, split_convs

STRATEGIES = ["model_unless_claim", "model_unless_org", "model_unless_catalog", "rules_first", "model_first"]
FLOORS = [0.0, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 0.98]
CFG = CONFIG / "fusion.json"


def set_cfg(**kw):
    cfg = json.loads(CFG.read_text(encoding="utf-8"))
    cfg.update(kw)
    CFG.write_text(json.dumps(cfg, indent=2), encoding="utf-8")


def score_dev(dev) -> dict:
    pts = mx = type_ok = risky = missed = false_alarms = 0
    for c in dev:
        sc = loader.normalise(c)
        got = pipeline.analyse(sc)
        exp = {**c["labels"], "id": c["id"], "red_flags": set(c["labels"]["red_flags"])}
        p, m = evaluate.jury_points(exp, got, len(sc["messages"]))
        pts, mx = pts + p, mx + m
        if exp["verdict"] != "SAFE":
            risky += 1
            type_ok += got["scam_type"] == exp["scam_type"]
            missed += got["verdict"] == "SAFE"
        else:
            false_alarms += got["verdict"] != "SAFE"
    return {"jury": round(30 * pts / mx, 2), "type": type_ok / risky, "missed": missed, "false_alarms": false_alarms}


def main():
    _, dev = split_convs()
    print(f"dev: {len(dev)} conversations | encoder {encoder.mode()} | type model {encoder.type_model_available()}")
    # Refuse to tune on a dev set the models may have trained on.
    for model_dir in (encoder.FT_DIR, encoder.TYPE_DIR):
        report = json.loads((model_dir / "report.json").read_text(encoding="utf-8"))
        if report.get("dev_fingerprint") != fingerprint(dev):
            sys.exit(f"{model_dir.name} was trained with a different dev split "
                     f"({report.get('dev_fingerprint')} vs {fingerprint(dev)}). Retrain it first.")

    set_cfg(encoder_alone_floor=0.0)
    res = {}
    for s in STRATEGIES:
        set_cfg(type_strategy=s)
        res[s] = score_dev(dev)
        print(f"  type_strategy {s:20} {res[s]}")
    best_s = max(STRATEGIES, key=lambda s: (res[s]["jury"], -STRATEGIES.index(s)))
    set_cfg(type_strategy=best_s)
    print(f"-> type_strategy = {best_s}")

    res = {}
    for f in FLOORS:
        set_cfg(encoder_alone_floor=f)
        res[f] = score_dev(dev)
        print(f"  floor {f:<5} {res[f]}")
    top = max(r["jury"] for r in res.values())
    best_f = max(f for f in FLOORS if res[f]["jury"] >= top)
    set_cfg(encoder_alone_floor=best_f)
    print(f"-> encoder_alone_floor = {best_f} (highest floor with the best dev score {top})")


if __name__ == "__main__":
    main()
