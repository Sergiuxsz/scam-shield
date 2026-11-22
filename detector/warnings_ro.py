"""Romanian warning from templates. No model writes this text, so it can't invent numbers.

Brief rules: at most 3 short sentences (what is happening + why, then what to do),
"dumneavoastră", no jargon, ONE action through an official channel from the catalog.
Never repeat a link or number from the suspicious message.
"""
from catalog import contact_for
from scoring import sort_flags

HEADLINE = {
    "SCAM": "Atenție, pare o țeapă!",
    "SUSPICIOUS": "Atenție, verificați înainte să răspundeți.",
    "SAFE": "Pare în regulă.",
}

WHO = {
    "BANK_IMPERSONATION": "Mesajul se dă drept banca dumneavoastră",
    "COURIER_FEE": "Mesajul se dă drept firma de curierat",
    "AUTHORITY_IMPERSONATION": "Mesajul se dă drept o instituție a statului",
    "FAMILY_EMERGENCY": "Cineva de pe un număr nou se dă drept o rudă",
    "TECH_SUPPORT": "Cineva se dă drept suport tehnic",
    "MARKETPLACE": "Un fals cumpărător",
    "ACCOUNT_TAKEOVER": "Cineva, poate de pe contul unei cunoștințe,",
    "PRIZE_LOTTERY": "Mesajul anunță un premiu",
    "INVESTMENT": "Mesajul promite câștiguri sigure din investiții",
    "JOB_OFFER": "Mesajul oferă bani ușor pentru sarcini simple",
    "ROMANCE": "O persoană cunoscută doar online",
    "OTHER": "Mesajul",
}
SUBJECT_ONLY = {"MARKETPLACE", "ACCOUNT_TAKEOVER", "ROMANCE", "OTHER"}

WHY = {
    "RF_CODE_REQUEST": "vă cere un cod primit prin SMS",
    "RF_REMOTE_ACCESS": "vă cere să instalați un program prin care altcineva vă controlează calculatorul",
    "RF_DATA_REQUEST": "vă cere datele cardului sau date personale",
    "RF_PAYMENT_REQUEST": "vă cere bani",
    "RF_SUSPICIOUS_CONTACT": "folosește o adresă de internet sau un număr care nu sunt oficiale",
    "RF_SECRECY": "vă cere să nu spuneți nimănui",
    "RF_TOO_GOOD": "promite ceva prea frumos ca să fie adevărat",
    "RF_URGENCY": "vă grăbește",
    "RF_THREAT": "încearcă să vă sperie",
    "RF_EMOTIONAL_PRESSURE": "se folosește de emoții",
    "RF_CHANNEL_SWITCH": "vă cere să continuați discuția în altă aplicație",
}

# Fixed actions. {phone}/{website} are filled ONLY from the official catalog.
ACTION = {
    "BANK_IMPERSONATION": "Nu apăsați pe nimic și nu dați niciun cod: sunați la numărul de pe spatele cardului.",
    "FAMILY_EMERGENCY": "Nu trimiteți bani: sunați-vă ruda la numărul vechi, pe care îl cunoașteți.",
    "ACCOUNT_TAKEOVER": "Nu trimiteți codul nimănui: sunați persoana la numărul pe care îl știți.",
    "TECH_SUPPORT": "Închideți și nu instalați nimic; cereți ajutorul unei persoane de încredere.",
    "MARKETPLACE": "Nu introduceți datele cardului, nu sunt necesare ca să primiți bani; vorbiți doar în aplicația oficială.",
    "INVESTMENT": "Nu trimiteți bani și cereți părerea unei persoane de încredere.",
    "JOB_OFFER": "Nu plătiți nicio taxă și cereți părerea unei persoane de încredere.",
    "ROMANCE": "Nu trimiteți bani și vorbiți cu cineva apropiat despre această persoană.",
    "OTHER": "Nu răspundeți și cereți părerea unei persoane de încredere.",
}
ACTION_WITH_CONTACT = {
    "phone": "Nu răspundeți și nu dați date: sunați la {org}, la {phone}.",
    "website": "Nu apăsați pe linkuri: intrați singur pe {website}.",
}
ACTION_NO_CONTACT = {
    "COURIER_FEE": "Nu plătiți nimic: verificați coletul doar pe site-ul oficial al curierului.",
    "AUTHORITY_IMPERSONATION": "Nu dați date la telefon sau pe internet: mergeți personal la instituție.",
    "PRIZE_LOTTERY": "Nu răspundeți și nu dați date: verificați direct pe site-ul oficial al magazinului.",
}

SAFE_TEXT = "Pare în regulă. Nu am găsit semne de înșelăciune. Dacă aveți dubii, sunați instituția la numărul ei oficial."


def _action(scam_type: str, claimed_org: str | None) -> str:
    if scam_type in ACTION:
        return ACTION[scam_type]
    c = contact_for(claimed_org)
    if c and c.get("phone"):
        return ACTION_WITH_CONTACT["phone"].format(org=c["organisation"], phone=c["phone"])
    if c and c.get("website"):
        return ACTION_WITH_CONTACT["website"].format(website=c["website"])
    return ACTION_NO_CONTACT.get(scam_type, ACTION["OTHER"])


def warning(verdict: str, scam_type: str, flags, claimed_org: str | None) -> str:
    if verdict == "SAFE":
        return SAFE_TEXT
    reasons = [WHY[f] for f in sort_flags(flags) if f in WHY][:2]  # the 2 heaviest flags
    who = WHO.get(scam_type, WHO["OTHER"])
    subject_only = scam_type in SUBJECT_ONLY  # "Un fals cumpărător" needs a verb right after
    if reasons:
        middle = who + (" " if subject_only else ", ") + " și ".join(reasons) + "."
    else:
        middle = who + (" pare neobișnuit." if subject_only else ".")
    return f"{HEADLINE[verdict]} {middle} {_action(scam_type, claimed_org)}"
