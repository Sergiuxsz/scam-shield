"""Signal 1: deterministic rules.

Logic only. All vocabulary (words, patterns, categories) lives in config/rules.toml.
Everything is matched on norm(text): lowercase, no diacritics, same length as the original.

  claim(scenario, message)  -> {org, category} | None   who the message says it comes from
  detect(scenario, message) -> {flag: evidence}          flags the rules are confident about
"""
import re
import tomllib

from catalog import CONFIG, compact, digits, is_official_domain, norm, official_contacts, official_phones

with open(CONFIG / "rules.toml", "rb") as f:
    CFG = tomllib.load(f)


def _words(words: list[str]) -> str:
    """["cod", "otp"] -> r"\b(cod|otp)\b"  (plain words, matched as whole words)"""
    return r"\b(" + "|".join(re.escape(w) for w in words) + r")\b"


# ---------------- compiled from config, once at import ----------------

TLDS = "|".join(CFG["contacts"]["tlds"])
URL_RE = re.compile(rf"\b(?:https?://)?(?:www\.)?((?:[a-z0-9-]+\.)+(?:{TLDS}))\b(?:/\S*)?")
PHONE_RE = re.compile(r"(?:\+40|\b0)[\s.-]?\d(?:[\s.-]?\d){8}\b")  # 10-digit Romanian numbers

CATALOG_CATEGORY = CFG["claims"]["catalog_category"]


def _org_pattern(org: str) -> re.Pattern:
    """'Banca Dunărea' -> \\bbanca\\s*dunarea\\b : whole words, spaces optional ('BancaDunarea').
    Whole words matter: a plain substring check read the sender 'Ana (frate)' as 'ANAF'."""
    words = re.findall(r"[a-z0-9]+", norm(org))
    if len(words) == 1 and org[1:] != org[1:].lower():  # 'PiațaMea', 'MegaShop', 'CurierExpres'
        words = re.findall(r"[a-z0-9]+", norm(re.sub(r"(?<=[a-zăâîșț])(?=[A-ZĂÂÎȘȚ])", " ", org)))
    return re.compile(r"\b" + r"\s*".join(map(re.escape, words)) + r"\b")


CATALOG_ORGS = [(c, _org_pattern(c["organisation"])) for c in official_contacts()]
GENERIC_CLAIMS = [(re.compile(c["pattern"]), c["label"], c["category"]) for c in CFG["claims"]["generic"]]

CODE_WORD = re.compile(_words(CFG["code_request"]["code_words"]))
REQUEST_VERB = re.compile(_words(CFG["code_request"]["request_verbs"]))

PATTERNS = {flag: re.compile("|".join(alts)) for flag, alts in CFG["patterns"].items()}
LEGIT = {name: re.compile("|".join(alts)) for name, alts in CFG.get("legitimacy", {}).items()}

NEG = CFG["negation"]
NEGATABLE = set(NEG["flags"])
NEG_BEFORE = re.compile("|".join(NEG["before"]))

SENTENCE_RE = re.compile(r"[^.!?\n]+")


# ---------------- helpers ----------------

def _negated(sentence: str, start: int) -> bool:
    before = sentence[max(0, start - NEG["window"]):start]
    return bool(NEG_BEFORE.search(before)) or any(w in sentence for w in NEG["anywhere"])


def _sentences(text_n: str):
    """Yield (position, sentence). The position lets us cut evidence from the original text."""
    for m in SENTENCE_RE.finditer(text_n):
        yield m.start(), m.group()


def _strip_urls(text_n: str) -> str:
    """Blank out links (same length) so 'piatamea-plati.com' isn't read as a claim to be PiațaMea."""
    return URL_RE.sub(lambda m: " " * len(m.group()), text_n)


# ---------------- public API ----------------

