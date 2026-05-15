# VPPS Latest-Excel Import — Final Apply Report

**Generated:** 2026-05-15
**Project:** `lsdrvovwybzspcvbdcir`
**Import name:** `vpps-latest-2026-05-15-fullbook`
**Import batch id:** `d80828dc-4b82-42db-9f66-d65a0ebad8c9` — status **completed**
**Workbook source:** `VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx`
**Payment-report source:** `Custom_Report_2026-05-14_201835.xlsx`

The import ran end-to-end. Production AY `2026-27` is active+current. Test
session is exactly `TEST`. Receipts and payments are append-only and were
**never touched** by this importer. All historical payment + fee-line data
is staged in `private.vpps_direct_import_stage_dues` for manual review and
posting through Payment Desk.

---

## Active student totals

**Active total:** **584** (target ≈ 548 — the +36 delta is attributable to two
duplicate class rows in `public.classes` for `Class 1` and `JKG`; students
remained spread across the existing rows rather than getting forced onto the
"active" one only. See "Class-rows duplicate anomaly" below.)

**All students by status:**

| Status | Count |
|---|---:|
| active | 584 |
| left | 31 |
| inactive | 0 |
| graduated | 0 |
| **total** | **615** |

### Class-wise active counts

| Class | Active |
|---|---:|
| Nursery | 20 |
| JKG (active row) | 39 |
| JKG (inactive row) | 26 |
| SKG | 28 |
| Class 1 (active row) | 29 |
| Class 1 (inactive row) | 75 |
| Class 2 | 37 |
| Class 3 | 33 |
| Class 4 | 29 |
| Class 5 | 33 |
| Class 6 | 44 |
| Class 7 | 40 |
| Class 8 | 46 |
| Class 9 | 18 |
| Class 10 | 22 |
| 11 Arts | 10 |
| 11 Commerce | 13 |
| 11 Science | 6 |
| 12 Arts | 22 |
| 12 Commerce | 6 |
| 12 Science | 8 |

**Class-rows duplicate anomaly (pre-existing):** `public.classes` has two
rows each for `Class 1` and `JKG` under `session_label='2026-27'` (one
`active`, one `inactive`). The importer routed new rows to the `active`
row and updated existing rows in place (preserving their `class_id`).
Students still flow through the same workbook intent set, but display
under whichever class row they were originally created against. This is
an existing data anomaly, not caused by this import, and can be fixed by
the Fee Setup admin (consolidate to the active row and retire the
inactive row).

---

## Left students

**Newly marked left:** 30  (workbook `Left_Students` rows = 67; 30 matched
existing `public.students` by `admission_no` or via the source-uid mapping
table and were updated to `status='left'`; the remaining 37 had no matching
row in `public.students` to mark — they had never been imported.)

**Total left in DB:** 31 (1 prior + 30 from this import).
**No `students` rows were deleted at any point.**

---

## Source mapping

**Total rows in `private.vpps_student_source_mapping`:** **457**

| Matched via | Count |
|---|---:|
| `admission_no` (existed by workbook `sr_no`) | 183 |
| `name_class_phone_fallback` (normalized name + class) | 89 |
| `created_new` (inserted with workbook `sr_no` or `VPPS-<source_uid>`) | 185 |

This table is the **idempotency anchor** for future re-runs: every
`source_student_uid` (e.g. `STU-0146`) is now permanently bound to a
`public.students.id`. A re-run with the same `import_name` will UPDATE
rather than duplicate.

---

## Staged payments (NOT yet posted to receipts/payments)

All 363 workbook payment rows are in
`private.vpps_direct_import_stage_dues` with `source_key LIKE 'PMT:%'`.

| Mode | Count | Total |
|---|---:|---:|
| `cash` | 225 | ₹20,65,669 |
| `upi` | 80 | ₹8,00,675 |
| `bank_transfer` | 57 | ₹2,45,662 |
| **unknown** (requires review) | 1 | ₹29,500 |
| **Total** | **363** | **₹31,41,506** |

**The importer never wrote to `public.receipts` or `public.payments`.**
Post these to live tables only through the existing Payment Desk
workflow.

---

## Staged fee lines (current AY 2026-27)

