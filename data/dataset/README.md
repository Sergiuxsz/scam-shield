# Dataset sintetic: detecție scam în română

1.700 de exemple de train și 300 de eval, în formatul kit-ului, plus 182 de teste CheckList. Etichetele sunt calculate cu formula oficială din `official_catalog.json`.

## Ce e în `out/`
| Fișier | Conținut |
|---|---|
| `train.jsonl`, `eval.jsonl` | Câte o conversație pe linie: `messages[].flags` (flagurile pe mesaj), `labels` (verdict, scam_type, risk_score, first_alert, red_flags) și `meta` (scenariu, subset, near_miss, tehnica linkului fals, diacritice, `hard`) |
| `*_expected_results.csv` | Același format ca `validation_expected_results.csv` |
| `kit_format/train/T0001.json`… | Fișiere individuale, identice ca format cu V01–V11 (fără etichete) |
| `checklist.jsonl` | Teste comportamentale: INV (fără diacritice, alt nume, altă sumă, emoji: verdictul nu se schimbă), DIR (adaug „trimite-mi codul”: scorul crește; adaug „nu dați codul nimănui”: scorul nu crește), MFT (un test minim pe fiecare flag) |
| `STATS.md` | Raportul de calibrare, testul de scurtături și baseline-ul TF-IDF |

## Subseturile din eval (`meta.subset`)
- `contrast` (30 de perechi): aceeași conversație cu cea mai mică schimbare care întoarce verdictul (link fals ↔ oficial, cererea scoasă). Perechea se găsește prin `meta.pair_with`.
- `truncation`: fire de scam tăiate chiar înainte de primul semnal. Trebuie să rămână SAFE, altfel modelul dă alarme false pe deschideri inofensive.
- `meta.hard = true`: exemplele pe care baseline-ul TF-IDF le greșește. Raportați separat scorul pe ele, e cifra cea mai apropiată de mesajele-capcană ale juriului.
- Cele 11 cazuri V01–V11 **nu** apar nici în train, nici în eval: conversațiile aproape identice sunt eliminate, iar frazele copiate au fost reformulate. Rămân testul vostru final.

## Cum s-a construit (pentru slide-ul de metodă)
1. **Generare condiționată pe atribute** (Yu et al., 2023). Întâi se alege tipul × verdictul × scenariul × canalul × expeditorul × diacriticele, apoi se scrie conversația. Fiecare frază dintr-un șablon are fix flagurile beat-ului ei, deci etichetele vin din construcție, nu din părerea unui model.
2. **Șabloane separate pentru eval**. Al patrulea șablon din fiecare listă (indexul 3, 7, 11…) e păstrat doar pentru eval, ca eval-ul să nu repete formulările din train.
3. **Perechi minime** (Gardner et al., 2020) și **trunchieri**.
4. **Dedup** pe similaritate de n-grame de caractere, în interiorul fiecărui split, între train și eval, și față de V01–V11.
5. **CheckList** (Ribeiro et al., 2020).
6. **Adversarial filtering** (Zellers et al., 2018). Baseline-ul TF-IDF marchează exemplele grele.
7. **Testul de scurtături** (Gururangan et al., 2018). Un clasificator care vede doar metadatele ajunge la ~0,6–0,7, față de 0,50 pentru clasa majoritară. Aproape tot vine din lungimea textului. Nu dați modelului lungimea ca feature.

## Regenerare
```
python check_validation.py   # scorer-ul reproduce cheia oficială
python build.py              # generează out/
python analyze.py            # STATS.md + meta.hard pe eval
python lint.py               # invarianți: SAFE fără contacte neoficiale, etichete = formula etc.
```
Conținutul e în `content_scam.py` și `content_safe.py`, iar catalogul în `catalog.py`. Dacă adăugați un scenariu sau schimbați o regulă, rulați din nou cele patru comenzi.

## Limitări
- Datele sunt generate din șabloane, deci stilul e mai uniform decât în realitate. Folosiți train-ul pentru fine-tuning sau few-shot și eval-ul doar pentru comparații relative. Testul real rămâne V01–V11 plus setul ascuns.
- Regula pentru `first_alert` și câteva cazuri-limită sunt deduse (vezi finalul din `LABELING_GUIDE.md`).
- Verificați cu un mentor că datele sintetice sunt permise în regulament.
