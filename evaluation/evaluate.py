"""Run a folder of scenarios and compare with the expected CSV, scored like the jury.

Jury, per scenario: verdict 3, type 2, and for SCAM threads first alert 2
(1 if one message late; V11 accepts 3-5). Any scam/suspicious marked SAFE: -3. Scaled to 30.
Flag precision/recall and exact-score matches are printed as diagnostics (not graded).

Usage:
  python evaluate.py                         # data/validation_set + expected CSV
  python evaluate.py --no-encoder   # rules only
"""
import sys as _sys
from pathlib import Path as _Path
_REPO = _Path(__file__).resolve().parents[1]
_sys.path[:0] = [str(_REPO / d) for d in ("detector", "training", "evaluation")]  # flat imports across folders

import argparse
import csv

import loader
import pipeline
from catalog import DATA

ALERT_WINDOWS = {"V11": (3, 5)}  # accepted windows from the brief


def load_expected(path) -> dict[str, dict]:
    with open(path, encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))
    for r in rows:
        r["risk_score"] = int(r["risk_score"])
        r["first_alert"] = int(r["first_alert"]) if r["first_alert"] else None
        r["red_flags"] = set(filter(None, r["red_flags"].split(";")))
    return {r["id"]: r for r in rows}


def jury_points(exp: dict, got: dict, n_messages: int) -> tuple[float, float]:
    pts, max_pts = 0.0, 5.0
    pts += 3 if got["verdict"] == exp["verdict"] else 0
    pts += 2 if got["scam_type"] == exp["scam_type"] else 0
    if exp["verdict"] == "SCAM" and n_messages > 1:
        max_pts += 2
        lo, hi = ALERT_WINDOWS.get(exp["id"], (exp["first_alert"], exp["first_alert"]))
        fa = got["first_alert"]
        if fa is not None and lo <= fa <= hi:
            pts += 2
        elif fa is not None and fa == hi + 1:
            pts += 1
    if exp["verdict"] != "SAFE" and got["verdict"] == "SAFE":
        pts -= 3
    return pts, max_pts


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("folder", nargs="?", default=str(DATA / "validation_set"))
    ap.add_argument("--csv", default=str(DATA / "validation_expected_results.csv"))
    ap.add_argument("--no-encoder", action="store_true")
    args = ap.parse_args()

    expected = load_expected(args.csv)
    print("signals:", pipeline.signals_available(), "| used: encoder =", not args.no_encoder)

    total = total_max = 0.0
    tp = fp = fn = 0
    exact_scores = 0
    header = f"{'id':5} {'verdict':22} {'type':48} {'score':9} {'alert':8} flags"
    print(header + "\n" + "-" * len(header))
    for sc in loader.load_folder(args.folder):
        got = pipeline.analyse(sc, use_encoder=not args.no_encoder)
        exp = expected.get(sc["id"])
        if exp is None:
            print(f"{sc['id']:5} {got['verdict']:22} {got['scam_type']:48} {got['risk_score']:<9} {str(got['first_alert']):8}")
            continue
        p, m = jury_points(exp, got, len(sc["messages"]))
        total, total_max = total + p, total_max + m
        gf, ef = set(got["red_flags"]), exp["red_flags"]
        tp, fp, fn = tp + len(gf & ef), fp + len(gf - ef), fn + len(ef - gf)
        exact_scores += got["risk_score"] == exp["risk_score"]

        def cell(g, e):
            return f"{g}" if g == e else f"{g}≠{e}"

        diff = " ".join([f"+{f}" for f in sorted(gf - ef)] + [f"-{f}" for f in sorted(ef - gf)]) or "ok"
        print(f"{sc['id']:5} {cell(got['verdict'], exp['verdict']):22} {cell(got['scam_type'], exp['scam_type']):48} "
              f"{cell(got['risk_score'], exp['risk_score']):9} {cell(got['first_alert'], exp['first_alert']):8} {diff}")

    if total_max:
        prec = tp / (tp + fp) if tp + fp else 0
        rec = tp / (tp + fn) if tp + fn else 0
        print(f"\njury points {total:.0f}/{total_max:.0f}  ->  accuracy {30 * max(total, 0) / total_max:.1f} / 30")
        print(f"flags: precision {prec:.2f}  recall {rec:.2f}  |  exact risk score {exact_scores}/{len(expected)}")


if __name__ == "__main__":
    main()
