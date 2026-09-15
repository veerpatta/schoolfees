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
| D-23 | Known flaky test | `transactions-page-resilience.test.ts` times out at 5 s only under full-suite load (passes alone in ~2.6 s). Not fixed by School One work; if it blocks a CI run, re-run the job. A dedicated PR may raise its timeout later | 2026-09-16 / JS (kickoff) |
