# Post-Import Verification Review

Import batch: `96e1aaa1-e772-4fb1-872b-2b58eaaf4a27`

Target session: `2026-27`

Status: strict direct import verified as read-only follow-up. Do not import skipped rows until manual review is approved.

## Skipped Rows Needing Decision

### Review-needed open dues

Count: `10`

Amount: `INR 1,04,625`

Rows:

| Report row | Admission/SR | Student | Session | Class | Amount | Reason |
|---:|---|---|---|---|---:|---|
| 65 | 475 | NILANJANA . . | 2026-27 | Class 1 | 10,250 | Admission not found in member list |
| 94 | 563 | KUNDAN . LAL | 2026-27 | Class 2 | 9,875 | Admission not found in member list |
| 188 | 2335 | KARAMVEER SINGH INDA | 2026-27 | Class 7 | 9,750 | Admission not found in member list |
| 232 |  | PAWAN JAT | 2025-26 |  | 16,000 | Missing admission and no safe fallback |
| 363 | 525252 | MAHIRAJ SINGH CHUNDAWAT | 2026-27 | Class 3 | 9,500 | Admission not found in member list |
| 379 | 78533 | TANUSHREE KANWAR RATHORE | 2026-27 | Class 1 | 10,250 | Admission not found in member list |
| 474 |  | SOURABH SINGH | 2026-27 | Class 2 | 10,375 | Missing admission and no safe fallback |
| 530 | 10002 | UTKARSH NAMA | 2026-27 | Class 4 | 9,125 | Admission not found in member list |
| 631 | 5646876 | BHAGYASHREE CHUNDAWAT | 2026-27 | JKG | 9,000 | Admission not found in member list |
| 699 |  | PAWAN JAT | 2026-27 | Class 1 | 10,500 | Missing admission and no safe fallback |

### Matched but no current `2026-27` class

Count: `5`

Amount: `INR 1,06,500`

Rows:

| Report row | Admission/SR | Student | Session | Amount | Reason |
|---:|---|---|---|---:|---|
| 32 |  | PUJIT KOTHARI | 2025-26 | 30,000 | Matched member has no current `2026-27` class |
| 89 |  | Mehul Singh | 2025-26 | 5,000 | Matched member has no current `2026-27` class |
| 301 |  | NAINA SETH | 2025-26 | 40,500 | Matched member has no current `2026-27` class |
| 370 |  | KALP JAIN | 2025-26 | 10,000 | Matched member has no current `2026-27` class |
| 416 | 64445 | DIYA JAIN | 2025-26 | 21,000 | Matched member has no current `2026-27` class |

### Other skipped sources

- Unmatched/anomaly due rows in `anomalies.csv`: `29`
- Duplicate open due rows skipped from totals in `anomalies.csv`: `3`
- Member rows skipped because no current `2026-27` class was available: `18`

## Manual Decision Needed

1. Confirm whether each review-needed due belongs to an existing student with corrected SR/class/mobile details or should become a new student.
2. For the five previous-session dues without current class, decide whether the student should be added to `2026-27`, left as historical-only, or handled by a separate adjustment/import path.
3. Keep duplicate open due rows skipped unless the office confirms they represent separate fee heads rather than repeated report lines.
