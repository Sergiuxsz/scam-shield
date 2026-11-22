# -*- coding: utf-8 -*-
"""
Mesaje de avertizare pentru UI (română). Aplicația folosește portul JS identic din app/src/warnings.js;
tools/check_warnings_parity.js verifică că ambele dau aceleași rânduri.

Reguli (brief, M6):
  - cel mult TREI propoziții scurte, câte una pe rând (lines):
        1. ce se întâmplă (verdictul)
        2. de ce (cele mai grave unul sau două motive, într-o singură propoziție)
        3. ce să faceți (o singură acțiune concretă, pe un canal oficial)
  - clar, calm, corect, cu „dumneavoastră"/„dvs.";
  - nu repetă niciodată linkurile sau numerele din mesajul analizat;
  - fără emoji, fără termeni tehnici (phishing, OTP), fără procente.

Folosire:
    from warnings_ro import compose_warning
    w = compose_warning(verdict="SCAM", scam_type="BANK_IMPERSONATION",
                        red_flags=["RF_IMPERSONATION", "RF_THREAT", "RF_URGENCY", "RF_SUSPICIOUS_CONTACT"],
                        messages=conversation["messages"], sender=conversation["sender"], first_alert=1)
    w["lines"]      -> lista de propoziții (cel mult 3)
    w["text"]       -> propozițiile unite cu "\\n"
    w["show_at"]    -> numărul mesajului la care apare avertismentul (None = imediat / SAFE)

    python warnings_ro.py                 # exemple încorporate
    python warnings_ro.py <kit>           # rulează pe validation_set/V01..V11 + validation_expected_results.csv

Istoric:
  - versiunea inițială (textele, motivele și acțiunile): colegul de la avertismente;
  - corecturi din UI: numere comparate întregi; ACCOUNT_TAKEOVER neutru; instituții la început de cuvânt;
    rând separat pentru e-mailul expeditorului;
  - aici: trei propoziții în loc de până la șase rânduri (brief: „at most three short sentences").
    Al doilea motiv se leagă de primul cu „, iar ..."; explicația motivului principal („Acest cod nu se dă
    nimănui...") rămâne doar când există un singur motiv; fiecare acțiune e o singură propoziție.
"""
import csv, json, os, re, sys, unicodedata

# ------------------------------------------------------------------ contacte oficiale (official_catalog.json)
OFFICIAL = {
    "Banca Dunărea": {"website": "bancadunarea.ro", "phone": "0800 100 200"},
    "CurierExpres": {"website": "curierexpres.ro", "phone": "0800 300 400"},
    "PiațaMea": {"website": "piatamea.ro", "phone": None},
    "MegaShop": {"website": "megashop.ro", "phone": "0800 500 600"},
    "ANAF": {"website": "anaf.ro", "phone": "031 403 91 60"},
}

# Alte instituții recunoscute în text (fără contacte oficiale în catalog). Potrivire la început de cuvânt.
AUTHORITY_KEYS = [
    ("politie", "Poliția"), ("poliția", "Poliția"), ("politia", "Poliția"), ("procuror", "Poliția"), ("diicot", "Poliția"), ("comisar", "Poliția"),
    ("bnr", "BNR"), ("banca nationala", "BNR"), ("banca națională", "BNR"),
    ("casa de pensii", "Casa de Pensii"), ("pensi", "Casa de Pensii"), ("cnas", "CNAS"), ("card de sanatate", "CNAS"), ("cardul de sănătate", "CNAS"),
    ("primari", "Primăria"), ("anaf", "ANAF"),
]

# ------------------------------------------------------------------ 1. ce se întâmplă (după verdict): o propoziție
TITLE = {
    "SCAM": "Atenție: acest mesaj pare o tentativă de fraudă.",
    "SUSPICIOUS": "Mesajul are semne de fraudă, așa că verificați înainte să faceți ceva.",
    "SAFE": "Nu am găsit semne de fraudă.",
}