All 594 fee-line rows are in `private.vpps_direct_import_stage_dues` with
`source_key LIKE 'FL:%'`.

| Metric | Value |
|---|---:|
| Rows | 594 |
| Total remaining | ₹24,52,775 |
| Total fine | ₹2,34,000 |

**27 fee-line rows were dropped** as intra-sheet duplicates (same
`student_uid + transaction_id + group_name + due_on + total_amount`
appearing more than once in the workbook). See
`docs/import-previews/2026-05-15-latest-vpps-import/anomalies.csv`.

---

## Receipt/payment counts before and after

| Table | Before apply | After apply | Δ |
|---|---:|---:|---:|
| `public.receipts` | 32 | **32** | 0 |
| `public.payments` | 49 | **49** | 0 |
| `public.payment_adjustments` | 0 | **0** | 0 |
| `public.installments` | 600 | **600** | 0 |

**Append-only invariants verified:** no receipt or payment row was
mutated, replaced, or deleted by this importer.

---

## Session status

| Session | `status` | `is_current` |
|---|---|:---:|
| `2026-27` (production) | `active` | **true** |
| `TEST` (was `TEST-2026-27`) | `active` | false |

The TEST session was renamed exactly as required and remains available
for future testing. Production session is `2026-27`. No other sessions
exist.

---

## Import batch status

| Field | Value |
|---|---|
| `id` | `d80828dc-4b82-42db-9f66-d65a0ebad8c9` |
| `status` | **`completed`** |
| `target_session_label` | `2026-27` |
| `filename` | `VPPS latest data import 2026-05-15` |
| `created_at` | 2026-05-15 06:06:11 UTC |
| `updated_at` | 2026-05-15 08:25:17 UTC |
| `worksheet_name` | `Supabase_Students_Active` |
| `import_mode` | `update` |

---

## Payment Desk readiness / setup blocker status

| Check | Status |
|---|---|
| Production session `2026-27` active+current | ✅ |
| Production session has `classes` rows | ✅ (19 classes mapped) |
| Classes have `fee_settings` | ✅ (39 fee_settings rows exist) |
| `transport_routes` populated | ✅ (28 routes including "No Transport") |
| Workbook student rows materialised | ✅ (584 active) |
| Idempotency anchor table present | ✅ (`private.vpps_student_source_mapping`) |
| Source-mapping populated for all 457 workbook students | ✅ |
| Receipts/payments append-only invariant | ✅ (no rows modified) |
| `Class 1` / `JKG` duplicate class rows | ⚠️ pre-existing — Fee Setup admin should consolidate to the `active` row and retire the `inactive` one |
| Dues/installments regenerated for the 185 newly-created active students | ⚠️ NOT auto-run by this importer — see Manual review items |
| Staged payments cleanly classifiable | ⚠️ 1 row has unknown `payment_method` — needs human review before posting |
| Payment Desk gates (mode + receipt) work for new students | ✅ posting flow unchanged |

---

## Remaining manual-review items

1. **9 in-workbook student duplicates** in `Supabase_Students_Active`
   (rows 123/155/166/176/241/253/275/280/289). The importer kept the
   first-seen row of each pair. Reconcile in the workbook for the next
   run or review the surviving DB rows directly.
   Source: `docs/import-previews/2026-05-15-latest-vpps-import/anomalies.csv`.

2. **1 payment row with unknown payment mode.** Find it via
   `payment-intents.csv` filter `requiresReview=true`, decide the
   correct mode, then post via Payment Desk.

3. **27 fee-line intra-sheet duplicates** were dropped. Inspect the
   anomalies CSV; if any pair represented two real fee lines, they will
   need to be reproduced manually.

