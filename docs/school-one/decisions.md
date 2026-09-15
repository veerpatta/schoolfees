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