# ------------------------------------------------------------------ 2. de ce (după flag)
# REASONS[f][0]: motivul ca propoziție întreagă (îl arată și pisica, unul pe rând).
# REASONS[f][1]: explicație, folosită doar când motivul e singur.
REASONS = {
    "RF_CODE_REQUEST": ["Vi se cere un cod primit prin SMS.", "Acest cod nu se dă nimănui, nici băncii."],
    "RF_REMOTE_ACCESS": ["Vi se cere să instalați un program prin care altcineva vă poate controla telefonul sau calculatorul."],
    "RF_DATA_REQUEST": ["Vi se cer datele cardului sau date personale.", "Nicio bancă sau instituție nu le cere prin mesaj sau la telefon."],
    "RF_PAYMENT_REQUEST": ["Vi se cer bani."],
    "RF_SUSPICIOUS_CONTACT": ["{contact_line}"],
    "RF_NEW_NUMBER": ["Cineva spune că e o rudă sau un prieten cu număr nou."],
    "RF_SECRECY": ["Vi se cere să nu spuneți nimănui.", "Escrocii fac asta ca să nu vă oprească nimeni."],
    "RF_TOO_GOOD": ["Vi se promite un câștig neașteptat."],
    "RF_IMPERSONATION": ["Pretinde că vine de la {org}, dar nu folosește canalele oficiale."],
    "RF_URGENCY": ["Vă grăbește, ca să nu aveți timp să verificați."],
    "RF_THREAT": ["Vă sperie cu blocarea contului sau cu amenzi."],
    "RF_EMOTIONAL_PRESSURE": ["Încearcă să vă emoționeze, ca să acționați repede."],
    "RF_CHANNEL_SWITCH": ["Vă cere să mutați discuția în altă aplicație."],
}
# Al doilea motiv, legat cu „, iar ...": scurt și cu subiect propriu, ca propoziția să rămână corectă.
SECOND = {
    "RF_CODE_REQUEST": "vi se cere un cod primit prin SMS",
    "RF_REMOTE_ACCESS": "vi se cere să instalați un program prin care altcineva vă poate controla telefonul sau calculatorul",
    "RF_DATA_REQUEST": "vi se cer datele cardului sau date personale",
    "RF_PAYMENT_REQUEST": "vi se cer bani",
    "RF_SUSPICIOUS_CONTACT": "{contact_clause}",
    "RF_NEW_NUMBER": "expeditorul spune că e o rudă sau un prieten cu număr nou",
    "RF_SECRECY": "vi se cere să nu spuneți nimănui",
    "RF_TOO_GOOD": "vi se promite un câștig neașteptat",
    "RF_IMPERSONATION": "mesajul pretinde că vine de la {org}",
    "RF_URGENCY": "mesajul vă grăbește",
    "RF_THREAT": "mesajul vă sperie cu blocarea contului sau cu amenzi",
    "RF_EMOTIONAL_PRESSURE": "mesajul încearcă să vă emoționeze",
    "RF_CHANNEL_SWITCH": "vi se cere să mutați discuția în altă aplicație",
}
FLAG_ORDER = ["RF_CODE_REQUEST", "RF_REMOTE_ACCESS", "RF_DATA_REQUEST", "RF_PAYMENT_REQUEST", "RF_SUSPICIOUS_CONTACT",
              "RF_NEW_NUMBER", "RF_SECRECY", "RF_TOO_GOOD", "RF_IMPERSONATION", "RF_URGENCY", "RF_THREAT",
              "RF_EMOTIONAL_PRESSURE", "RF_CHANNEL_SWITCH"]

