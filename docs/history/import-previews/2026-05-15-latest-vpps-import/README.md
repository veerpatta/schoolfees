# VPPS Latest-Excel Import Dry Run — 2026-05-15T05:33:41.910Z

**Import name:** `vpps-latest-2026-05-15-fullbook`
**Production session:** `2026-27`
**DB probe:** no — workbook-only mode

## Workbook counts vs expected facts

| Sheet | Expected | Detected | Match |
|---|---:|---:|:---:|
| latestStudentsActive | 466 | 466 | ✓ |
| supabaseStudentsActive | 466 | 466 | ✓ |
| reviewNeeded | 35 | 35 | ✓ |
| addedNewNotInPdf | 23 | 23 | ✓ |
| leftStudents | 67 | 67 | ✓ |
| paymentsCurrent | 363 | 363 | ✓ |
| paymentsLeft | 60 | 60 | ✓ |
| feeLinesCurrent | 621 | 621 | ✓ |
| feeLinesLeft | 98 | 98 | ✓ |

Mismatches: **0**

## Student resolution

- Total intents: 457
- Inserts planned: 0
- Updates planned: 0
- Needs review: 35
- Skipped: 9
- Resolve errors (class/route lookup): 0

### Matched via

### Students by class
- Nursery: 20
- JKG: 25
- SKG: 23
- Class 1: 49
- Class 2: 33
- Class 3: 31
- Class 4: 27
- Class 5: 31
- Class 6: 35
- Class 7: 35
- Class 8: 44
- Class 9: 18
- Class 10: 22
- 11 Arts: 10
- 11 Commerce: 13
- 11 Science: 6
- 12 Arts: 21
- 12 Commerce: 6
- 12 Science: 8

## Left students (will be marked status=left; not deleted)

- Total: 67
- With outstanding fee-app balance: 32
- Total fee-app outstanding: ₹7,63,125

## Payments

- Total intents: 363
- Skipped: 0
- Mode-review required: 1
- Workbook duplicate-check warnings: 0
- Traced to Payment Report by Transaction ID: 0

### By payment mode
- cash: 225 rows, ₹20,65,669
- upi: 80 rows, ₹8,00,675
- bank_transfer: 57 rows, ₹2,45,662
- unknown: 1 rows, ₹29,500

### By session bucket
- 2025-26-or-older: 213 rows, ₹20,47,405
- 2026-27: 150 rows, ₹10,94,101

## Fee lines (current students)
- Total intents: 594
- Skipped: 27
- Total remaining: ₹24,52,775
- Total fine: ₹2,34,000

## Session state
```json
{
  "productionSessionLabel": "2026-27",
  "note": "DB probe skipped; session state not verified."
}
```

## Safety invariants (apply-mode)

- **neverMutatesPublicPayments**: `true`
- **neverMutatesPublicReceipts**: `true`
- **neverDeletesStudents**: `true`
- **neverTruncates**: `true`
- **idempotencyAnchor**: `private.vpps_student_source_mapping + source_student_uid`

## Files produced

- `summary.json`
- `student-intents.json` / `student-intents.csv`
- `payment-intents.json` / `payment-intents.csv`
- `feeline-intents.json`
- `left-student-intents.csv`
- `anomalies.csv`
