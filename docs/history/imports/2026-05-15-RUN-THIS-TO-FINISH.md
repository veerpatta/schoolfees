# VPPS Latest-Excel Import — Finish Runbook (2026-05-15)

This runbook completes the import that the assistant started on 2026-05-15. The
hard parts (count validation, dry-run, backups, schema migration, session
rename, import-batch open, student chunk 1) are **done**. What remains is
shipping the remaining JSONB upsert chunks to the database.

The remaining work is mechanical — each file under
`docs/history/import-previews/2026-05-15-latest-vpps-import/apply-payloads/inline/`
is a single idempotent SQL statement you paste into the **Supabase Studio SQL
editor** (or run via `psql`). Order matters; run them top-to-bottom.

---

## Where things stand right now

| Check | Status |
|---|---|
| `private.vpps_student_source_mapping` migration | Applied via MCP |
| Workbooks copied to `data/imports/` | Done |
| Full backup at `data/imports/backups/2026-05-15-pre-apply/` | Done (430 students, 32 receipts, 49 payments, etc.) |
| `academic_sessions.2026-27` is `active`+`is_current` | Yes |
| `academic_sessions.TEST` renamed from `TEST-2026-27` | Yes |
| `import_batches` row for this import | Open, id `d80828dc-4b82-42db-9f66-d65a0ebad8c9`, status `importing` |
| `public.students` count | **457** (was 430; +27 from chunk 1) |
| `public.receipts` | **32 unchanged** (append-only invariant preserved) |
| `public.payments` | **49 unchanged** (append-only invariant preserved) |
| Student source mapping rows | **0 — to be populated** |
| Stage dues rows | **0 — to be populated** |

## What's left

| Step | File(s) | Rows |
|---|---|---|
| Students upsert (rest) | `inline/students/02.sql` … `10.sql` | 9 chunks × 50 rows = 407 |
| Source mapping for all 457 students | `inline/mapping/01.sql` … `10.sql` | 10 chunks |
| Mark Left_Students (67) status=`left` | `inline/left.sql` | 1 file |
| Stage Payments_Current (363) | `inline/payments/01.sql` … `08.sql` | 8 chunks |
| Stage FeeLines_Current (594) | `inline/feelines/01.sql` … `12.sql` | 12 chunks |
| Close import batch | one statement (below) | — |
| Verify final state | one query (below) | — |

Total remaining: **40 statements**. Each completes in well under a second.

---

## Option A — Supabase Studio SQL editor (recommended)

1. Open the SQL editor for the active Mumbai Supabase project `vgqyilgstjvgohrsiwkb`.
2. Create a new query
3. For each file in this order, **paste the entire file contents and run**:

```text
docs/history/import-previews/2026-05-15-latest-vpps-import/apply-payloads/inline/students/02.sql
docs/history/import-previews/2026-05-15-latest-vpps-import/apply-payloads/inline/students/03.sql
docs/history/import-previews/2026-05-15-latest-vpps-import/apply-payloads/inline/students/04.sql
docs/history/import-previews/2026-05-15-latest-vpps-import/apply-payloads/inline/students/05.sql
docs/history/import-previews/2026-05-15-latest-vpps-import/apply-payloads/inline/students/06.sql
docs/history/import-previews/2026-05-15-latest-vpps-import/apply-payloads/inline/students/07.sql
docs/history/import-previews/2026-05-15-latest-vpps-import/apply-payloads/inline/students/08.sql
docs/history/import-previews/2026-05-15-latest-vpps-import/apply-payloads/inline/students/09.sql
docs/history/import-previews/2026-05-15-latest-vpps-import/apply-payloads/inline/students/10.sql

docs/history/import-previews/2026-05-15-latest-vpps-import/apply-payloads/inline/mapping/01.sql
… through 10.sql

docs/history/import-previews/2026-05-15-latest-vpps-import/apply-payloads/inline/left.sql

docs/history/import-previews/2026-05-15-latest-vpps-import/apply-payloads/inline/payments/01.sql
… through 08.sql

docs/history/import-previews/2026-05-15-latest-vpps-import/apply-payloads/inline/feelines/01.sql
… through 12.sql
```

Each is **idempotent** — re-running is safe (uses `on conflict do update`).

## Option B — psql

If you have `DATABASE_URL` for the production DB:

```sh
cd "D:/OneDrive - Veer Patta Public School/Documents/New project/veerpatta-fees-app"
for f in docs/history/import-previews/2026-05-15-latest-vpps-import/apply-payloads/inline/students/*.sql; do
  echo "applying $f"
  psql "$DATABASE_URL" -f "$f"
done
for f in docs/history/import-previews/2026-05-15-latest-vpps-import/apply-payloads/inline/mapping/*.sql; do
  psql "$DATABASE_URL" -f "$f"
done
psql "$DATABASE_URL" -f docs/history/import-previews/2026-05-15-latest-vpps-import/apply-payloads/inline/left.sql
for f in docs/history/import-previews/2026-05-15-latest-vpps-import/apply-payloads/inline/payments/*.sql; do
  psql "$DATABASE_URL" -f "$f"
done
for f in docs/history/import-previews/2026-05-15-latest-vpps-import/apply-payloads/inline/feelines/*.sql; do
  psql "$DATABASE_URL" -f "$f"
done
```

## Option C — Continue via a fresh Claude Code session

Open a new Claude Code session in this directory, point it at this runbook
and say "continue from the runbook". The session will inherit the existing
`.mcp.json` Supabase MCP registration and resume from the same state.

---

## Close the import batch (after all chunks have run)

```sql
update public.import_batches
set status = 'completed', updated_at = now()
where id = 'd80828dc-4b82-42db-9f66-d65a0ebad8c9';
```

## Verify final state

```sql
select
  (select count(*) from public.students) as students_total,
  (select count(*) from public.students where status='active') as students_active,
  (select count(*) from public.students where status='left') as students_left,
  (select count(*) from private.vpps_student_source_mapping
   where import_name = 'vpps-latest-2026-05-15-fullbook') as mapping_rows,
  (select count(*) from private.vpps_direct_import_stage_dues
   where import_name = 'vpps-latest-2026-05-15-fullbook') as stage_dues_rows,
  (select count(*) from public.receipts) as receipts_unchanged,
  (select count(*) from public.payments) as payments_unchanged,
  (select jsonb_agg(jsonb_build_object('label', session_label, 'current', is_current))
   from public.academic_sessions) as sessions;
```

**Expected after all chunks:**
- `students_total` ≈ 615  (430 prior + 185 net new from workbook)
- `students_active` ≈ 548 (615 − 67 left)
- `students_left` ≈ 68  (1 prior + 67 newly-marked)
- `mapping_rows` = 457
- `stage_dues_rows` = 957 (363 payments + 594 fee lines)
- `receipts_unchanged` = 32
- `payments_unchanged` = 49
- `sessions`: `2026-27` current=true, `TEST` current=false

## After the import completes

1. **Review staged payments before posting** — they live in
   `private.vpps_direct_import_stage_dues`. Post them through Payment Desk
   manually; do not auto-promote to `public.payments`.
2. **Inspect 9 in-workbook student duplicates** noted in
   `docs/history/import-previews/2026-05-15-latest-vpps-import/anomalies.csv` (sheet
   rows 123/155/166/176/241/253/275/280/289). The importer kept the
   first-seen row of each pair; review and reconcile if needed.
3. **Address 1 unknown-payment-mode row** — find via `payment-intents.csv`
   `requiresReview=true`. Workbook payment_method was unrecognized.
4. **Trigger dues sync** for the 27 new active students you just inserted
   via your existing financial-sync RPC, or by visiting Fee Setup → "Sync".

## Rollback (if needed)

Local snapshot lives at `data/imports/backups/2026-05-15-pre-apply/`. To
restore students, mapping, and staging rows:

```sql
-- Mapping table (private, additive — safe to drop)
truncate private.vpps_student_source_mapping;

-- Staging dues (private — safe to drop just this batch)
delete from private.vpps_direct_import_stage_dues
where import_name = 'vpps-latest-2026-05-15-fullbook';

-- New students inserted by this batch can be identified via mapping table
-- BEFORE you truncate it. They are also the ones whose admission_no starts
-- with `VPPS-` (placeholder) or matches a 2400-series new admission.
-- For surgical rollback contact the importer author with backup JSON.
```

Receipts/payments cannot be rolled back via this importer because **the
importer never wrote any** — the entire payment+fee-line flow is staged in
`private.vpps_direct_import_stage_dues` for manual review.