# ------------------------------------------------------------------ 3. ce să faceți (după tip): o singură propoziție
# (cu contact oficial, fără contact). Varianta fără contact se folosește când organizația nu e în catalog
# sau când contactul oficial apare deja în mesaj (nu repetăm nimic din mesaj).
ACTIONS = {
    "BANK_IMPERSONATION": {
        "Banca Dunărea": ("Nu deschideți linkul și nu răspundeți; sunați la Banca Dunărea, la 0800 100 200.",
                          "Nu deschideți linkul și nu răspundeți; sunați la bancă, la numărul de pe spatele cardului."),
        None: (None, "Nu deschideți linkul și nu răspundeți; sunați la bancă, la numărul de pe spatele cardului."),
    },
    "COURIER_FEE": {
        "CurierExpres": ("Nu plătiți nimic; verificați coletul intrând singur pe curierexpres.ro.",
                         "Nu plătiți nimic; verificați coletul în aplicația oficială a curierului."),
        None: (None, "Nu plătiți nimic; verificați coletul intrând singur pe site-ul oficial al curierului."),
    },
    "FAMILY_EMERGENCY": {
        None: (None, "Nu trimiteți bani; sunați persoana înapoi la numărul vechi, pe care îl știți deja."),
    },
    "AUTHORITY_IMPERSONATION": {
        "ANAF": ("Nu completați nimic; verificați intrând singur pe anaf.ro.",
                 "Nu completați nimic; verificați în contul dvs. de pe site-ul oficial ANAF, tastat de dvs."),
        "Poliția": (None, "Închideți, pentru că Poliția nu cere niciodată bani la telefon; dacă ați dat deja bani, sunați la 112."),
        "BNR": (None, "Închideți, pentru că Banca Națională nu mută banii oamenilor în conturi sigure; dacă ați dat deja bani, sunați la 112."),
        "Casa de Pensii": (None, "Închideți și mergeți cu buletinul la ghișeul Casei de Pensii."),
        "CNAS": (None, "Închideți și întrebați-l pe medicul de familie despre cardul de sănătate."),
        "Primăria": (None, "Nu plătiți din mesaj; verificați direct la ghișeul primăriei."),
        None: (None, "Nu dați nicio informație; mergeți direct la ghișeul instituției."),
    },
    "TECH_SUPPORT": {
        None: (None, "Închideți și nu instalați nimic, pentru că Microsoft nu sună niciodată clienții."),
    },
    "MARKETPLACE": {
        "PiațaMea": ("Nu introduceți datele cardului; banii primiți îi vedeți doar în aplicație sau pe piatamea.ro.",
                     "Nu introduceți datele cardului; banii primiți îi vedeți doar în aplicația oficială."),
        None: (None, "Nu introduceți datele cardului; banii primiți îi vedeți doar în aplicația oficială a platformei."),
    },
    "ACCOUNT_TAKEOVER": {
        # Neutru: persoana poate fi bărbat sau femeie, iar numele poate lipsi.
        None: (None, "Nu trimiteți codul, pentru că acel cont poate fi spart; verificați printr-un apel la numărul pe care îl știți."),
    },
    "INVESTMENT": {
        None: (None, "Nu trimiteți bani, pentru că nu există câștiguri garantate; întrebați-vă întâi banca."),
    },
    "ROMANCE": {
        None: (None, "Nu trimiteți bani cuiva pe care nu l-ați întâlnit în persoană; vorbiți întâi cu cineva apropiat."),
    },
    "JOB_OFFER": {
        None: (None, "Nu plătiți și nu trimiteți buletinul, pentru că un angajator adevărat nu cere bani."),
    },
    "PRIZE_LOTTERY": {
        "MegaShop": ("Nu plătiți nicio taxă; verificați concursul intrând singur pe megashop.ro.",
                     "Nu plătiți nicio taxă; verificați concursul în contul dvs. de client MegaShop."),
        None: (None, "Nu plătiți nicio taxă; verificați concursul intrând singur pe site-ul oficial al magazinului."),
    },
    "OTHER": {
        None: (None, "Nu plătiți din link; verificați în aplicația oficială a furnizorului sau la numărul de pe factura de hârtie."),
    },
}

SAFE_TIPS = {
    "code": "Păstrați codul doar pentru dvs. și nu-l spuneți nimănui.",
    "default": "Dacă vi se cer ulterior bani, coduri sau date, verificați din nou.",
}

MAX_LINES = 3  # brief: at most three short sentences

# ------------------------------------------------------------------ utilitare
_LINK = re.compile(r"(?:https?://)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:/\S*)?", re.I)
_NUM = re.compile(r"(?:\+?\d[\d ]{6,}\d|\*\d{3,4}|\b\d{3,}\b)")


