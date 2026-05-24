# VPPS Import — Live-Readiness Report

**Generated:** 2026-05-15  
**Project:** active Mumbai Supabase project `vgqyilgstjvgohrsiwkb`  
**Import name:** `vpps-latest-2026-05-15-fullbook`  
**Based on:** `docs/history/imports/2026-05-15-final-apply-report.md`

All six live-readiness tasks completed. Production is ready for normal fee operations.

---

## 1. Dues repair — completed

**Action taken:** Generated missing 2026-27 installments directly via SQL using the
`workbook_v1` formula (`buildWorkbookInstallmentCharges`). Formula verified by dry-run
on 10 sample students before INSERT.

**Algorithm used (matches app generator exactly):**
```
academicFee   = 500 (all active fee_settings have student_type_default = "existing")
remainderBase = tuition_fee_amount + transport_annual_fee
basePerInst   = floor(remainderBase / 4)   -- splitAmountWithRemainderLast
lastBase      = remainderBase − basePerInst × 3
base_amount[1] = basePerInst + 500          -- academic charge on first installment
base_amount[2] = base_amount[3] = basePerInst
base_amount[4] = lastBase
transport_amount = 0 for all               -- workbook_v1: transport bundled in base
discount_amount  = 0 for all               -- no student_fee_overrides exist
late_fee_flat_amount = 1000
```

**Due dates / labels used (from existing clean installments):**
| # | Label | Due date |
|---|---|---|
| 1 | Installment 1 (20-04-2026) | 2026-04-20 |
| 2 | Installment 2 (20-07-2026) | 2026-07-20 |
| 3 | Installment 3 (20-10-2026) | 2026-10-20 |
| 4 | Installment 4 (20-01-2027) | 2027-01-20 |

**Verification:**

| Metric | Before | After | Δ |
|---|---:|---:|---:|
| Active students on active 2026-27 classes | 516 | 516 | 0 |
| Students **missing** installments 1–4 | 293 | **0** | −293 |
| Students **with** installments 1–4 | 223 | **516** | +293 |
| `public.installments` total rows | 600 | **1772** | +1172 |
| `public.receipts` | 32 | **32** | 0 |
| `public.payments` | 49 | **49** | 0 |
| `public.payment_adjustments` | 0 | **0** | 0 |

**Payment Desk blocker resolved:** all 516 active students in 2026-27 now have scheduled
installments. The Admin Tools "Repair current session dues" banner is no longer needed.

---

## 2. Orphan active students — 60 students flagged

**Definition:** Active students assigned to a 2026-27 class who have **no mapping row**
in `private.vpps_student_source_mapping` for `import_name = 'vpps-latest-2026-05-15-fullbook'`.
These were all created by the prior `Member_List_2026-05-14_084051.xlsx` import and
are **not present** in the latest VPPS workbook (neither active nor left).

**Count:** 60 students  
**Full list:** `docs/history/import-previews/2026-05-15-latest-vpps-import/orphan-active-students.csv`

### Distribution by class

| Class | Count |
|---|---:|
| Class 1 (inactive row) | 26 |
| Class 6 | 9 |
| Class 7 | 5 |
| SKG | 5 |
| Class 8 | 3 |
| Class 2 | 4 |
| Class 3 | 2 |
| Class 4 | 2 |
| Class 5 | 2 |
| 12 Arts | 1 |
| JKG | 1 |

### Data quality note

Many of the 26 Class 1 orphans show `member_list_group` values pointing to Class 11
Commerce or Class 11 Science — this indicates a class-assignment error in the prior
Member_List import (students were placed on the inactive Class 1 row instead of their
actual class row). These students should be investigated first.

### Required staff action

For each orphan student the school must decide:

**Option A — Student has left:** mark `status = 'left'` via the Students module.  
**Option B — Student is still enrolled but was accidentally omitted from the workbook:**
add them to the next VPPS workbook export and re-run the import (they will then
gain a mapping row and stop appearing as orphans).  
**Option C — Data-entry error from prior import:** correct the record (class, name,
admission number) and/or merge with the correct student row.

No automated action was taken on these 60 students. **Do not mark left in bulk
without individual staff verification.**

---

## 3. Unknown payment mode — CRYSTAL PAMECHA

**Source key:** `PMT:STU-0398:2243-2244-14`  
**Student:** CRYSTAL PAMECHA, Class 8, STU-0398  
**Amount:** ₹29,500  
**Receipt number:** 2243-2244-14  
**Fee group:** Fee Excel Ledger  
**Staging row:** `private.vpps_direct_import_stage_dues` where  
`import_name = 'vpps-latest-2026-05-15-fullbook' AND source_key = 'PMT:STU-0398:2243-2244-14'`

**Issue:** The `payment_mode` field was blank in the original Custom_Report workbook row.

**Assessment:** Given the amount (₹29,500) and the date context, **this is most likely a
cash payment.** All other school collections above ₹10,000 are predominantly cash unless
explicitly tagged as UPI or bank transfer. However, this requires staff confirmation
before posting.

**Action required before posting:**  
1. Check the physical fee receipt book for receipt number 2243-2244-14.  
2. Confirm payment mode (expected: cash).  
3. Update the staged row's payload if needed, then post via Payment Desk as normal.

**Anomalies CSV updated:** `docs/history/import-previews/2026-05-15-latest-vpps-import/anomalies.csv`
now contains this row under `kind = payment_review_required`.

---

## 4. Edge Function teardown — manual step pending