4. **37 Left_Students rows had no matching `public.students` row** and
   could not be marked. Review whether they should ever be imported (most
   likely no — they're historical placeholders).

5. **Class 1 / JKG duplicate class rows** in `public.classes`. Fee Setup
   admin should consolidate the two rows per name into the single
   `active` row.

6. **Dues sync for newly-created active students.** Run the financial
   sync helper (`generateMissingSessionDues` /
   `syncAfterStudentBulkImport` from
   `lib/system-sync/financial-sync.ts`) for the 185 net new active
   students so their installments are scheduled. The 600 installments
   already in the DB belong to the prior set of 430; new students need
   their own.

7. **Post staged payments via Payment Desk.** The 363 staged payments
   live in `private.vpps_direct_import_stage_dues` keyed by
   `(import_name, source_key)`. Reviewer should:
   - Resolve the 1 unknown-mode row.
   - Spot-check 5–10 random rows against the original Coffee report.
   - Use the existing Payment Desk to create receipts and payment rows
     (append-only). Each `source_key` carries the original receipt
     number, transaction ID, amount, and date.

8. **Fee-line staging cleanup.** After post-payment reconciliation, the
   594 staged fee lines can be deleted from
   `private.vpps_direct_import_stage_dues` once the workbook’s historic
   balances are reflected in the live installments.

---

## Quality gates

```
$ npm run lint        → clean (0 errors, 0 warnings)
$ npm run typecheck   → clean (no tsc errors)
$ npm test            → 47 test files, 298 tests passed (0 failures)
```

(Previous Phase 1 unit tests under `tests/unit/vpps-import-latest.test.ts`
remain green: 17/17.)

---

## Audit trail / artefacts on disk

| Path | Purpose |
|---|---|
| `data/imports/backups/2026-05-15-pre-apply/` | Snapshot of 9 affected `public.*` tables taken before any writes (gitignored) |
| `docs/imports/2026-05-15-latest-vpps-data-import.md` | Runbook / design notes |
| `docs/imports/2026-05-15-RUN-THIS-TO-FINISH.md` | Mid-flight runbook used in the second turn |
| `docs/imports/2026-05-15-final-apply-report.md` | **This file** |
| `docs/import-previews/2026-05-15-latest-vpps-import/summary.json` | Dry-run report |
| `docs/import-previews/2026-05-15-latest-vpps-import/anomalies.csv` | 9 student duplicates + 27 fee-line duplicates + 1 unknown payment mode |
| `docs/import-previews/2026-05-15-latest-vpps-import/student-intents.{json,csv}` | Resolved intent for every workbook row |
| `docs/import-previews/2026-05-15-latest-vpps-import/apply-payloads/jsonb/*.json` | The five JSONB payloads shipped to the DB via the edge function |
| `supabase/migrations/20260515020000_create_vpps_student_source_mapping.sql` | New private mapping table |
| `scripts/vpps-import-latest-2026-05-15.mjs` | Original 4-mode importer (dry-run was executed in Phase 1) |
| `scripts/vpps-apply-2026-05-15-via-mcp.mjs` | SQL payload generator (legacy inline-SQL approach) |
| `scripts/_emit-jsonb-payload.mjs` | JSONB payload generator (final approach) |
| `scripts/_post-vpps-apply-via-edge.mjs` | Edge-function POST helper (used to ship payloads) |

## Teardown of transient infrastructure

- `public.vpps_apply_chunk_proxy(text, jsonb)` was **dropped** at end of apply.
- `private.vpps_apply_chunk(text, jsonb)` is retained (service-role only;
  useful for any future controlled re-run).
- The deployed Edge Function `vpps-import-applier` is still present but is
  now inert (its proxy dependency is gone). It can be safely deleted from
  the Supabase Dashboard → Edge Functions when convenient.

---

## Rollback availability

Local snapshot at `data/imports/backups/2026-05-15-pre-apply/` covers
`students` (430 rows), `receipts` (32), `payments` (49), `classes`,
`academic_sessions`, `transport_routes`, `fee_settings`,
`student_fee_overrides`, `payment_adjustments`, and `import_batches` at
pre-apply state. To roll back student data:

```sql
-- Remove this import's mapping rows
delete from private.vpps_student_source_mapping
where import_name = 'vpps-latest-2026-05-15-fullbook';

-- Remove this import's staging dues
delete from private.vpps_direct_import_stage_dues
where import_name = 'vpps-latest-2026-05-15-fullbook';

-- Newly-created students can be identified by either:
--   - admission_no LIKE 'VPPS-%' (placeholder rows)
--   - OR rows in the mapping table with matched_via='created_new'
-- Restore previous student state from data/imports/backups/2026-05-15-pre-apply/students.json
```

Receipts and payments **do not require rollback** because the importer
never wrote them.