def _plain(s):
    s = (s or "").lower().replace("ş", "ș").replace("ţ", "ț")
    return "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))


def _digits(s):
    return re.sub(r"\D", "", s)


def _lcfirst(s):
    return s[:1].lower() + s[1:]


def _no_period(s):
    return s[:-1] if s.endswith(".") else s


def message_text(messages):
    return " ".join(m.get("text", "") for m in messages if m.get("from") == "sender")


def detect_org(text, sender=None):
    """Organizația pretinsă: întâi din cele 5 oficiale, apoi alte instituții."""
    t = _plain(text + " " + ((sender or {}).get("name") or ""))
    compact = t.replace(" ", "")
    for name in OFFICIAL:
        p = _plain(name)
        if p in t or p.replace(" ", "") in compact:
            return name
    for key, name in AUTHORITY_KEYS:
        if re.search(r"(^|[^a-z])" + re.escape(_plain(key)).replace(r"\ ", r"\s+"), t):
            return name
    if "windows" in t or "microsoft" in t:
        return "Microsoft"
    return None


def _contains_message_contact(line, text):
    """True dacă rândul repetă un link sau un număr care apare în mesaj (numere comparate întregi)."""
    pt = _plain(text)
    for m in _LINK.finditer(_plain(line)):
        dom = re.sub(r"^https?://", "", m.group(0)).split("/")[0]
        if dom and dom in pt:
            return True
    msg_nums = [d for d in (_digits(m.group(0)) for m in _NUM.finditer(text)) if len(d) >= 3]
    for m in _NUM.finditer(line):
        d = _digits(m.group(0))
        if len(d) < 3:
            continue
        for n in msg_nums:
            if n == d or (len(d) >= 6 and len(n) >= 6 and (d in n or n in d)):
                return True
    return False


def _contact_line(text, sender):
    if _LINK.search(text):
        return "Linkul din mesaj nu este cel oficial."
    if "@" in ((sender or {}).get("address") or ""):
        return "Adresa de e-mail nu este cea oficială."
    return "Numărul din mesaj nu este cel oficial."


def _fmt(s, org, contact_line):
    return (s.replace("{org}", org or "o instituție sau o firmă cunoscută")
             .replace("{contact_line}", contact_line)
             .replace("{contact_clause}", _lcfirst(_no_period(contact_line))))


def reason_clauses(flags, org, contact_line):
    """Fragmentele exacte din propoziția 2, în ordine (pentru evidențierea la citire)."""
    top = [f for f in FLAG_ORDER if f in flags][:2]
    out = []
    for i, f in enumerate(top):
        out.append(_no_period(_fmt(REASONS[f][0], org, contact_line)) if i == 0 else _fmt(SECOND[f], org, contact_line))
    return top, out


def _join(first, second):
    """„Vi se cere X și vi se cer Y" (același subiect) sau „X, iar mesajul Y" (subiecte diferite)."""
    same = _plain(first).startswith("vi se") and second.startswith("vi se")
    return first + (" și " if same else ", iar ") + second + "."


# ------------------------------------------------------------------ compunere
def compose_warning(verdict, scam_type="NONE", red_flags=None, messages=None, sender=None, first_alert=None, org=None):
    """În fire, pentru avertismentul live trimiteți doar mesajele de până acum și flagurile găsite până acum.
    Dacă red_flags lipsește, se adună din messages[].flags."""
    messages = messages or []
    if red_flags is None:
        red_flags = list(dict.fromkeys(f for m in messages for f in m.get("flags", [])))
    text = message_text(messages)
    org = org or detect_org(text, sender)
    lines = [TITLE.get(verdict, TITLE["SUSPICIOUS"])]

    if verdict == "SAFE":
        lines.append(SAFE_TIPS["code"] if re.search(r"\bcod", _plain(text)) else SAFE_TIPS["default"])
        return {"lines": lines, "text": "\n".join(lines), "show_at": None}

    # 2. de ce: unul sau două motive, o singură propoziție
    contact_line = _contact_line(text, sender)
    top, clauses = reason_clauses(red_flags, org, contact_line)
    if len(clauses) == 2:
        lines.append(_join(clauses[0], clauses[1]))
    elif len(clauses) == 1:
        extra = REASONS[top[0]][1:]
        lines.append(clauses[0] + (": " + _lcfirst(extra[0]) if extra else "."))

    # 3. ce să faceți: o singură acțiune
    by_org = ACTIONS.get(scam_type) or ACTIONS["OTHER"]
    with_contact, without_contact = by_org.get(org) or by_org.get(None) or next(iter(by_org.values()))
    lines.append(with_contact if with_contact and not _contains_message_contact(with_contact, text) else without_contact)

    # garanție finală: niciun rând nu repetă un link sau un număr din mesaj
    lines = [l for l in lines if not _contains_message_contact(l, text)][:MAX_LINES]
    return {"lines": lines, "text": "\n".join(lines), "show_at": first_alert}


