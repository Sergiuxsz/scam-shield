"""GUI.  Run:  streamlit run app.py

Tab 1 "Verificați un mesaj": paste text or open a JSON file, one big button, coloured result (M1, M7)
Tab 2 "Dashboard": load a whole folder in one action, one row per scenario, summary on top (M8)
       click a row -> messages, first-alert message highlighted, flags, warning (M9)
"""
import sys as _sys
from pathlib import Path as _Path
_REPO = _Path(__file__).resolve().parents[2]
_sys.path[:0] = [str(_REPO / d) for d in ("detector", "training", "evaluation")]  # flat imports across folders

import html
from pathlib import Path

import pandas as pd
import streamlit as st

import loader
import pipeline
from catalog import DATA

st.set_page_config(page_title="Scam Shield", page_icon="🛡️", layout="wide")

LOOK = {  # colour is never the only signal: icon + words too
    "SCAM": ("🛑", "Pare o țeapă! Nu răspundeți", "#b42318", "#fde8e6"),
    "SUSPICIOUS": ("⚠️", "Atenție, verificați înainte să răspundeți", "#8a5a00", "#fff4d6"),
    "SAFE": ("✅", "Pare în regulă", "#1d6b35", "#e5f5ea"),
}
FLAG_RO = {
    "RF_CODE_REQUEST": "Cere un cod", "RF_REMOTE_ACCESS": "Cere instalarea unui program",
    "RF_DATA_REQUEST": "Cere date personale / de card", "RF_PAYMENT_REQUEST": "Cere bani",
    "RF_SUSPICIOUS_CONTACT": "Adresă sau număr neoficial", "RF_NEW_NUMBER": "Număr nou",
    "RF_SECRECY": "Cere secret", "RF_TOO_GOOD": "Prea frumos ca să fie adevărat",
    "RF_IMPERSONATION": "Se dă drept o instituție", "RF_URGENCY": "Vă grăbește",
    "RF_THREAT": "Amenințare", "RF_EMOTIONAL_PRESSURE": "Presiune emoțională",
    "RF_CHANNEL_SWITCH": "Mută discuția în altă aplicație",
}

st.markdown("""
<style>
html, body, [class*="css"], .stMarkdown, .stTextArea textarea, .stButton button { font-size: 19px !important; }
.result { border-radius: 14px; padding: 18px 22px; margin: 10px 0; border: 3px solid; }
.result h2 { margin: 0 0 6px 0; font-size: 30px; }
.msg { border-radius: 10px; padding: 10px 14px; margin: 6px 0; border: 1px solid #ccc; }
.msg.reader { margin-left: 15%; background: #f2f2f2; color: #222; }
.msg.alert { border: 3px solid #b42318; }
.tag { display: inline-block; padding: 2px 8px; border-radius: 8px; background: #eee; color: #222;
       margin: 2px 4px 2px 0; font-size: 15px; }
</style>""", unsafe_allow_html=True)


# ---------------- shared rendering ----------------

def result_card(r: dict):
    icon, label, fg, bg = LOOK[r["verdict"]]
    st.markdown(
        f'<div class="result" style="border-color:{fg}; background:{bg}; color:{fg}">'
        f'<h2>{icon} {label}</h2>'
        f'<div style="color:#222">{html.escape(r["warning"])}</div></div>', unsafe_allow_html=True)
    c1, c2, c3 = st.columns(3)
    c1.metric("Risc", f'{r["risk_score"]} / 100')
    c2.metric("Tip", r["scam_type"])
    c3.metric("Prima alertă", f'mesajul {r["first_alert"]}' if r["first_alert"] else "—")


def detail(r: dict):
    result_card(r)
    st.subheader("Conversația")
    for m in r["per_message"]:
        cls = "msg " + m["from"] + (" alert" if m["n"] == r["first_alert"] else "")
        who = "Expeditor" if m["from"] == "sender" else "Dumneavoastră"
        tags = "".join(f'<span class="tag">{FLAG_RO.get(f, f)}</span>' for f in m["new_flags"])
        alert = " — <b>⚠️ aici începe avertizarea</b>" if m["n"] == r["first_alert"] else ""
        st.markdown(
            f'<div class="{cls}"><small>[{m["n"]}] {who} · risc {m["score"]}{alert}</small><br>'
            f'{html.escape(m["text"])}<br>{tags}</div>', unsafe_allow_html=True)
    with st.expander("De ce? (semnale tehnice)"):
        rows = [{"flag": f, "mesaj": d["n"], "sursă": d["source"], "dovadă": d["evidence"]}
                for f, d in r["flag_details"].items()]
        st.dataframe(pd.DataFrame(rows), hide_index=True, width="stretch")


