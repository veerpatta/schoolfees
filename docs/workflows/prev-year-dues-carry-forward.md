# Previous-Year Dues Carry-Forward — Runbook

Carries unpaid prior-year (2025-26) **tuition** balances into the current
collection workflow as a dedicated, audited installment line. Repeatable every
year. **Never** creates a student and **never** posts a payment.

## What it does

For each owner-confirmed student it creates exactly one `installments` row:

| Field | Value |
|---|---|
| `installment_no` | `99` (sentinel; next free `>= 90` if taken) |
| `installment_label` | `Previous year tuition balance (2025-26)` |
| `is_carry_forward` | `true` |
| `base_amount` | confirmed Prev-Year Due |
| `transport_amount` / `discount_amount` | `0` |
| `late_fee_flat_amount` | **`0`** (hard rule — no fine on prior-year dues) |
| `due_date` | `2026-04-01` (earlier than I1 so it allocates first) |
| `status` | `scheduled` |

Because the balances view (`v_workbook_installment_balances`) reads all
non-cancelled installments and `next_due` / Payment Desk allocation sort by
`due_date` first, the old balance shows up in outstanding totals and is consumed
**before** current-year installments — with zero late fee even if paid late.

## Why it's safe under Fee Setup regeneration

`lib/fees/generator.ts` and `lib/fees/regeneration.ts` skip any row with
`is_carry_forward = true` in their "extra installment" (`installment_no >
installmentCount`) cancel sweep, so publishing/regenerating Fee Setup never
cancels or rewrites the carry-forward line. Proven by
`tests/integration/prev-year-dues-regeneration.test.ts`.

## Source spreadsheet

File: `CONFIRM_PrevYear_Dues_2025-26.xlsx`, sheet **`Confirm Dues Match`**.
Columns: `Review Group | Old Adm# (export) | Name (last year export) |
Prev-Year Due (Rs) | Suggested App Adm# | App Student Name | App Father Name |
App Phone | App Class | Match Type | CONFIRM? (Y/N) | If wrong: correct App
Adm# | Your Notes`.

Interpretation:
- Import a row **only if `CONFIRM?` = `Y`** (also accepts `YES`/`CONFIRM`).
- `WRITE-OFF` / `N` / blank → **skipped** (recorded with reason).
- `If wrong: correct App Adm#` overrides `Suggested App Adm#` as the match key.
- Matching order: **admission number**, then exact **normalized name + phone**.
  Multiple candidates → ambiguous (manual select); none → unmatched.

## How to run

### 1. Apply the migration (one-time per environment)

`supabase/migrations/20260616054508_prev_year_dues_carry_forward.sql` — adds
`installments.is_carry_forward` plus `prev_year_import_batches` /
`prev_year_import_rows` audit tables. Apply via `supabase db push` (preferred)
or the MCP (then rename the file to the recorded version — see CLAUDE.md).

### 2. Dry run (READ-ONLY — produces the numbers for owner approval)

```bash
node scripts/prev-year-dues-dry-run.mjs "<path-to>/CONFIRM_PrevYear_Dues_2025-26.xlsx" 2026-27
```

Prints: total rows; CONFIRM / WRITE-OFF / N / blank counts; confirmed subtotal;
matched / unmatched / ambiguous / no-fee-setting / error counts; matched
subtotal; and lists of the rows needing attention. Writes nothing.

Expected envelope before owner decisions: ~82 candidate students, ₹9,73,500.
**Stop here and get explicit owner sign-off on the matched count + subtotal.**

### 3. Apply (only after approval)

Use the Admin Tools → **Previous Year Dues** screen (upload → dry-run preview →
apply) once it ships, or the approved apply path. The apply:
- runs in a single transaction;
- snapshots affected installments first;
- is idempotent (skips students that already have the carry-forward line);
- reconciles `SUM(amount_due)` of inserted rows against the confirmed subtotal.

### Rollback

Scoped to this feature's rows:

```sql
delete from public.installments
where is_carry_forward = true
  and installment_label = 'Previous year tuition balance (2025-26)';
```

(Restrict to a batch via `prev_year_import_rows.applied_installment_id` for a
single-batch rollback.)

## Session note

`app_settings.active_session_label` is currently `TEST-2026-27` while the live
session is `2026-27`. The real import targets `2026-27`. If the dashboard/
defaulters are pinned to `TEST-2026-27`, carried-forward dues imported into
`2026-27` will not be visible there until the active session label is set to
`2026-27`. Confirm with the owner.
