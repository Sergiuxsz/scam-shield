"""Pick exactly one scam type.

Deterministic over: final flags + who the message claims to be + keywords in the thread.
The flags alone aren't enough (fake bank and fake ANAF have nearly the same flags),
so the claimed identity decides first. Model guesses only break ties at the end.
Order matters: the first rule that matches wins.
"""
import re

from catalog import norm, scam_types


def _thread_text(scenario: dict) -> str:
    parts = [m["text"] for m in scenario["messages"] if m["from"] == "sender"]
    parts.append(scenario["sender"]["name"] or "")
    return norm(" ".join(parts))


# ---------------- clear stories: override the type model when the evidence is explicit ----------------
# General principle: WHO the scammer pretends to be (and the story they tell) decides the type, not the
# technique (AnyDesk, a link, a code) and not topic words. Only explicit evidence returns a type here;
# anything ambiguous returns None and the model / keyword ladder decide as before.

STRONG = {"bank": "BANK_IMPERSONATION", "authority": "AUTHORITY_IMPERSONATION",
          "courier": "COURIER_FEE", "tech_support": "TECH_SUPPORT"}
FAMILY = (r"\b(fiul|fiica|fiu|copilul|copilului|nepotul|nepoata|nepotului|mami|mamico|mama|mamaie|mamaia|tati|tata|tataie"
          r"|bunico|bunicule|bunica|bunicul|bunicuta|sotul|sotia|frate|sora)\b")
DISTRESS = r"\b(accident\w*|spital\w*|arestat\w*|retinut\w*|operati\w*|cautiune|internat\w*|in stare critica)\b"
VOTE = r"\b(vot|votul|voteaza|votati|votezi|voturi)\b"
PRIZE = (r"\bcastig\w*|\bpremiu\w*|\btombola\b|\bloterie\b|\bfelicitari\b|\bati fost (ales|selectat)\w*|\bselectat\w*"
         r"|\bcadou\w*|\bvoucher\w*|\bmystery box\b|\bcutie misterioasa\b|\bextragere\w*|\bcampani\w* (promotional|aniversar)\w*")
JOB = (r"\bvenit suplimentar\b|\bsursa (suplimentara )?de venit\b|\blucr\w* de acasa\b|\blike-uri\b|\blike\b|\bsarcini\b"
       r"|\bjob\w*\b|\bloc de munca\b|\bangaj\w*|\brecrut\w*|\bpe zi\b|\bpe ora\b")
INVEST = r"\binvesti\w*|\bcrypto\w*|\bbitcoin\b|\brandament\w*|\btrading\b|\bactiuni\b|\bprofit garantat\b|\bbroker\w*"
ROMANCE = r"\bdragul meu\b|\bdraga mea\b|\bte iubesc\b|\biubit\w*|\bsufletul meu\b|\bdor de tine\b"
MARKET = r"\bcumparator\w*|\banunt\w*|\blivrare sigura\b|\bmai este disponibil\w*|\bvand\b|\bde vanzare\b"
UTILITY = (r"\bfactur\w*|\babonament\w*|\bdeconect\w*|\bsuspendar\w*|\bfurnizar\w*|\benergi\w*|\bcurent\w* electric\w*"
           r"|\bgaz\w*|\bclientul\b|\bbonus\w*|\b\d+ ?gb\b")
# A code request is an account takeover only in its own story ("sent to you by mistake", a friend, "logged out").
TAKEOVER = r"\bdin greseala\b|\bgresit\b|\bmi-a venit\b|\bti-a venit\b|\bmi-l (poti|trimiti|dai|zici)\b|\bdelogat\w*"
CONTACT_ONLY_FLAGS = {"RF_PAYMENT_REQUEST", "RF_URGENCY", "RF_SUSPICIOUS_CONTACT", "RF_SECRECY", "RF_EMOTIONAL_PRESSURE",
                      "RF_TOO_GOOD"}