def claim(scenario: dict, message: dict) -> dict | None:
    """Uses the text, plus the sender name for SMS/e-mail only
    (on chat apps the user picks the display name, e.g. "Cumpărător PiațaMea")."""
    sources = [message["text"]]
    if scenario["channel"] in ("sms", "email") and scenario["sender"]["name"]:
        sources.append(scenario["sender"]["name"])
    normed = [_strip_urls(norm(src)) for src in sources]
    # Pass 1: an official-catalog name anywhere (text or sender name) beats a generic word in the text,
    # e.g. an e-mail from "ANAF" that mentions "conturile bancare" is ANAF, not a bank.
    for src_n in normed:
        for c, rx in CATALOG_ORGS:
            if rx.search(src_n):
                return {"org": c["organisation"], "category": CATALOG_CATEGORY.get(compact(c["organisation"]), "other")}
    for src_n in normed:
        for rx, label, category in GENERIC_CLAIMS:
            if rx.search(src_n):
                return {"org": label, "category": category}
    return None


def legitimacy(scenario: dict, message: dict) -> dict[str, str]:
    """Signs of a genuine message: {signal: evidence}. Phrases from config/rules.toml, plus two checks:
    official_link    every link in the message is on the official list (and there is at least one)
    official_sender  the sender's e-mail domain is official"""
    text = message["text"]
    text_n = norm(text)
    found = {}
    for name, rx in LEGIT.items():
        m = rx.search(text_n)
        if m:
            found[name] = text[m.start():m.end()]
    domains = [m.group(1) for m in URL_RE.finditer(text_n)]
    if domains and all(is_official_domain(d) for d in domains):
        found["official_link"] = domains[0]
    address = scenario["sender"]["address"] or ""
    if "@" in address and is_official_domain(address.split("@")[-1]):
        found["official_sender"] = address
    return found


def detect(scenario: dict, message: dict) -> dict[str, str]:
    text = message["text"]
    text_n = norm(text)
    found: dict[str, str] = {}

    def add(flag, start, end):
        found.setdefault(flag, text[start:end].strip())

    # 1. links that are not on the official list
    for m in URL_RE.finditer(text_n):
        if not is_official_domain(m.group(1)):
            add("RF_SUSPICIOUS_CONTACT", m.start(), m.end())

    who = claim(scenario, message)

    # 2. phone numbers / sender e-mail not on the official list, when the message claims an organisation
    if who:
        for m in PHONE_RE.finditer(text_n):
            if digits(m.group()) not in official_phones():
                add("RF_SUSPICIOUS_CONTACT", m.start(), m.end())
        address = scenario["sender"]["address"] or ""
        if "@" in address and not is_official_domain(address.split("@")[-1]):
            found.setdefault("RF_SUSPICIOUS_CONTACT", address)

    # 3. code request: a code word anywhere + a request verb that isn't negated.
    #    Message-level, because they're often split: "...un cod prin SMS. Mi-l poți trimite înapoi?"
    if CODE_WORD.search(text_n):
        for offset, sentence in _sentences(text_n):
            verb = REQUEST_VERB.search(sentence)
            if verb and not _negated(sentence, verb.start()):
                add("RF_CODE_REQUEST", offset, offset + len(sentence))
                break

    # 4. flag patterns, sentence by sentence (negation is per sentence)
    for offset, sentence in _sentences(text_n):
        for flag, rx in PATTERNS.items():
            for m in rx.finditer(sentence):
                if flag in NEGATABLE and _negated(sentence, m.start()):
                    continue
                add(flag, offset + m.start(), offset + m.end())
                break

    # 5. impersonation claim (fusion only counts it once something else is wrong)
    if who:
        found.setdefault("RF_IMPERSONATION", who["org"])

    # 6. "new number" only means something if the sender is NOT a saved contact
    if scenario["sender"]["known_contact"]:
        found.pop("RF_NEW_NUMBER", None)

    # 7. switching to the channel we're already on isn't a switch
    if "RF_CHANNEL_SWITCH" in found and scenario["channel"] in norm(found["RF_CHANNEL_SWITCH"]):
        found.pop("RF_CHANNEL_SWITCH")

    return found
