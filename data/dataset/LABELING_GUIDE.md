# Ghid de etichetare

Ponderile, benzile de verdict și tipurile vin din `data_in/official_catalog.json`. Regulile de mai jos despre când se activează fiecare flag sunt deduse din cele 11 cazuri de validare. `scoring.py` reproduce exact `validation_expected_results.csv` (rulați `python check_validation.py`).

Generatorul pune flaguri **pe fiecare mesaj al expeditorului**. Mesajele cititorului (`from: "reader"`) nu au niciodată flaguri.
Scorul, verdictul și `first_alert` sunt calculate de cod, nu se scriu niciodată de mână.

## Reguli de calcul
- Scor = suma punctelor flagurilor **distincte** din conversație, plafonată la 100.
- SAFE 0–24, SUSPICIOUS 25–49, SCAM 50–100 (din catalog).
- `first_alert` = primul mesaj la care scorul cumulat ajunge la 25 *(dedus din V04, V08, V11)*. E gol dacă verdictul e SAFE.
- `scam_type` = NONE când verdictul e SAFE, chiar dacă există un flag slab (de ex. doar „număr nou”, 20 de puncte).

## Contacte oficiale
Doar cele 5 din catalog sunt oficiale: bancadunarea.ro / 0800 100 200, curierexpres.ro / 0800 300 400, piatamea.ro, megashop.ro / 0800 500 600, anaf.ro / 031 403 91 60.
- **Orice alt link sau număr** spre care trimite mesajul primește `RF_SUSPICIOUS_CONTACT`. Asta include domeniile look-alike (`bancadunarea-securitate.com`, `anaf.net`, `bancadunarea.ro.verificare.com`, `bancadunaera.ro`), shortenerele și numerele de mobil sau de fix necunoscute. Regula se aplică automat în generator.
- Exemplele SAFE conțin **doar** contacte oficiale (verificat de `lint.py`). Celelalte organizații (Banca Arieș, TelNova, EnergiaPlus etc.) apar în SAFE fără link și fără număr.
- Numele expeditorului nu e un semnal: un ID alfanumeric se poate falsifica (V01 și V03 au același expeditor).

## Flaguri: când DA și când NU

| Flag (puncte) | DA | NU (quirk-uri din cheie) |
|---|---|---|
| RF_CODE_REQUEST (35) | Cere un cod OTP sau un cod din SMS | „Nu comunicați codul nimănui” (V03): codul e doar afișat |
| RF_REMOTE_ACCESS (35) | AnyDesk, TeamViewer, un APK, „aplicația de securitate”, partajare de ecran | Mențiuni benigne („am instalat TeamViewer la tata ca să-l ajut”) |
| RF_DATA_REQUEST (30) | Card, CVV, CNP, parole, PIN, „intrați în contul de bancă” (V07) | — |
| RF_PAYMENT_REQUEST (25) | Taxă, transfer, depozit, vouchere | „Am plătit deja” (V08), „Ramburs: 0 lei” (V05) |
| RF_SUSPICIOUS_CONTACT (25) | Link sau număr neoficial spre care trimite mesajul | Linkul oficial (curierexpres.ro/awb, V05) |
| RF_NEW_NUMBER (20) | O persoană cunoscută pretinde că are un număr nou | „Telefon nou, același număr” |
| RF_SECRECY (20) | „Nu-i spune lui tata”, „nu anunțați banca” | O surpriză inofensivă între cunoscuți |
| RF_TOO_GOOD (20) | Premiu, majorare de pensie (V11), randament nerealist, bani ușori | **Rambursarea ANAF nu e TOO_GOOD** (V06) |
| RF_IMPERSONATION (15) | Expeditorul **se prezintă** ca o instituție sau o firmă | Un expeditor real fără alt flag (V03, V05). Ruda falsă e NEW_NUMBER, nu impersonare (V04). Cumpărătorul cu „Livrare Sigură” (V08) |
| RF_URGENCY (15) | „în 24h”, „azi”, „până la 30.11”, „expiră într-o oră”, „E urgent!” | Programări legitime („livrat azi”, V05). Formulări de pierdere fără termen („ca să nu pierdeți diferența”, V11) |
| RF_THREAT (15) | Card blocat, cont suspendat, amendă, dosar, viruși | Lucrări programate, card expirat în mod normal |
| RF_EMOTIONAL_PRESSURE (10) | Accident, spital, „dacă mă iubești”, „n-am pe nimeni altcineva” | **„Te rog” nu e presiune** (V10). Nici „am o problemă” sau „se enervează” (V04) |
| RF_CHANNEL_SWITCH (10) | Mută discuția pe WhatsApp sau Telegram, ori în afara platformei | Un cunoscut care propune un apel video pe WhatsApp |

## Pe ce mesaj se pune flagul
Flagul se pune pe mesajul în care apare semnalul. De exemplu, IMPERSONATION e la mesajul 1 în V07 și V11, chiar dacă cererea vine mai târziu. Un flag deja apărut nu se mai adună a doua oară.

## Tipuri
Cele 11 din catalog plus OTHER. În OTHER intră escrocheriile cu operatori telecom, energie și utilități (factură falsă, puncte de fidelitate, SIM swap / eSIM), adică clienții principali ai R Systems, plus chiriile și donațiile false.

## Unde nu sunt sigur (de confirmat cu un mentor)
- Mesajul „sunați la 07xx…” sau „scrieți-mi pe WhatsApp la 07xx…” primește RF_SUSPICIOUS_CONTACT pe lângă CHANNEL_SWITCH.
- Codul de la interfon cerut de curier, „Ramburs: 120 lei” la un curier oficial și surprizele între cunoscuți („nu-i spune lui X”) sunt etichetate fără flag.