def certain_type(scenario: dict, flags: set[str], claim: dict | None) -> str | None:
    text = _thread_text(scenario)
    cat = (claim or {}).get("category")
    known = bool(scenario["sender"].get("known_contact"))

    def has(pattern):
        return re.search(pattern, text) is not None

    # 1. "Send me the code / vote here": taking over an account. Not when an institution is claimed
    #    (a fake bank or pension office asking for the SMS code is still that institution's scam).
    #    Marketplace, courier and prize scams ask for codes too, so the code must come with its own story.
    if cat is None and "RF_REMOTE_ACCESS" not in flags and not has(MARKET) and not has(PRIZE):
        if ("RF_CODE_REQUEST" in flags and (known or has(TAKEOVER))) or (has(VOTE) and "RF_SUSPICIOUS_CONTACT" in flags):
            return "ACCOUNT_TAKEOVER"
    # 2. A relative in trouble asking for money (or a "new number"): family emergency, even when a
    #    doctor or a police officer is part of the story.
    if ("RF_NEW_NUMBER" in flags and "RF_PAYMENT_REQUEST" in flags) or \
            (has(FAMILY) and ("RF_NEW_NUMBER" in flags or ("RF_PAYMENT_REQUEST" in flags and (has(DISTRESS) or not known)))):
        return "FAMILY_EMERGENCY"
    # 3. Who they claim to be decides over the technique (AnyDesk, a link, a code).
    if cat in STRONG:
        return STRONG[cat]
    if "RF_REMOTE_ACCESS" in flags:
        return "TECH_SUPPORT"
    # 4. Story types, from what is promised or offered.
    # (a telecom/utility "bonus + gift" is labelled OTHER in the dataset, so it is not a prize here)
    if "RF_TOO_GOOD" in flags and has(PRIZE) and not has(JOB) and not has(INVEST) and not has(UTILITY):
        return "PRIZE_LOTTERY"
    if has(JOB) and flags & {"RF_TOO_GOOD", "RF_PAYMENT_REQUEST"}:
        return "JOB_OFFER"
    if has(INVEST) and flags & {"RF_TOO_GOOD", "RF_PAYMENT_REQUEST"}:
        return "INVESTMENT"
    if has(ROMANCE) and "RF_PAYMENT_REQUEST" in flags:
        return "ROMANCE"
    if cat == "marketplace" or has(MARKET):
        return "MARKETPLACE"
    # 5. "Clearly risky, none of the above" (brief): a saved contact asking for MONEY with no family story
    #    (a hacked or odd account), or a utility/subscription bill. A friend sending a bait LINK is labelled
    #    ACCOUNT_TAKEOVER in the dataset, so link-only messages are left to the model.
    if known and "RF_PAYMENT_REQUEST" in flags and flags <= CONTACT_ONLY_FLAGS and not has(FAMILY):
        return "OTHER"
    if has(UTILITY) and "RF_PAYMENT_REQUEST" in flags:
        return "OTHER"
    return None


def classify(scenario: dict, flags: set[str], claim: dict | None,
             encoder_types: dict[str, float] | None = None) -> str:
    text = _thread_text(scenario)
    cat = (claim or {}).get("category")

    def has(pattern):
        return re.search(pattern, text) is not None

    if "RF_REMOTE_ACCESS" in flags or cat == "tech_support":
        return "TECH_SUPPORT"
    if cat == "authority":
        return "AUTHORITY_IMPERSONATION"
    if cat == "bank":
        return "BANK_IMPERSONATION"
    if cat == "courier":
        return "COURIER_FEE"
    if cat == "marketplace" or has(r"\bcumparator\w*|\banunt\w*|\blivrare sigura\b|\bmai este disponibil"):
        return "MARKETPLACE"
    if "RF_NEW_NUMBER" in flags or (
            "RF_PAYMENT_REQUEST" in flags and has(r"\b(mami|mama|mamico|tati|tata|bunico|bunicule)\b")):
        return "FAMILY_EMERGENCY"
    if "RF_CODE_REQUEST" in flags and cat is None:
        return "ACCOUNT_TAKEOVER"
    if "RF_TOO_GOOD" in flags and has(r"\bcastig\w*|\bpremiu\w*|\btombola\b|\bloterie\b|\bfelicitari\b"):
        return "PRIZE_LOTTERY"
    if has(r"\binvesti\w*|\bcrypto\w*|\bbitcoin\b|\brandament\w*|\btrading\b"):
        return "INVESTMENT"
    if has(r"\bjob\w*|\bloc de munca\b|\blike-uri\b|\bsarcini\b|\bangaj\w*"):
        return "JOB_OFFER"
    if has(r"\bdragul meu\b|\bdraga mea\b|\bte iubesc\b|\biubit\w*"):
        return "ROMANCE"

    # Tie-break with the zero-shot encoder's best type score.
    valid = set(scam_types()) - {"NONE", "OTHER"}
    if encoder_types:
        best = max(encoder_types, key=encoder_types.get)
        if best in valid:
            return best
    return "OTHER"
