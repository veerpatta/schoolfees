# School One — production releases

One row per production release. Written by Janmejay at release time
(BUILD-PLAN §8 step 7).

| Date (IST) | Phase / PR | Migrations applied | Flags flipped (for whom) | Backup verified before? | Rollback note | Signed |
|---|---|---|---|---|---|---|
| _(pending)_ | Phase 0 | `20260612023100`, `20260727113700` (repair only), `20260916090000`, `20260916090500`, `20260916091000` | `school_one_placeholder` → `raj@` only | | flags off; tables are inert if left | |

---

## Phase 0 — release-day steps

Do these in order, on a Sunday or a holiday (D-16). Nothing in the merged branch
changes production behaviour until step (d); nothing becomes visible to the
office until somebody chooses to make it so.

### (a) Fresh backup first

The new workflows cannot do this yet — they are inert until
`SCHOOLONE_BACKUPS_ENABLED` exists, which is step (g). So, by hand:

1. Download the latest CSV set from the Supabase Storage bucket
   `nightly-backups`.
2. Take a real dump from your own machine:
   ```bash
   supabase db dump --db-url "<production session-pooler URI>" -f prod-schema.sql
   pg_dump "<production session-pooler URI>" -Fc --no-owner --no-privileges -n public -f prod.dump
   ```
   Keep both off the laptop's synced folders and off this repository.

### (b) Repair the two backdated migrations — do not skip this

```bash
supabase migration repair --status applied 20260612023100 20260727113700
```

Both were written in P0.2 and both sit **before** production's last applied
version, so a plain `db push` refuses the whole run rather than applying them
(D-26). They are idempotent no-ops on production — the views and grants they
create already exist there — so recording them as applied is the accurate
statement, not a shortcut.

Without this step, step (c) fails with *"Found local migration files to be
inserted before the last migration on remote database."*

### (c) Push the migrations

```bash
npx supabase db push --linked --yes
npx supabase migration list --linked   # confirm local = remote
```

Exactly three will apply:

| Version | What it adds |
|---|---|
| `20260916090000_school_one_job_runs` | `job_runs`, `backup_runs`. Two new tables, RLS on, admin-read, service-role-write. |
| `20260916090500_job_runs_visible_in_test_mode` | `test.job_runs` / `test.backup_runs` read-through views. No-op unless the `test` schema exists. |
| `20260916091000_school_one_feature_flags` | `feature_flags` plus one row, `school_one_placeholder`, with everything off. |

All three are additive. No fee table, RPC, trigger, policy or view is altered,
and no existing row is written.

### (d) Merge the PR and let Vercel deploy

Watch Sentry and the deployment log. The app now refuses to start if it is ever
pointed at production outside a production deployment, so a boot failure here
would mean the production environment variables are wrong — check
`PRODUCTION_SUPABASE_PROJECT_REF` and `VERCEL_ENV` before anything else.

### (e) Prove the canary model — the point of the whole phase

1. Log in as **`director@vpps.co.in`**. Confirm nothing has changed: same
   navigation, same screens, no "School One" item anywhere, and no banner across
   the top (the banner renders only when the database is *not* production).
2. Log in as **`raj@vpps.co.in`** → `/protected/settings/features`. Tick
   `school_one_placeholder` for **raj@ only** — not "on for everyone", not a
   role. Save.
3. Still as `raj@`: a "School One" item now appears in the workspace navigation
   and `/protected/school-one` loads.
4. Back as `director@`: reload. Still no item, and `/protected/school-one`
   returns **404**, not 403 — the feature is invisible to them rather than
   forbidden.

That fourth check is the one that matters. Until it has passed against
production with the two real accounts, the canary model is a claim.

### (f) Job secrets

In Vercel → Production environment variables, add (each `openssl rand -hex 32`):

- `JOB_SECRET_NIGHTLY_BACKUP`
- `JOB_SECRET_AUTO_DAY_CLOSE`
- `JOB_SECRET_WHATSAPP_SCHEDULED_RUNS`

**Do not remove `CRON_SECRET`** (D-21). Two `/api/admin/*` maintenance routes and
three scripts still read it, and the live Vercel Cron callers have not been
moved onto the per-job secrets. Each job falls back to `CRON_SECRET` while its
own variable is unset, so adding these is safe in either order — but the moment
a job's own secret exists, the shared one stops working *for that job*, so
update that job's caller in the same sitting.

Then watch for two nights:

```sql
select job_name, trigger, status, started_at, finished_at, error
from public.job_runs
order by started_at desc
limit 20;
```

Two nights should show `nightly_backup` and `auto_day_close`, both `succeeded`.
A row stuck at `running` means the platform killed the job mid-flight; no row at
all means the cron did not fire, which is the failure this table was built to
make visible.

### (g) Turn the backups on

Only after runbook section C is finished (R2 bucket, Shared Drive, service
account, `age` keys, GitHub secrets):

1. Settings → Secrets and variables → Actions → **Variables** →
   `SCHOOLONE_BACKUPS_ENABLED` = `true`.
2. Actions → *Nightly off-platform backup* → Run workflow → approve the `backup`
   environment.
3. Confirm a `backup_runs` row with `verified = true`.
4. Actions → *Monthly restore drill* → Run workflow against that backup.
5. Confirm a `restore_drill` row with `verified = true` and zero invariant
   mismatches.
6. Tick the Phase 0 exit checklist in `prompts/phase-0.md`.

Once the drill has passed once, delete `/api/cron/nightly-backup` and its
Vercel cron entry.

### Rollback

- **A School One surface misbehaves:** turn its flag off. Seconds, no deploy.
- **The deploy itself is bad:** redeploy the previous commit. The three new
  tables are inert if left — nothing reads them unless the new code is running.
- **Data corruption:** restore from the backup taken in step (a). This is the
  only case that warrants it (D-17).

The migrations are not rolled back. They add tables and touch nothing existing,
so leaving them costs nothing and dropping them would only add risk.