# ------------------------------------------------------------------ demo
EXAMPLES = [
    ("SCAM", "BANK_IMPERSONATION", ["RF_IMPERSONATION", "RF_THREAT", "RF_URGENCY", "RF_SUSPICIOUS_CONTACT"], 1,
     {"name": "BancaDunarea", "address": "BancaDunarea", "known_contact": False},
     [{"n": 1, "from": "sender", "text": "Banca Dunărea: Cardul dvs. a fost blocat temporar din motive de securitate. Pentru deblocare, accesați în 24h: bancadunarea-securitate.com"}]),
    ("SAFE", "NONE", [], None, {"name": "BancaDunarea", "address": "BancaDunarea", "known_contact": False},
     [{"n": 1, "from": "sender", "text": "Banca Dunărea: Codul de confirmare este 482913. Nu comunicați acest cod nimănui, nici angajaților băncii."}]),
    ("SUSPICIOUS", "PRIZE_LOTTERY", ["RF_TOO_GOOD", "RF_IMPERSONATION"], 1, {"name": None, "address": "+40 7xx xxx 904", "known_contact": False},
     [{"n": 1, "from": "sender", "text": "Felicitări! Ați fost ales câștigătorul unui telefon nou la tombola MegaShop. Răspundeți cu DA pentru detalii."}]),
    ("SCAM", "ACCOUNT_TAKEOVER", ["RF_CODE_REQUEST", "RF_URGENCY"], 1, {"name": "Maria (vecina)", "address": "+40 7xx xxx 260", "known_contact": True},
     [{"n": 1, "from": "sender", "text": "Bună! Ți-am trimis din greșeală un cod de 6 cifre prin SMS. Mi-l poți trimite înapoi, te rog? E urgent!"}]),
]


def run_kit(kit):
    """Rulează pe setul de validare: CSV în kit/, scenariile în kit/validation_set/ (sau direct în kit/)."""
    csv_path = os.path.join(kit, "validation_expected_results.csv")
    scen_dir = os.path.join(kit, "validation_set") if os.path.isdir(os.path.join(kit, "validation_set")) else kit
    out = {}
    with open(csv_path, encoding="utf-8") as f:
        for r in csv.DictReader(f):
            with open(os.path.join(scen_dir, r["id"] + ".json"), encoding="utf-8") as g:
                conv = json.load(g)
            out[r["id"]] = compose_warning(r["verdict"], r["scam_type"], [x for x in r["red_flags"].split(";") if x],
                                           conv["messages"], conv["sender"], int(r["first_alert"]) if r["first_alert"] else None)
    return out


def _print(id_, w):
    print(f"=== {id_}  (afișat la mesajul {w['show_at'] or '-'})")
    print(w["text"])
    print()


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if len(sys.argv) > 2 and sys.argv[2] == "--json":
        print(json.dumps({k: v["lines"] for k, v in run_kit(sys.argv[1]).items()}, ensure_ascii=False))
    elif len(sys.argv) > 1:
        for id_, w in run_kit(sys.argv[1]).items():
            _print(id_, w)
    else:
        for i, (v, t, f, fa, s, m) in enumerate(EXAMPLES, 1):
            _print(f"exemplu {i}", compose_warning(v, t, f, m, s, fa))
