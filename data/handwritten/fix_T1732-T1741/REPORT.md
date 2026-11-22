# Clean report: fix_T1732-T1741_clean

8 scenarios: SAFE 1, SUSPICIOUS 3, SCAM 4; 8 threads, 0 with the alert after message 1.

## Automatic fixes
- T1739: verdict 'SAFE' -> 'SUSPICIOUS' (recomputed from the message flags)
- T1739: risk_score 0 -> 25 (recomputed from the message flags)
- T1739: first_alert None -> 1 (recomputed from the message flags)
- T1739: red_flags [] -> ['RF_SUSPICIOUS_CONTACT']

## Warnings (a human decides)
- none