# ---------------- sidebar: which signals ----------------

avail = pipeline.signals_available()
with st.sidebar:
    st.header("🛡️ Scam Shield")
    use_encoder = st.toggle("Encoder (NLI)", value=avail["encoder"], disabled=not avail["encoder"])
    st.caption("Reguli: mereu active. Nimic nu părăsește acest calculator.")


def run(scenario):
    return pipeline.analyse(scenario, use_encoder=use_encoder)


tab_check, tab_dash = st.tabs(["Verificați un mesaj", "Dashboard"])

# ---------------- tab 1: check one message ----------------

with tab_check:
    text = st.text_area("Lipiți aici mesajul primit:", height=160)
    uploaded = st.file_uploader("…sau deschideți un fișier de conversație (.json)", type="json")
    with st.expander("Detalii despre expeditor (opțional)"):
        split = st.checkbox("Fiecare rând este un mesaj separat")
        channel = st.selectbox("Canal", loader.CHANNELS, index=loader.CHANNELS.index("chat"))
        known = st.checkbox("Expeditorul este în agenda mea")
        sender_name = st.text_input("Numele expeditorului") or None
    if st.button("🔍  Verifică mesajul", type="primary", width="stretch"):
        if uploaded is not None:
            scenario = loader.load_bytes(uploaded.getvalue(), uploaded.name)
        else:
            scenario = loader.from_text(text, split_lines=split, channel=channel,
                                        known_contact=known, sender_name=sender_name)
        st.session_state["single"] = run(scenario)
    if "single" in st.session_state:
        detail(st.session_state["single"])

# ---------------- tab 2: dashboard ----------------

with tab_dash:
    c1, c2 = st.columns([3, 1])
    folder = c1.text_input("Dosar cu scenarii", value=str(DATA / "validation_set"))
    if c2.button("📂  Încarcă dosarul", width="stretch"):
        if Path(folder).is_dir():
            st.session_state["results"] = [run(s) for s in loader.load_folder(folder)]
        else:
            st.error("Dosarul nu există.")
    files = st.file_uploader("…sau alegeți mai multe fișiere", type="json", accept_multiple_files=True)
    if files and st.button("Analizează fișierele"):
        scenarios = sorted((loader.load_bytes(f.getvalue(), f.name) for f in files), key=lambda s: s["id"])
        st.session_state["results"] = [run(s) for s in scenarios]

    results = st.session_state.get("results")
    if results:
        counts = pd.Series([r["verdict"] for r in results]).value_counts()
        m = st.columns(4)
        m[0].metric("Scenarii", len(results))
        m[1].metric("🛑 SCAM", int(counts.get("SCAM", 0)))
        m[2].metric("⚠️ SUSPICIOUS", int(counts.get("SUSPICIOUS", 0)))
        m[3].metric("✅ SAFE", int(counts.get("SAFE", 0)))

        df = pd.DataFrame([{
            "ID": r["id"],
            "Verdict": f'{LOOK[r["verdict"]][0]} {r["verdict"]}',
            "Scam type": r["scam_type"],
            "Risk score": r["risk_score"],
            "First alert": str(r["first_alert"] or ""),
            "Red flags": ";".join(r["red_flags"]),
        } for r in results])

        def colour(row):
            bg = LOOK[row["Verdict"].split()[-1]][3]
            return [f"background-color: {bg}; color: #111"] * len(row)

        event = st.dataframe(df.style.apply(colour, axis=1), hide_index=True, width="stretch",
                             on_select="rerun", selection_mode="single-row")
        st.download_button("⬇️  Export CSV", df.to_csv(index=False).encode("utf-8"), "rezultate.csv", "text/csv")

        picked = event.selection.rows if event and event.selection else []
        if picked:
            st.divider()
            detail(results[picked[0]])
