# Statistici dataset

### train: 1700 exemple

| Verdict | N | % |
|---|---|---|
| SAFE | 595 | 35.0% |
| SUSPICIOUS | 255 | 15.0% |
| SCAM | 850 | 50.0% |

| Tip | SCAM | SUSPICIOUS | Total |
|---|---|---|---|
| BANK_IMPERSONATION | 71 | 22 | 93 |
| COURIER_FEE | 71 | 22 | 93 |
| AUTHORITY_IMPERSONATION | 71 | 22 | 93 |
| FAMILY_EMERGENCY | 71 | 21 | 92 |
| TECH_SUPPORT | 71 | 21 | 92 |
| MARKETPLACE | 71 | 21 | 92 |
| ACCOUNT_TAKEOVER | 71 | 21 | 92 |
| INVESTMENT | 71 | 21 | 92 |
| ROMANCE | 71 | 21 | 92 |
| JOB_OFFER | 71 | 21 | 92 |
| PRIZE_LOTTERY | 70 | 21 | 91 |
| OTHER | 70 | 21 | 91 |

SAFE hard negatives: 587/595 = 98.7% (țintă ≥60%). Subseturi: {'regular': 1550, 'contrast': 90, 'truncation': 60}
Fire: 1095 (64.4%, țintă ~55%); lungime 2–10, medie 5.2; replici cititor 40% (țintă 30–40%)
Fire SCAM cu first_alert ≥3: 406/582 = 69.8% (țintă ≥40%)
La marginea benzilor (20–30 sau 45–55): 323 = 19.0% (țintă ~20%)
Canale: whatsapp 31.3%, sms 29.0%, email 14.8%, call_transcript 13.6%, chat 11.3% (țintă sms 30, wa 25, email 15, chat 15, call 15)
known_contact=true: 23.5% (țintă ~20%)
Diacritice: fără 28.1%, sedile vechi 9.9%, standard 62.0%
Tehnici de link fals: hyphen 127, tld 73, typo 58, subdomain 53, shortener 45, random 30

| Flag | Pozitive | Near-miss (cuvânt-trigger prezent, flag off) |
|---|---|---|
| RF_CODE_REQUEST | 176 | 173 |
| RF_REMOTE_ACCESS | 157 | 177 |
| RF_DATA_REQUEST | 180 | 165 |
| RF_PAYMENT_REQUEST | 418 | 511 |
| RF_SUSPICIOUS_CONTACT | 406 | 260 |
| RF_NEW_NUMBER | 156 | 166 |
| RF_SECRECY | 196 | 149 |
| RF_TOO_GOOD | 345 | 249 |
| RF_IMPERSONATION | 629 | 195 |
| RF_URGENCY | 454 | 215 |
| RF_THREAT | 247 | 197 |
| RF_EMOTIONAL_PRESSURE | 178 | 227 |
| RF_CHANNEL_SWITCH | 217 | 164 |

Flaguri per SCAM: medie 3.68 (țintă 2.5–4)


### eval: 300 exemple

| Verdict | N | % |
|---|---|---|
| SAFE | 105 | 35.0% |
| SUSPICIOUS | 45 | 15.0% |
| SCAM | 150 | 50.0% |

| Tip | SCAM | SUSPICIOUS | Total |
|---|---|---|---|
| BANK_IMPERSONATION | 13 | 4 | 17 |
| COURIER_FEE | 13 | 4 | 17 |
| AUTHORITY_IMPERSONATION | 13 | 4 | 17 |
| FAMILY_EMERGENCY | 13 | 4 | 17 |
| TECH_SUPPORT | 13 | 4 | 17 |
| MARKETPLACE | 13 | 4 | 17 |
| ACCOUNT_TAKEOVER | 12 | 4 | 16 |
| INVESTMENT | 12 | 4 | 16 |
| ROMANCE | 12 | 4 | 16 |
| JOB_OFFER | 12 | 3 | 15 |
| PRIZE_LOTTERY | 12 | 3 | 15 |
| OTHER | 12 | 3 | 15 |

SAFE hard negatives: 104/105 = 99.0% (țintă ≥60%). Subseturi: {'contrast': 60, 'regular': 210, 'truncation': 30}
Fire: 192 (64.0%, țintă ~55%); lungime 2–10, medie 5.0; replici cititor 40% (țintă 30–40%)
Fire SCAM cu first_alert ≥3: 61/93 = 65.6% (țintă ≥40%)
La marginea benzilor (20–30 sau 45–55): 62 = 20.7% (țintă ~20%)
Canale: whatsapp 31.7%, sms 27.3%, chat 16.3%, call_transcript 12.7%, email 12.0% (țintă sms 30, wa 25, email 15, chat 15, call 15)
known_contact=true: 14.7% (țintă ~20%)
Diacritice: fără 26.7%, sedile vechi 9.3%, standard 64.0%
Tehnici de link fals: hyphen 24, subdomain 16, typo 11, tld 10, shortener 9, random 9

| Flag | Pozitive | Near-miss (cuvânt-trigger prezent, flag off) |
|---|---|---|
| RF_CODE_REQUEST | 32 | 16 |
| RF_REMOTE_ACCESS | 22 | 23 |
| RF_DATA_REQUEST | 32 | 21 |
| RF_PAYMENT_REQUEST | 71 | 95 |
| RF_SUSPICIOUS_CONTACT | 75 | 40 |
| RF_NEW_NUMBER | 35 | 13 |
| RF_SECRECY | 20 | 13 |
| RF_TOO_GOOD | 58 | 35 |
| RF_IMPERSONATION | 119 | 39 |
| RF_URGENCY | 83 | 21 |
| RF_THREAT | 48 | 21 |
| RF_EMOTIONAL_PRESSURE | 32 | 29 |
| RF_CHANNEL_SWITCH | 38 | 11 |

Flaguri per SCAM: medie 3.56 (țintă 2.5–4)

## Shortcut check (Gururangan et al.)
Clasificator doar pe metadate (canal, lungime, are link, known_contact, expeditor anonim): acuratețe eval 0.68; clasa majoritară 0.50.

## Baseline TF-IDF + LogReg (adversarial filtering)
Acuratețe verdict pe eval: 0.85 (macro-F1 0.74). Pe subseturi: regular 0.87, contrast 0.82, truncation 0.83.
44 exemple eval marcate `meta.hard=true` (baseline-ul greșește). Raportați separat scorul pe ele.
