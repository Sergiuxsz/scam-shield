# franci_clean: changes from franci_fix

- **T1723**: link not on the official list -> RF_SUSPICIOUS_CONTACT (25) -> SUSPICIOUS, type ACCOUNT_TAKEOVER (same link rule as T1718/T1719; the dataset labels a friend sending a link as ACCOUNT_TAKEOVER, e.g. T1222)
- **T1724**: link not on the official list -> RF_SUSPICIOUS_CONTACT (25) -> SUSPICIOUS, type ACCOUNT_TAKEOVER (same link rule as T1718/T1719; the dataset labels a friend sending a link as ACCOUNT_TAKEOVER, e.g. T1222)
- **T1703**: type ACCOUNT_TAKEOVER -> OTHER (money request from a contact, no code)
- **T1722**: type ACCOUNT_TAKEOVER -> OTHER (money request from a contact, no code)
- **T1714**: link renamed: "exemplu-falsa.ro" gave the answer away
- **T1704**: link fixed: "vote_comp.ro" is not a valid domain (underscore)

All labels recomputed from the per-message flags (score, verdict, first alert, SAFE -> NONE).
Not changed (judgement calls, left as labelled): T1710 (Poliția Locală towing notice, SUSPICIOUS), T1712 msg 1 THREAT (fraud alert), T1717 SAFE (date of birth + e-mail is not on the brief's DATA_REQUEST list).

20 scenarios: SAFE 4, SUSPICIOUS 9, SCAM 7.
