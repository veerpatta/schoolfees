# School One — decisions and editable defaults

Change a value here (with date and initials) and reference the row in the PR that implements the change. Coding agents treat this table as settings, not as facts to re-derive.

## Locked decisions (change only with Janmejay's explicit note)

| Key | Value |
|---|---|
| Foundation | Evolve `veerpatta/schoolfees`; Supabase `vgqyilgstjvgohrsiwkb` is master; one repo |
| Hosting | Vercel Hobby continues; Pro only if Vercel objects or a limit bites |
| Dev database | `schoolfees-dev` (`wtgxcptmucjerhufzjcf`) for previews; `supabase start` locally; production `TEST-2026-27` for final fee-adjacent UAT only |
| Rollout | Canary model: `director@vpps.co.in` = operations, `raj@vpps.co.in` = canary; per-user/role feature flags |
| Roles | `admin`, `accountant`, `fee_collector`, `view_only`, `teacher`, `office`, `academic_coordinator`, `exam_coordinator`; class-teacher/subject-teacher are assignments |
| Sensitive data | class teacher of that class + admin + office |
| Attendance | once/day; P/A/Half-day; class teacher marks; office may mark on behalf; corrections need approval; reminder after period 1 |
| Marks | subject teacher edits until exam coordinator locks; every change logged; no approval flow |
| Sampark | collection flow kept; old domain `sampark-theta-eight.vercel.app` stays as redirect |
| Timetable | inside School One; engine ported unchanged first; WhatsApp notice to cover teacher |
| Backups | nightly, encrypted, Google Shared Drive + Cloudflare R2; monthly restore drill |
| Out of School One | Cashfree/Razorpay (fee-module track); parent portal; multi-school |

## Editable defaults

