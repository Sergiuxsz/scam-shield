"""Official catalog access: red-flag points, verdict bands, scam types, official contacts.

Source of truth: data/official_catalog.json. Nothing here is hard-coded,
so if the organisers change a value, only the JSON changes.
"""
import json
import re
import unicodedata
from functools import lru_cache
from pathlib import Path


def _find_root() -> Path:
    # The repo root is the folder that contains data/official_catalog.json (detector/ is one level down).
    here = Path(__file__).resolve().parent
    for p in (here, here.parent):
        if (p / "data" / "official_catalog.json").exists():
            return p
    return here


ROOT = _find_root()
DATA = ROOT / "data"
CONFIG = ROOT / "config"


@lru_cache(maxsize=1)
def catalog() -> dict:
    return json.loads((DATA / "official_catalog.json").read_text(encoding="utf-8"))


def points() -> dict[str, int]:
    return catalog()["red_flag_points"]


def flag_codes() -> list[str]:
    return list(points().keys())


def scam_types() -> list[str]:
    return catalog()["scam_types"]


def official_contacts() -> list[dict]:
    return catalog()["official_contacts"]


def load_config(name: str):
    return json.loads((CONFIG / name).read_text(encoding="utf-8"))


# ---------------- text normalisation ----------------
# Scammers (and grandparents) often write without diacritics, so all matching
# happens on a lowercase, diacritic-free copy. The copy has the SAME LENGTH as
# the original, so a regex match position can be used to cut the original text.

_DIACRITICS = str.maketrans({
    "ș": "s", "ş": "s", "Ș": "s", "Ş": "s",
    "ț": "t", "ţ": "t", "Ț": "t", "Ţ": "t",
    "ă": "a", "Ă": "a", "â": "a", "Â": "a", "î": "i", "Î": "i",
})


def norm(text: str) -> str:
    out = []
    for ch in (text or "").translate(_DIACRITICS):
        base = unicodedata.normalize("NFKD", ch)[0].lower()
        out.append(base if len(base) == 1 else ch)
    return "".join(out)


def compact(text: str) -> str:
    """norm() without spaces/punctuation: 'Banca Dunărea' == 'BancaDunarea'."""
    return re.sub(r"[^a-z0-9]", "", norm(text))


def digits(text: str) -> str:
    d = re.sub(r"\D", "", text or "")
    if d.startswith("40") and len(d) == 11:  # +40 7xx... -> 07xx...
        d = "0" + d[2:]
    return d


# ---------------- official contacts ----------------

def official_domains() -> list[str]:
    return [c["website"].lower() for c in official_contacts() if c.get("website")]


def official_phones() -> set[str]:
    return {digits(c["phone"]) for c in official_contacts() if c.get("phone")}


def is_official_domain(domain: str) -> bool:
    domain = domain.lower().removeprefix("www.")
    return any(domain == d or domain.endswith("." + d) for d in official_domains())


def contact_for(org_name: str | None) -> dict | None:
    if not org_name:
        return None
    for c in official_contacts():
        if compact(c["organisation"]) == compact(org_name):
            return c
    return None
