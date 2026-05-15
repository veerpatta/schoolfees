# VPPS Latest-Excel Import — 2026-05-15

End-to-end import that reconciles production AY 2026-27 data with the freshly
prepared "VPPS Latest Students" workbook (PSP PDFs + new admissions + previous
app/payment matching) and the latest Coffee custom payment report.

## Source files

Both workbooks must be present locally (gitignored under `data/imports/`):

- `data/imports/VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx`
- `data/imports/Custom_Report_2026-05-14_201835.xlsx`

The 15 sheets in the master workbook and their roles:

| Sheet | Role |
|---|---|
| `Supabase_Students_Active` (466) | Canonical active student rows for AY 2026-27 |
| `Latest_Students_Active` (466) | Richer audit copy of the active set |
| `Review_Needed` (35) | Active rows that require human review before commit |
| `Added_New_Not_in_PDF` (23) | New admissions absent from latest PSP PDFs |
| `Left_Students` (67) | Previous-master rows now inactive; mark `left`, never delete |
| `Payments_Current` (363) | Payment rows tied to current active students |
| `Payments_Left` (60) | Payment rows separated from active set (review-only) |
| `FeeLines_Current` (621) | Fee-line projections for current active students |
| `FeeLines_Left` (98) | Fee-line projections for left rows (review-only) |
| `Match_Audit` (466) | Per-row trace explaining how each fuzzy match was decided |
| `Raw_PSP_All` / `Raw_PSP_SR` / `Raw_New_Admissions` | Untouched source extracts |

## What the script does

`scripts/vpps-import-latest-2026-05-15.mjs` ships with four modes; all
share the same workbook parser, normalizers, and idempotency keys.

### `--dry-run`

Read-only. Validates workbook counts against the prompt facts, then resolves
student / left-student / payment / fee-line intents. If
`SUPABASE_SERVICE_ROLE_KEY` is present in `.env.local` (or env), the script
probes live state to resolve class IDs, transport route IDs, and existing
student rows. Writes a full report (JSON, CSV, Markdown) to
`docs/import-previews/2026-05-15-latest-vpps-import/`.

### `--backup`

Snapshots affected public tables to JSON under
`data/imports/backups/<importName>-<timestamp>/` and records a manifest into
`private.vpps_direct_import_backups`. Requires `SUPABASE_SERVICE_ROLE_KEY`.

### `--apply`

Idempotent writes. Requires **both** safety gates:

```sh
VPPS_DIRECT_IMPORT_CONFIRM=I_UNDERSTAND \
  node scripts/vpps-import-latest-2026-05-15.mjs --apply --confirm-apply
```

Apply performs eight steps:

1. Rename `TEST-2026-27` / `UAT-2026-27` / `DEMO-2026-27` → `TEST` (idempotent;
   never touches `2026-27` itself).
2. Verify production session `2026-27` is `active` and `is_current=true`.
3. Open an `import_batches` row with `target_session_label='2026-27'` and
   `filename='VPPS latest data import 2026-05-15'`.
4. Upsert active students. Anchor priority:
   1. `private.vpps_student_source_mapping(source_student_uid)` (idempotency table)
   2. `students.admission_no` matching workbook `sr_no`
   3. `students.notes` containing `STU-####` fallback
   4. else **insert** with admission_no = `sr_no` or generated `VPPS-<sourceUid>`
   Conflicts in DOB / parent names / phone numbers are flagged in
   `import_rows.anomaly_categories`, never silently overwritten.
5. Mark `Left_Students` rows `status='left'`. Never deletes. `left_on` is left
   blank unless workbook supplies a reliable date.
6. Stage `Payments_Current` + `FeeLines_Current` into
   `private.vpps_direct_import_stage_dues` keyed by `(import_name, source_key)`.
   **No writes** to `public.payments` or `public.receipts`. Manual posting via
   Payment Desk after review.
7. Trigger dues sync for affected active students (does not wipe paid
   allocations).
8. Close the `import_batches` row and write an apply report.

### `--verify-only`

Reads live state post-apply and confirms invariants:

- production session `2026-27` is active+current
- `TEST` session exists and is not current
- counts of students/receipts/payments
- workbook financial views per session
- per-class student counts

## Idempotency anchors

| Object | Key | Notes |
|---|---|---|
| Students | `source_student_uid` via `private.vpps_student_source_mapping` | Falls back to `admission_no`, then `STU-####` in `notes` |
| Payments | `duplicate_check_key` from workbook (e.g. `STU-0146\|2026-03-07\|8100.0\|VPS00-2603-00035`) | Falls back to `student_uid + date + amount + receipt_no` |
| Fee lines | `student_uid + transaction_id\|invoice_id\|source_row + group_name + due_on + total_amount` | |

## Hard safety rules respected

- Never mutates / deletes `public.receipts` or `public.payments`
- Never truncates any table
- Never deletes students
- `--apply` requires explicit double-confirmation
- Service role key is loaded from env, never echoed
- Backup is mandatory before destructive operations (apply prints a warning if
  `--backup` has not been run in the last hour against the same `--import-name`)

## Migration

`supabase/migrations/20260515020000_create_vpps_student_source_mapping.sql`
adds a private table `vpps_student_source_mapping` that anchors workbook
`source_student_uid` values to `public.students.id`. Backward compatible
(additive only).

## Command sequence

```sh
# 1. Validate dry-run report
node scripts/vpps-import-latest-2026-05-15.mjs --dry-run

# 2. Snapshot production
node scripts/vpps-import-latest-2026-05-15.mjs --backup

# 3. Apply (requires both gates)
VPPS_DIRECT_IMPORT_CONFIRM=I_UNDERSTAND \
  node scripts/vpps-import-latest-2026-05-15.mjs --apply --confirm-apply

# 4. Verify
node scripts/vpps-import-latest-2026-05-15.mjs --verify-only
```

## Rollback

If apply produces unexpected results:

1. Locate the latest backup directory under `data/imports/backups/`.
2. Each table is a standalone JSON dump.
3. For non-append-only tables (`students`, `installments`, `import_batches`,
   `import_rows`), the restore path is a controlled `upsert` from the JSON
   snapshot via service-role admin client.
4. For append-only tables (`receipts`, `payments`), apply never writes, so
   restore is not required — staged rows in
   `private.vpps_direct_import_stage_dues` can simply be ignored or deleted.
5. For session rename: revert `academic_sessions.session_label` from `TEST`
   back to the snapshot value.