| # | Item | Current value | Changed on / by |
|---|---|---|---|
| D-1 | Approvers for attendance corrections | `admin`, `office`, `academic_coordinator` | — |
| D-2 | Approvers for master-data corrections | `admin` only | — |
| D-3 | Attendance deadlines | reminder at end of period 1; office "missing" list at end of period 3 | — |
| D-4 | Attendance statuses | Present / Absent / Half-day (Leave disabled) | — |
| D-5 | WhatsApp quiet hours | 20:00–07:00 IST | — |
| D-6 | Who may send parent-facing academic messages | `admin`, `exam_coordinator`, class teacher of that class | — |
| D-7 | Automatic (no human) sends | staff-facing only | — |
| D-8 | Failure alerts | Janmejay's WhatsApp + Sentry | — |
| D-9 | Backup retention | 14 daily / 8 weekly / 24 monthly | — |
| D-10 | Backup encryption key holder | Janmejay: password manager + printed copy in the school safe; drill key in GitHub environment `backup` | — |
| D-11 | Archive trigger | DB > 300 MB or Supabase asks for money | — |
| D-12 | Exports | admin + office + exam_coordinator; teachers none; all logged | — |
| D-13 | Photos | visible to that class's teachers; download admin-only | — |
| D-14 | Auto-logout | 30 min idle on shared office devices; 12 h on personal phones | — |
| D-15 | Branching | `main` = production; branch + PR per phase; AI review step | — |
| D-16 | Deployment window | Sundays/holidays, after a fresh backup | — |
| D-17 | Rollback stance | flag off, keep data; restore only for corruption | — |
| D-18 | Pilot | 1 class teacher + 1 subject teacher, two weeks | — |
| D-19 | Timetabled classes | 16 groups (Class 1 → 12 streams); pre-primary attendance only | — |
| D-20 | Restore-drill Postgres image | `supabase/postgres:17.6.1.121` — production's version per the Supabase management API on 16 Sep 2026 (dev runs `17.6.1.166`). Update this row whenever Supabase upgrades production; never read it by connecting to production | 2026-09-16 / JS (kickoff finding 3) |
| D-21 | `CRON_SECRET` lifecycle | Kept alive. Readers: 3 job routes (wrapped by P0.4 with per-job secrets + `CRON_SECRET` fallback), 2 `/api/admin/*` maintenance routes and 3 scripts (fee-module tooling, untouched). Retire only when `grep -rn CRON_SECRET src scripts` is empty and the Vercel Cron / pg_cron callers are confirmed on per-job secrets — a Phase 1 housekeeping item, done by Janmejay, not an agent | 2026-09-16 / JS (kickoff finding 2) |
| D-22 | Seeds | Only `01`, `02`, `04` are seeds and only via `supabase db push --include-seed` from `dev-db.mjs`; `03_cleanup_existing_students.sql` is a deletion script and is never listed in `config.toml` or run by any script. `04` starts with a tripwire that aborts if any non-`TEST-` student exists | 2026-09-16 / JS (kickoff finding 1) |
| D-24 | Building a database: restore, not replay | The migration history contains one-off, data-guarded repairs (e.g. `20260727113603`, `20260808140000`) and two views that were created by hand and never had a migration, so replaying `supabase/migrations/` onto an empty database fails. New databases are built by restoring `supabase/schema.sql` (or a backup dump), recording the history as applied, then pushing anything newer. `scripts/school-one/dev-db.mjs` carries the list of unreplayable versions with the reason each skip is a no-op. `db:reset:dev` = restore → push → seed, never `db reset --linked` | 2026-09-16 / JS (P0.2) |
| D-25 | Schema snapshot ordering bug | `generate_schema_snapshot()` emits matview indexes before the matviews exist, so `schema.sql` never applied as written; `dev-db.mjs` reorders sections at restore time. Fix the generator to emit indexes after views (P0.8 or a small follow-up PR), then delete the reordering list | 2026-09-16 / JS (P0.2) |
| D-26 | Backdated migrations from P0.2 on production | `20260612023100_notion_sync_views_that_never_had_a_migration` and `20260727113700_financial_surface_hardening_without_the_one_off_repair` are idempotent no-ops on production but sit before its last applied version, so a plain `supabase db push` will refuse. **Phase 0 release step (Janmejay, from his machine):** `supabase migration repair --status applied 20260612023100 20260727113700` against production, then the normal `db push`. Record in RELEASES.md | 2026-09-16 / JS (P0.2) |
| D-27 | Seed 02 edit | `02_test_students_seed.sql` gained the manual-override path on two standalone third-child rows so it passes the traceability trigger from `20260524151000`; a seed that cannot run is a test fixture that lies. Outside P0.2's edit list — flagged and accepted | 2026-09-16 / JS (P0.2) |
| D-28 | Branch and merge cadence | Push `school-one/phase-0` freely (preview deploys use the dev project). Merge to `main` only once per phase via PR, per BUILD-PLAN §8; user-level visibility (`raj@` vs `director@`) is provided by feature flags from P0.9 onward, not by the branch | 2026-09-16 / JS |
| D-23 | Known flaky test | `transactions-page-resilience.test.ts` times out at 5 s only under full-suite load (passes alone in ~2.6 s). Not fixed by School One work; if it blocks a CI run, re-run the job. A dedicated PR may raise its timeout later | 2026-09-16 / JS (kickoff) |
| D-29 | Snapshot omits view options — **open defect** | `generate_schema_snapshot()` records a view's body but not its `reloptions`, so `security_invoker` is absent from `supabase/schema.sql` (the migrations set it 79 times; the snapshot contains it 0 times). Measured on dev after a restore: **all 19 views run as their owner**, so RLS on `students`, `installments`, `payments` and `receipts` is not consulted for any of them. Production is unaffected — the `alter view` statements really ran there — but D-24 makes restore the way databases are built, so this is a live privilege hole on any database built that way. Fix with D-25 in one focused PR: the function must emit `with (...)` for views AND indexes after views. Until then, dev's view RLS does not match production's | 2026-09-16 / Claude (P0.4) |
| D-30 | `JOB_SECRET_*` per job family | Four names: `JOB_SECRET_NIGHTLY_BACKUP`, `JOB_SECRET_AUTO_DAY_CLOSE`, `JOB_SECRET_WHATSAPP_SCHEDULED_RUNS`, `JOB_SECRET_BACKUP_REPORT`. `CRON_SECRET` is the fallback and a job falls back to it only while its own variable is unset, logging a deprecation warning; once the job variable is set the shared one stops working for that job, which is what makes rotating `CRON_SECRET` later mean anything | 2026-09-16 / Claude (P0.4) |
| D-31 | Backups are inert until switched on | Both workflows are gated on the repository variable `SCHOOLONE_BACKUPS_ENABLED`. They sit on `main` doing nothing until runbook C1–C8 is complete. A nightly job that fails every night for want of secrets trains everybody to ignore a red X, and then the first real failure is invisible too | 2026-09-16 / Claude (P0.6) |
| D-32 | A flag is never the only guard | A `feature_flags` key decides whether a surface exists for someone; `requireStaffPermission` decides whether they may use it. Gated pages call both, so turning a flag on for everyone by mistake still leaves the permission check standing. Everything fails closed: unknown key, read error, and a navigation caller that supplies no flag set all resolve to hidden | 2026-09-16 / Claude (P0.9) |
