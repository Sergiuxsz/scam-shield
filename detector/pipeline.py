"""Glue: scenario -> result.

For each message n (reader replies count in numbering but aren't analysed):
    rules + encoder  ->  fusion  ->  add new flags to the thread  ->  score
    first n where score >= 25  ->  first_alert
Then verdict, scam type, warning, all deterministic.

Model outputs are cached in memory (key = hash of model + input), so analysing the
same file twice gives the same answer: the live re-run must match the dashboard.
(A local LLM was tried as a third signal and removed: see docs/LLM_EXPERIMENTS.md.)
"""
import hashlib
import json

import encoder
import fusion
import rules
import scam_type
import scoring
import warnings_ro
from catalog import contact_for

_cache: dict[str, object] = {}


def _cached(kind, payload, fn):
    key = hashlib.sha256(json.dumps([kind, payload], ensure_ascii=False, sort_keys=True).encode()).hexdigest()
    if key not in _cache:
        _cache[key] = fn()
    return _cache[key]


STRONG_CLAIMS = {"bank", "courier", "authority", "tech_support"}


def choose_type(rule_type: str, model_type: str, flags: set[str], claim: dict | None,
                strategy: str | None = None) -> str:
    """How the keyword ladder and the type model are combined. Strategy chosen on dev (tune.py):
    model_first         always the model
    rules_first         the ladder, model only when the ladder says OTHER
    model_unless_claim  the model, except when an org claim or remote access makes the ladder certain
    model_unless_org    the model, except when an org claim makes the ladder certain (remote access alone
                        isn't enough: investment/job scams also say "install the app")
    model_unless_catalog the model, except when the claim names an org from the official catalog
                        (a generic "curier" mention inside a marketplace scam isn't enough)"""
    strategy = strategy or fusion._config().get("type_strategy", "model_unless_claim")
    if strategy == "model_first":
        return model_type
    if strategy == "rules_first":
        return model_type if rule_type == "OTHER" else rule_type
    category = (claim or {}).get("category")
    if strategy == "model_unless_org":
        return rule_type if category in STRONG_CLAIMS else model_type
    if strategy == "model_unless_catalog":
        in_catalog = contact_for((claim or {}).get("org")) is not None
        return rule_type if in_catalog and category in STRONG_CLAIMS else model_type
    certain = category in STRONG_CLAIMS or "RF_REMOTE_ACCESS" in flags
    return rule_type if certain else model_type


def signals_available() -> dict[str, bool]:
    return {"rules": True, "encoder": encoder.available()}


def analyse(scenario: dict, use_encoder: bool = True, use_rules: bool = True) -> dict:
    """use_rules=False is only for benchmarking the models alone (claims still come from rules)."""
    use_encoder = use_encoder and encoder.available()

    thread_flags: dict[str, dict] = {}  # flag -> {n, evidence, source}, first time seen
    first_alert = None
    claim = None
    per_message = []

    for i, msg in enumerate(scenario["messages"]):
        new_flags: dict[str, dict] = {}
        legit: dict[str, str] = {}
        if msg["from"] == "sender" and msg["text"].strip():
            rule_flags = rules.detect(scenario, msg) if use_rules else {}
            legit = rules.legitimacy(scenario, msg) if use_rules else {}
            claim = claim or rules.claim(scenario, msg)

            ctx = encoder.format_context(scenario, scenario["messages"][:i])
            enc = _cached(("enc", encoder.model_id()), [msg["text"], ctx],
                          lambda: encoder.flag_probs(msg["text"], ctx)) if use_encoder else None

            for flag, info in fusion.fuse(rule_flags, enc, legit).items():
                if flag not in thread_flags:  # each flag counts once per thread
                    thread_flags[flag] = {"n": msg["n"], **info}
                    new_flags[flag] = info

        score = scoring.risk_score(fusion.counted(thread_flags))
        if first_alert is None and score >= scoring.ALERT_THRESHOLD:
            first_alert = msg["n"]
        per_message.append({**msg, "new_flags": new_flags, "legit": legit, "score": score})

    flags = fusion.counted(thread_flags)
    score = scoring.risk_score(flags)
    verdict = scoring.verdict(score)

    if verdict == "SAFE":
        stype, first_alert = "NONE", None
    else:
        stype = scam_type.classify(scenario, flags, claim)
        if use_encoder and encoder.type_model_available():
            probs = _cached(("type_model", str(encoder.TYPE_DIR)), encoder.format_thread(scenario),
                            lambda: encoder.type_model_probs(scenario))
            stype = choose_type(stype, max(probs, key=probs.get), flags, claim)
        elif stype == "OTHER" and use_encoder:
            # Zero-shot type scores run on CPU (slow), so only ask when the rules couldn't decide.
            enc_types = _cached(("enc_type", encoder.MODEL_NAME), _all_text(scenario),
                                lambda: encoder.type_scores(_all_text(scenario)))
            stype = scam_type.classify(scenario, flags, claim, enc_types)
        # Clear stories (explicit evidence: who they claim to be, family in trouble, code/vote, prize, job...)
        # override the model. Switch off with "type_stories": false in fusion.json.
        if fusion._config().get("type_stories", True):
            stype = scam_type.certain_type(scenario, flags, claim) or stype

    return {
        "id": scenario["id"],
        "verdict": verdict,
        "scam_type": stype,
        "risk_score": score,
        "first_alert": first_alert,
        "red_flags": scoring.sort_flags(flags),
        "warning": warnings_ro.warning(verdict, stype, flags, (claim or {}).get("org")),
        "claim": claim,
        "flag_details": {f: thread_flags[f] for f in flags},
        "per_message": per_message,
        "signals": {"rules": use_rules, "encoder": use_encoder and encoder.mode(), "llm": False},
        "llm_calls": 0,  # kept (always 0) because api.py / the UI read these two keys
    }


def _all_text(scenario: dict) -> str:
    return "\n".join(m["text"] for m in scenario["messages"] if m["from"] == "sender")
