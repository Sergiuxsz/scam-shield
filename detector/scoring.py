"""Deterministic scoring. No models here.

risk = min(100, sum of the points of the red flags found), each flag counted once per thread.
"""
from catalog import catalog, points

ALERT_THRESHOLD = 25  # first_alert = first message after which risk >= 25


def risk_score(flags) -> int:
    pts = points()
    return min(100, sum(pts[f] for f in set(flags) if f in pts))


def verdict(score: int) -> str:
    for name, (low, high) in catalog()["verdict_bands"].items():
        if low <= score <= high:
            return name
    return "SAFE"


def sort_flags(flags) -> list[str]:
    """Highest-points flags first (nicer for display and warnings)."""
    pts = points()
    return sorted(set(flags), key=lambda f: (-pts.get(f, 0), f))
