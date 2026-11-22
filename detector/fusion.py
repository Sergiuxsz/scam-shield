"""Combine rules + encoder into one decision per flag.

Per message, a flag is ON if:
  1. a rule fired, or
  2. the encoder is sure enough (prob >= encoder_alone for that flag) and the message shows no
     sign of being a genuine notice (rules.legitimacy)
Thresholds come from config/fusion.json, tuned on the group-split dev set.

Then a thread-level gate decides which flags COUNT for the score:
  RF_IMPERSONATION only counts when something else is wrong. A real bank SMS also says
  "Banca Dunărea:", the claim alone isn't a scam (validation V03, V05).
"""
from catalog import load_config

RULES_ONLY_DEFAULT = ["RF_SUSPICIOUS_CONTACT"]  # only code can check the official list


def _config() -> dict:
    return load_config("fusion.json")


def _threshold(flag: str, key: str) -> float:
    cfg = _config()
    t = cfg.get("per_flag", {}).get(flag, {}).get(key, cfg["default"][key])
    if key == "encoder_alone":
        # The model deciding ALONE needs more confidence than dev-tuned F1 suggests: dev shares templates
        # with train, so the model is overconfident there. Floor chosen in tune.py.
        t = max(t, cfg.get("encoder_alone_floor", 0.0))
    return t


def fuse(rule_flags: dict[str, str], encoder_probs: dict[str, float] | None,
         legit: dict | None = None) -> dict[str, dict]:
    """Return {flag: {"evidence": str, "source": "rules"|"encoder"}}.
    legit = rules.legitimacy() signals for this message. If there are any, the encoder may not
    turn a flag on ALONE: a genuine notice ("aveți de primit... nu este necesară nicio acțiune")
    must not become SUSPICIOUS on one confident-but-unsupported model guess."""
    rules_only = set(_config().get("rules_only", RULES_ONLY_DEFAULT))
    # A legitimacy phrase only counts when the rules see nothing wrong in the same message:
    # refund scams also say "aveți de primit" (V06), but they come with a fake link or a data request.
    legit = legit if not (set(rule_flags) - {"RF_IMPERSONATION"}) else None
    on = {f: {"evidence": ev, "source": "rules"} for f, ev in rule_flags.items()}

    for flag in sorted(set(encoder_probs or {}) - set(on) - rules_only):
        p = encoder_probs[flag]
        if not legit and p >= _threshold(flag, "encoder_alone"):
            on[flag] = {"evidence": f"encoder {p:.2f}", "source": "encoder"}
    return on


def counted(thread_flags) -> set[str]:
    """Flags that count towards the score, after context gates."""
    flags = set(thread_flags)
    if flags == {"RF_IMPERSONATION"}:
        flags.discard("RF_IMPERSONATION")
    # A thread where EVERY flag comes from the encoder alone (no rule backing any of them) doesn't
    # count: on hand-written genuine messages the encoder alone over-read (T1717: a lone DATA_REQUEST 0.86).
    if _config().get("encoder_alone_needs_support") and isinstance(thread_flags, dict) and flags and             all(thread_flags[f].get("source") == "encoder" for f in flags):
        return set()
    return flags
