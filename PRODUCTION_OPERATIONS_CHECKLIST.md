# PRODUCTION_OPERATIONS_CHECKLIST.md

## Purpose

Standing operations checklist for the SVP school fee management app.
UAT is complete. The app is live with real 2026-27 data.

## Live Session Guard

- 2026-27 is the live session. Real student records and receipts are in it.
- TEST-2026-27 is the permanent test session for debugging and feature testing.
- Admission numbers prefixed with TEST- are test students. They should never
  appear in live operations.

## Daily Operations Reminders

- Dashboard loads current collection totals and outstanding dues automatically.
- Adding or editing a student triggers dues preparation automatically.
- Fee Setup changes sync dues automatically on save.
- Payment Desk is the only surface for posting receipts.
- Transactions and Exports are read-only.

## If Something Looks Wrong

- Check Admin Tools -> Fee Data Troubleshooting for sync health.
- If a student's dues are missing, open the student record and save — auto-prepare fires.
- If a class is missing from Payment Desk, check Fee Setup -> class defaults.
- If the dashboard KPIs look stale, check the "Updated at" timestamp near the header.

## Testing a New Feature or Fix

- Always use TEST-2026-27 session.
- Use students with TEST- prefix admission numbers.
- Never post payments against real students (non-TEST- admission numbers).
- Verify the change in TEST-2026-27 before considering impact on live data.

## Financial Safety (Permanent Rules)

- Posted receipts and payments are append-only — they cannot be edited or deleted.
- Corrections use the explicit adjustment/reversal workflow.
- Fee Setup may reprice in-scope installment charges; posted payments and receipts are
  never rewritten. Existing money re-settles oldest-first. Active EMI-plan rows and a
  paid row whose due date would move remain held for review.
- Audit logs are always preserved.

## Export and Backup Reminders

- Download XLSX exports periodically from Exports for office records.
- Supabase automatic backups protect the database — but they live in the same
  account as the database, so one billing lapse, one compromised login or one
  mistaken project deletion takes both. That is what the off-platform backup
  below exists for.

## Off-platform backups

Nightly, encrypted, in two places that are not Supabase, with a monthly drill
that proves the backup actually restores. Run by GitHub Actions rather than by
the app, so it keeps working on the day Vercel or the deployment is the broken
thing.

| Workflow | When | What |
|---|---|---|
| `backup-nightly.yml` | 01:00 IST | dump → manifest → encrypt → Google Shared Drive **and** Cloudflare R2 → verify → record in `backup_runs` |
| `backup-restore-drill.yml` | 02:30 IST on the 1st | restore last night's backup into a throwaway Postgres and compare every row count and money total against the manifest |

**Both are inert until `SCHOOLONE_BACKUPS_ENABLED` is set** (Settings → Secrets
and variables → Actions → Variables). Turn it on only after runbook section C is
complete. Full detail: `scripts/school-one/backup/README.md`.

Checking there is a good backup:

```sql
select ran_at, kind, verified, notes
from public.backup_runs
order by ran_at desc
limit 10;
```

`verified = true` on a `nightly` row means every file was read back from both
destinations. On a `restore_drill` row it means the restored database matched
the manifest exactly.

**`/api/cron/nightly-backup` is deprecated** and is removed once the drill has
passed once. It writes five capped, unencrypted, unverified CSVs into a bucket
in the same project as the database — a convenience copy, not a backup.

## Which database is this?

| Context | `VERCEL_ENV` | Supabase project | Guard |
|---|---|---|---|
| Production | `production` | `vgqyilgstjvgohrsiwkb` | allows |
| Preview | `preview` | `schoolfees-dev` (`wtgxcptmucjerhufzjcf`) | refuses the production ref |
| Local / agent | unset | dev project | refuses the production ref unless `ALLOW_PRODUCTION_DB_OUTSIDE_PRODUCTION="I understand"` (scripted reads only) |
| GitHub Actions backup | n/a | production, **read via dump only** | environment-protected secret |

The app **refuses to start** when pointed at production outside a production
deployment, and every non-production page carries a strip naming the database it
is reading. Both live in `src/platform/db-target.ts`.

## Infrastructure Reference

| Item | Value |
|---|---|
| Supabase project | `vgqyilgstjvgohrsiwkb` — ap-south-1 (Mumbai) |
| Project URL | `https://vgqyilgstjvgohrsiwkb.supabase.co` |
| Vercel project | `veerpattas-projects/schoolfees` |
| Production URL | `schoolfees-two.vercel.app` |
| Backend policy | Mumbai-only; no legacy rollback project is kept |

If you ever need to check DB health, migrations, or logs: Supabase dashboard
→ project `vgqyilgstjvgohrsiwkb` → Database / Logs / Advisors.

## Nightly automation

Two Vercel crons. Both now authenticate on their own `JOB_SECRET_*`, falling back
to `CRON_SECRET` while that is unset, and both leave a row in `job_runs` on every
invocation — including the ones that fail, and including a row stuck at `running`
if the platform killed them mid-flight:

- `/api/cron/auto-day-close` — **day close is automatic.** The Finance Controls close view
  is read-only; manual approval and cash/bank reconciliation were removed.
- `/api/cron/nightly-backup` — **deprecated**; see Off-platform backups above.

Inside Postgres, pg_cron additionally refreshes the workbook matviews every 2 minutes,
enqueues a daily refresh just after midnight IST (a late fee appears because *a date
passed*, and a date passing enqueues nothing on its own), and charges EMI late fees nightly.

**pg_cron has no request context**, so `has_permission()` returns false inside a cron job.
A job that calls a permission-gated function must be guarded differently — the EMI late-fee
job silently never fired once for exactly this reason.
