# Staged Payment Balance Verification Report

**Generated:** 2026-05-15  
**Project:** active Mumbai Supabase project `vgqyilgstjvgohrsiwkb`  
**Import name:** `vpps-latest-2026-05-15-fullbook`  
**Constraint:** Read-only investigation — no financial data was mutated.  
**Purpose:** Confirm whether the 363 rows in `private.vpps_direct_import_stage_dues`
affect any live balance, dues, defaulter, or dashboard calculation before fee reminders
are sent.

---

## Executive Summary

**Staged payments are completely isolated from all live calculations.** The staging table is
a holding area with no foreign keys, no view references, and no code path to any live
balance view or report. All five questions below are answered with evidence from live
queries against the production database.

However, a **separate critical bug** was discovered during this investigation:
`public.fee_policy_configs` has `TEST-2026-27` marked `is_active = true` while the real
`2026-27` row is `is_active = false`. This causes `workbook_installment_snapshot` —
the function underlying every balance view — to return **zero rows for all 2026-27
students**. Every live balance, defaulter entry, and dashboard total is currently
showing ₹0 for all students. This is a display-only bug (no data loss), but it must
be fixed before fee reminders are meaningful and before Payment Desk previews can be
trusted.

---

## Q1 — Are staged payments deducted from student balances anywhere?

**Answer: No.**

A query against `information_schema.routines` for any function body containing
`vpps_direct_import_stage_dues` returned exactly one result:

| Schema | Object | Type |
|---|---|---|
| `private` | `vpps_apply_chunk` | FUNCTION (import applier only) |

No balance view, no RPC, and no trigger references this table. The staging table schema
confirms the isolation — it has exactly four columns with no foreign keys:

| Column | Type |
|---|---|
| `import_name` | text |
| `source_key` | text |
| `payload` | jsonb |
| `created_at` | timestamptz |

Staged payments sitting in this table are invisible to every financial surface in the app.

---

## Q2 — Do Dashboard, Defaulters, Student Ledger, Payment Desk, and Exports use only `public.receipts` / `public.payments`?

**Answer: Yes, exclusively.**

The entire live calculation stack flows through one function, whose source was retrieved
directly from `pg_proc`:

```
private.workbook_installment_snapshot(p_student_id, p_as_of_date, p_include_candidate_late)
```

Its data sources, in order:

```sql
FROM public.installments AS i
JOIN public.students AS s ON s.id = i.student_id
JOIN public.classes AS c ON c.id = i.class_id
JOIN active_policy ON active_policy.academic_session_label = c.session_label
-- payments:
LEFT JOIN LATERAL (
  SELECT ... FROM public.payments AS payment_row
  JOIN public.receipts AS receipt_row ON receipt_row.id = payment_row.receipt_id
  WHERE payment_row.installment_id = session_installments.installment_id
) AS payment_row ON true
-- adjustments:
LEFT JOIN LATERAL (
  SELECT ... FROM public.payment_adjustments WHERE installment_id = ...
  UNION ALL
  SELECT ... FROM public.receipt_adjustments WHERE installment_id = ...
) AS adjustment_row ON true
```

`private.vpps_direct_import_stage_dues` appears **nowhere** in this function. Every
downstream surface reads from the same snapshot:

| Surface | Chain |
|---|---|
| `v_workbook_installment_balances` | `workbook_installment_snapshot(NULL, CURRENT_DATE, false)` |
| `v_workbook_student_financials` | aggregates `v_workbook_installment_balances` |
| `v_student_financial_state` | aggregates `v_workbook_student_financials` |
| Dashboard totals | `v_workbook_student_financials` |
| Defaulters list | `v_workbook_installment_balances` (overdue + pending filter) |
| Student Ledger | `v_workbook_installment_balances` filtered by student |
| Payment Desk preview RPC | `preview_workbook_payment_allocation` → same snapshot |
| Fee register export | `v_workbook_installment_balances` |

No staging table. No alternate paths.

---

## Q3 — 10-student comparison

Ten students from the largest-staged-total group were sampled using
`payload->>'sourceStudentUid'` → `private.vpps_student_source_mapping` → `public.students`.

### Staged payment overview (all 363 rows)

| Metric | Value |
|---|---|
| Total staged payment rows | 363 |
| Distinct students with staged payments | 229 |
| **Total staged amount** | **₹31,41,506** |
| — for `feeGroupSessionLabel = '2026-27'` (150 rows) | ₹10,94,101 |
| — for `feeGroupSessionLabel = '2025-26-or-older'` (213 rows) | ₹20,47,405 |
| Requires manual review (`paymentModeRequiresReview = true`) | 1 |
| Payment modes: Cash / UPI / Bank Transfer / Cheque / Blank | 225 / 80 / 57 / 0 / 1 |
| Students whose source UID has no mapping row | 19 (findable by admission no.) |

> **Note:** 65% of the staged payment value (₹20.47 lakh, 213 transactions) is for **prior
> academic years** (`2025-26-or-older`). These cannot be applied against 2026-27
> installments — they must be posted as prior-year clearing receipts.