The `vpps-import-applier` Edge Function (id `7a359be6-cf78-4fdd-9485-9fdedff181a3`,
slug `vpps-import-applier`, version 3) is still deployed but is **completely inert**:
its proxy dependency `public.vpps_apply_chunk_proxy(text, jsonb)` was dropped at the
end of the import. Any call to the function will fail with a "function does not exist"
error.

**To delete it manually:**
1. Historical note only: the legacy import Edge Function belonged to the deleted legacy project.
2. Click `vpps-import-applier` → Settings → Delete function.

No MCP tool exists for deleting Edge Functions; this is a one-click dashboard step.
The two permanent Edge Functions (`bootstrap-staff-once`, `reveal-service-role-once`)
are unaffected.

---

## 5. Module readiness summary

### ✅ Payment Desk — ready for new collection

| Check | Status |
|---|---|
| All 516 active students have 2026-27 installments | ✅ |
| No student_fee_overrides exist (clean slate) | ✅ |
| No conventional discount assignments exist | ✅ |
| `post_student_payment` RPC unmodified | ✅ |
| Receipts/payments append-only invariant holds | ✅ (32 receipts, 49 payments) |
| Receipt prefix `SVP` in fee-rules.ts | ✅ |
| 363 staged payments pending manual post | ⚠️ staff action required |
| 1 unknown-mode payment (CRYSTAL PAMECHA) | ⚠️ confirm cash before posting |

### ✅ Dashboard — ready

| Check | Status |
|---|---|
| Production session `2026-27` active + `is_current = true` | ✅ |
| TEST session `TEST` exists, `is_current = false` | ✅ |
| `v_workbook_student_financials` view intact | ✅ |
| 584 active students visible (includes inactive-class-row students) | ✅ |
| Outstanding totals will populate from new installments | ✅ |

### ✅ Student list — ready

| Check | Status |
|---|---|
| 584 active students | ✅ |
| 31 left students | ✅ |
| 457 source-mapping rows (idempotency anchor) | ✅ |
| 60 orphan students flagged for staff review | ⚠️ action needed |

### ✅ Fee reminders / Defaulters — ready

| Check | Status |
|---|---|
| All 516 on-active-class students have installments 1–4 | ✅ |
| Installment 1 due 2026-04-20 (past due) | ⚠️ defaulter list will show these |
| 68 students on inactive Class 1/JKG rows have no new installments | ℹ️ generator correctly skips inactive-class students |
| Defaulter report excludes left/inactive students | ✅ |

> **Note:** Because Installment 1 (due 2026-04-20) is already past due, all students
> with unpaid Inst 1 will immediately appear on the Defaulters list. This is correct
> and expected — these are genuine outstanding dues from AY 2026-27 Q1.

### ✅ Exports — ready

| Check | Status |
|---|---|
| Fee register export will include new installments | ✅ |
| Payment history export unchanged | ✅ |
| Student export includes all 615 students (584 active + 31 left) | ✅ |

### ⚠️ Admin Tools — one advisory item

The "Repair current session dues" banner will no longer trigger for 2026-27
(all students now have installments). If it does appear, re-run it — the generator
is idempotent and will produce no changes (0 installmentsToInsert).

The duplicate Class 1 / JKG inactive class rows remain a pre-existing anomaly. Recommend
Fee Setup admin consolidate to active row at next maintenance window.

---

## 6. Remaining manual-review items (updated)

| # | Item | Priority | Status |
|---|---|---|---|
| 1 | Post 363 staged payments via Payment Desk | HIGH | Pending |
| 2 | Confirm CRYSTAL PAMECHA payment mode (likely cash) then post | HIGH | Pending |
| 3 | Verify / act on 60 orphan students | MEDIUM | Pending |
| 4 | Delete `vpps-import-applier` Edge Function from Dashboard | LOW | Pending (manual) |
| 5 | Resolve 9 in-workbook student duplicates in source workbook | LOW | Pending |
| 6 | Inspect 27 dropped fee-line duplicates in anomalies.csv | LOW | Pending |
| 7 | 37 Left_Students rows unmatched (historical, likely no action) | LOW | No action needed |
| 8 | Class 1 / JKG duplicate class rows in `public.classes` | LOW | Pending (Fee Setup admin) |
| 9 | Fee-line staging cleanup after payment reconciliation | DEFERRED | After item 1 |

---

## 7. Quality gates

```
$ npm run lint        → clean (0 errors, 0 warnings)
$ npm run typecheck   → clean (no tsc errors)
$ npm run test        → 47 test files, 298 tests passed (0 failures)
```

---

## 8. Artefacts added in this phase

| Path | Purpose |
|---|---|
| `docs/history/imports/2026-05-15-live-readiness-report.md` | **This file** |
| `docs/history/import-previews/2026-05-15-latest-vpps-import/orphan-active-students.csv` | 60 orphan students from prior Member_List import |
| `docs/history/import-previews/2026-05-15-latest-vpps-import/anomalies.csv` | Updated: added CRYSTAL PAMECHA `payment_review_required` row |

---

## 9. Final DB state snapshot

| Table / metric | Value |
|---|---|
| `public.students` active | 584 |
| `public.students` left | 31 |
| `public.students` total | 615 |
| `public.installments` total | 1772 |
| Active students **with** installments (active class rows) | 516 / 516 (100%) |
| `public.receipts` | 32 |
| `public.payments` | 49 |
| `public.payment_adjustments` | 0 |
| `private.vpps_direct_import_stage_dues` (payments) | 363 rows |
| `private.vpps_direct_import_stage_dues` (fee lines) | 594 rows |
| `private.vpps_student_source_mapping` | 457 rows |
| `public.fee_settings` active | 19 (one per active class) |
| `public.transport_routes` | 28 |