### 10-student comparison table

Columns: 2026-27 dues generated by the repair step, posted payments already in
`public.payments`, staged amounts in the holding table, the balance expected if staged
payments were already posted and applied, and the live balance the app currently shows.

| Student | Class | Adm | 2026-27 Dues | Inst | Posted Pmts | Staged Pmts (all years) | Expected Balance† | Live Balance (app) |
|---|---|---|---|---|---:|---:|---:|---:|
| JITENDRA GURJAR | Class 2 | 2466 | ₹31,000 | 4 | ₹0 | ₹60,000 | ₹31,000 | **₹0 ★** |
| HIMMAT LAL GURJAR | Class 7 | 2315 | ₹29,500 | 4 | ₹0 | ₹46,600 | ₹29,500 | **₹0 ★** |
| JIYANSH LAKHARA | Class 3 | 606 | ₹26,500 | 4 | ₹0 | ₹42,500 | ₹26,500 | **₹0 ★** |
| KOMAL KANWAR RATHORE | Class 1 ‡ | 3285 | ₹0 | 0 | ₹0 | ₹41,200 | ₹0 | **₹0 ★** |
| BHAVYA SETH | Class 1 ‡ | 24 | ₹0 | 0 | ₹0 | ₹36,000 | ₹0 | **₹0 ★** |
| YATHARTH DADHICH | Class 6 | 420 | ₹9,125 | 1 | ₹0 | ₹35,000 | ₹9,125 | **₹0 ★** |
| GAURANSH DANGI | Class 6 | 2525 | (no mapping) | — | ₹0 | ₹35,000 | — | **₹0 ★** |
| REEVA DANGI | Class 4 | DIRECT-20260514 | ₹3,875 | 1 | ₹0 | ₹35,000 | ₹3,875 | **₹0 ★** |
| RAJVEER SINGH PANWAR | 12 Commerce | 2141 | (no mapping) | — | ₹0 | ₹32,500 | — | **₹0 ★** |
| RAVIRAJ SINGH PANWAR | Class 8 | 2271 | ₹29,000 | 4 | ₹0 | ₹32,300 | ₹29,000 | **₹0 ★** |

† `Expected balance` = 2026-27 dues minus posted payments only. Staged amounts are not
posted yet, so they do not reduce outstanding dues.

★ `Live balance (app) = ₹0` is **not** because staged payments are deducted.
It is caused by the `fee_policy_configs` bug described in Section 5. The snapshot function
finds no matching policy for session label `2026-27` and returns zero rows for all students.

‡ KOMAL and BHAVYA are on the inactive Class 1 row in the DB but their workbook payments
were tagged to Class 11 Science and Class 11 Commerce respectively — part of the 26
misassigned Class 1 orphans documented in
`docs/history/import-previews/2026-05-15-latest-vpps-import/orphan-active-students.csv`.
No 2026-27 installments were generated for them (correct: generator skips inactive-class
students). Their staged payments will still be postable via Payment Desk once the
correct class is set.

### Why live balance = ₹0 for every student

`workbook_installment_snapshot` contains this CTE at the top:

```sql
WITH active_policy AS (
  SELECT academic_session_label
  FROM public.fee_policy_configs
  WHERE is_active = true AND calculation_model = 'workbook_v1'
  ORDER BY updated_at DESC LIMIT 1
)
```

Current state of `fee_policy_configs`:

| `academic_session_label` | `is_active` | `updated_at` |
|---|---|---|
| `TEST-2026-27` | **true** ← wrong | 2026-05-07 |
| `2026-27` | **false** ← wrong | 2026-04-24 |

`active_policy` therefore resolves to `TEST-2026-27`. The subsequent join:

```sql
JOIN active_policy ON active_policy.academic_session_label = c.session_label
```

…fails for every class (all have `session_label = '2026-27'`), so the snapshot returns
**zero rows** — not because staged amounts are deducted, but because the policy lookup is
broken. This is a completely separate issue from staged payments.

---

## Q4 — Safe plan to post staged payments through Payment Desk

### Pre-conditions (must complete in order)

| Step | Action | Priority |
|---|---|---|
| **A** | Fix `fee_policy_configs` (see Section 5 SQL) | **Do first** — otherwise Payment Desk previews show ₹0 outstanding for every student and posting cannot be verified |
| **B** | Confirm CRYSTAL PAMECHA payment mode from physical receipt book (receipt 2243-2244-14, ₹29,500). Expected: cash. | Before posting her row |
| **C** | Resolve class assignment for the 26 Class 1 orphans including KOMAL KANWAR RATHORE and BHAVYA SETH | Before posting their rows |

### Posting approach

Payment Desk's `post_student_payment` RPC is the **only** permitted posting path (per the
project's Hard Safety Rules — no alternate payment-posting paths outside
`/protected/payments`). Each staged row contains all fields needed:

| Staged `payload` field | Payment Desk use |
|---|---|
| `admissionOrSr` | Student lookup by admission/SR number |
| `paymentDate` | Receipt date |
| `amount` | Payment amount |
| `paymentMode` | Cash / UPI / Bank Transfer |
| `receiptOrInvoiceNo` | Reference number (for notes / cross-check) |
| `feeGroupSessionLabel` | Session context (`2026-27` or `2025-26-or-older`) |
| `remarks` | Free-text notes to carry forward |

### Prior-year payments (213 rows, ₹20.47 lakh)

Staged rows with `feeGroupSessionLabel = '2025-26-or-older'` represent clearance of
prior-year outstanding dues. These should be posted to the student's account against
any outstanding balance; Payment Desk will allocate them to the oldest unpaid installment
first (earliest-due-first allocation), which is correct.

### Students with no source mapping (19 students)

19 of the 229 distinct staged students have no row in
`private.vpps_student_source_mapping` for this import. All 19 exist in `public.students`
and are findable by their `admissionOrSr` number from the payload. Payment Desk student
lookup by admission number handles this case without needing a mapping row.

### Append-only rule compliance

`post_student_payment` writes new rows to `public.receipts` and `public.payments` only.
It does not touch `vpps_direct_import_stage_dues`. The staging table remains unchanged
after posting — it is not consumed or deleted. Once all payments are posted and
reconciled, the staging rows can be archived or left in place as an audit trail.

### Suggested batching order

1. Post the 150 `2026-27` rows first (₹10.94 lakh) — these reduce the Defaulters list
   and are the most time-sensitive.
2. Post the 213 prior-year rows (₹20.47 lakh) — these clear historical outstanding dues.
3. CRYSTAL PAMECHA's row last (requires mode confirmation first).

---

## Q5 — Are there any other financial data paths affected?

**None found.** Explicit checks:

| Check | Result |
|---|---|
| `public.payment_adjustments` row count | 0 — no adjustments exist |
| `public.student_fee_overrides` row count | 0 — no overrides exist |
| `public.discount_assignments` row count | 0 — no discounts exist |
| Triggers on `vpps_direct_import_stage_dues` | None |
| Scheduled jobs / crons reading staging table | None found |
| `private.vpps_student_source_mapping` | 457 rows — metadata only, no balance impact |

---

## CRITICAL BLOCKER — `fee_policy_configs` `is_active` inversion

> **Fix this before sending fee reminders, posting payments, or trusting any balance figure.**

### Fix (two UPDATE statements)

```sql
-- Run in Supabase Dashboard → SQL Editor (service role)
UPDATE public.fee_policy_configs
SET    is_active  = true,
       updated_at = now()
WHERE  academic_session_label = '2026-27';

UPDATE public.fee_policy_configs
SET    is_active  = false,
       updated_at = now()
WHERE  academic_session_label = 'TEST-2026-27';
```

No migration, no redeploy. The balance calculation code is correct — only the policy
pointer is wrong. After this fix, all views immediately return correct live balances.

### Verification query (run immediately after fix)

```sql
-- Should return students with outstanding dues > 0
SELECT
  s.admission_no,
  s.full_name,
  SUM(vib.pending_amount) AS live_pending
FROM public.v_workbook_installment_balances vib
JOIN public.students s ON s.id = vib.student_id
WHERE vib.session_label = '2026-27'
GROUP BY s.id, s.admission_no, s.full_name
HAVING SUM(vib.pending_amount) > 0
ORDER BY live_pending DESC
LIMIT 10;
```

Expected: 516 students with non-zero pending amounts (matching all students on active
classes who have not yet paid). If this returns 0 rows, the fix did not take effect.

---

## Action sequence

| Step | Action | Who | Blocker for |
|---|---|---|---|
| 1 | Fix `fee_policy_configs` `is_active` (SQL above) | Admin | Everything below |
| 2 | Verify 10 students show correct balances in app | Admin | Steps 3–5 |
| 3 | Confirm CRYSTAL PAMECHA payment mode from receipt book | Accounts | Her staged row |
| 4 | Resolve Class 1 orphan assignments (esp. KOMAL, BHAVYA) | Admin | Their staged rows |
| 5 | Post 363 staged payments via Payment Desk (batch order: 2026-27 first, then prior-year, CRYSTAL last) | Accounts | Defaulters / reminders |
| 6 | Send fee reminders / defaulter notices | Admin | — |

---

## Artefacts

| Path | Purpose |
|---|---|
| `docs/history/imports/2026-05-15-staged-payment-balance-verification.md` | **This file** |
| `docs/history/imports/2026-05-15-live-readiness-report.md` | Prior readiness report (6 tasks completed) |
| `docs/history/import-previews/2026-05-15-latest-vpps-import/orphan-active-students.csv` | 60 orphan students (includes KOMAL, BHAVYA) |
| `docs/history/import-previews/2026-05-15-latest-vpps-import/anomalies.csv` | CRYSTAL PAMECHA `payment_review_required` row |
