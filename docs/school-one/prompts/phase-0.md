# Phase 0 prompt pack — Safety rails and backups

Repo: `veerpatta/schoolfees` · Branch: `school-one/phase-0` off `main` · One PR for the phase, one commit per prompt.
Each prompt below is self-contained: paste it to the coding agent as-is, after the agent has read `CLAUDE.md`, `AGENTS.md`, and `docs/school-one/CLAUDE-addendum.md`. Run them in order. Prompts marked **MANUAL** are for Janmejay, not the agent.

Every agent prompt carries this header (copy it verbatim at the top of each prompt):

```
HARD RULES (non-negotiable)
- Production Supabase project vgqyilgstjvgohrsiwkb is never your database. Work against the local stack (`supabase start`) or the dev project only. If any env file or shell variable in your session points at the production ref, stop and report.
- Do not modify anything under src/modules/fees, src/modules/payments, src/modules/receipts, src/modules/promotion, or any migration already in supabase/migrations/. Do not create migrations that alter fee tables.
- Do not add dependencies without listing them in your report first and waiting.
- Do not edit files outside the EDIT LIST. If you need to, stop and report why.
- Validation before commit: npm run typecheck && npm run lint && npm run test && npm run build. Red = stop.
- No real names, phone numbers, or IDs of students or staff in any file you create.
- Pause-and-report on anything unexpected: file missing, test failing before your change, ambiguous instruction.
```

---

## P0.0 — Read-only inventory (agent)

**Goal:** confirm the plan's assumptions about the repo before any edit, and produce `docs/school-one/inventory-phase-0.md`.

**EDIT LIST:** `docs/school-one/inventory-phase-0.md` (new) only.

**Task:**
1. Report the exact path and exported names of: (a) the module that constructs the service-role Supabase client (expected under `src/platform/supabase/`), (b) the module that constructs the browser/anon client, (c) `getOptionalEnvVar`, `getAppMode`, `isVercelProductionEnvironment` in `src/platform/env.ts`, (d) `src/instrumentation.ts` — what `register()` currently does, (e) the two cron routes `src/app/api/cron/nightly-backup/route.ts` and `src/app/api/cron/auto-day-close/route.ts` — how they authenticate (`CRON_SECRET` via query and bearer) and what they return on failure, (f) `scripts/bulk-apply.mjs` lines that implement the `LIVE_SESSION_LABEL` guard, (g) `scripts/lib/` contents, (h) `package.json` scripts related to supabase (`schema:snapshot`, any `db:*`), (i) `supabase/config.toml` project settings relevant to linking, (j) `supabase/seeds/*.sql` — what each creates, (k) `.github/workflows/ci.yml` jobs and Node version, (l) `.env.example` variable names.
2. Confirm the migration naming pattern from the last three files in `supabase/migrations/` and the format of `supabase/migrations/README.md` entries.
3. List every place that reads `process.env.CRON_SECRET`.
4. Do not change anything. Write the inventory as a markdown file with headings matching items 1–3, quoting short snippets with line numbers.

**Acceptance:** file exists; every item answered or explicitly marked "not found".

---

## P0.1 — MANUAL: create the dev project and separate the environments (Janmejay)

1. ✅ Done 16 Sep 2026: `schoolfees-dev` created in org "veerpatta's Org", region `ap-south-1`, Free plan, ref **`wtgxcptmucjerhufzjcf`** (the `Trading Bot Aegis` project was paused to free the Free-plan slot). Remaining: reset its database password and store it only in the password manager (runbook B1).
2. Do **not** copy any production data into it. The agent will seed fake data.
3. Vercel → project `schoolfees` → Settings → Environment Variables. For each of `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`: keep the existing value scoped to **Production only**; add a second entry scoped to **Preview** (and Development) with the **dev** project's values. Remove any entry that is scoped to all environments.
4. Add `PRODUCTION_SUPABASE_PROJECT_REF = vgqyilgstjvgohrsiwkb` scoped to **all** environments.
5. Confirm `AISENSY_API_KEY`, `AISENSY_WEBHOOK_SECRET`, `CRON_SECRET`, `SCHOOLFEES_DOC_TOKEN`, `SCHOOLFEES_MCP_TOKEN` are scoped to **Production only**. Preview must not have them.
6. Locally: create `.env.local` from `.env.example` with the dev project values (never the production values) and `PRODUCTION_SUPABASE_PROJECT_REF=vgqyilgstjvgohrsiwkb`.
7. Tell the agent the dev project ref so P0.2 can add it to the docs (the ref is not a secret; the keys are).
8. **Operations login:** in production, go to `/protected/staff` as `raj@vpps.co.in` and create `director@vpps.co.in` with role `admin` (public signup is disabled by design — admins create users). From now on, daily fee work and reminders are done as `director@`; `raj@` is the canary that sees School One features first. Reminders and cron jobs are unaffected — they do not run as a user.

---

## P0.2 — Dev project bootstrap scripts and seeds (agent)

**Goal:** one command brings the dev project (or local stack) to the current schema with fake data.

**EDIT LIST:** `package.json` (scripts only), `scripts/school-one/dev-db.mjs` (new), `supabase/config.toml` (**only** the `[db.seed].sql_paths` line), `supabase/seeds/04_school_one_dev_seed.sql` (new), `supabase/seeds/README.md` (add 04 and the "never 03" rule), `docs/school-one/dev-environment.md` (new), `.env.example` (add names only).

**Facts from the inventory that shape this prompt:** there are no `db:*` scripts today; `[db.seed].sql_paths` points only at `./seed.sql` (a two-line comment), so nothing applies `supabase/seeds/` today; `03_cleanup_existing_students.sql` is a **DANGER-marked deletion script, not a seed**; the Notion pg_cron jobs are `notion-fee-sync-daily` and `notion-fee-sync-daily-test`; Docker is not installed on the development laptop, so the remote dev project is the only development database and nothing here may assume a local stack.

**Task:**
1. Add npm scripts: `db:push:dev` → `node scripts/school-one/dev-db.mjs push`, `db:reset:dev` → `node scripts/school-one/dev-db.mjs reset`, `db:seed:dev` → `node scripts/school-one/dev-db.mjs seed`.
2. `dev-db.mjs`: reads `SUPABASE_DEV_PROJECT_REF` and `SUPABASE_DEV_DB_PASSWORD` from env (load `.env.local` the same way the repo's other `.mjs` scripts do); **refuses to run** if the ref is empty, equals `PRODUCTION_SUPABASE_PROJECT_REF`, or equals the literal `vgqyilgstjvgohrsiwkb` (hard-coded second check on purpose); also refuses if `supabase/.temp/project-ref` exists and differs from the dev ref. Commands: `push` → `npx supabase link --project-ref <dev> -p <pw>` then `npx supabase db push --yes`; `reset` → `npx supabase db reset --linked` after the user types the dev ref back as confirmation; `seed` → `npx supabase db push --include-seed --yes` (the seed files come from `config.toml`, step 3). No `psql` and no `supabase db query` — neither is available or needed.
3. `supabase/config.toml`: set `[db.seed] sql_paths = ["./seed.sql", "./seeds/01_test_session_setup.sql", "./seeds/02_test_students_seed.sql", "./seeds/04_school_one_dev_seed.sql"]`. **`03_cleanup_existing_students.sql` is never listed and never run by any script.** Note in `supabase/seeds/README.md` that plain `supabase db push` (the production release command in BUILD-PLAN §8) does not apply seeds; only `--include-seed` does.
4. `04_school_one_dev_seed.sql`, in this order: (a) a **production tripwire** as the first statement — `do $$ begin if exists (select 1 from public.students where admission_no not like 'TEST-%') then raise exception 'Refusing to seed: this database holds non-TEST students. Is this production?'; end if; end $$;` — so the file cannot run against real data even if every other guard fails; (b) `select cron.unschedule(jobname) from cron.job where jobname in ('notion-fee-sync-daily','notion-fee-sync-daily-test');` — dev must never call Notion (other pg_cron jobs stay); (c) reuse 01's `TEST-2026-27` session and class rows, add ~60 more fake students across 6 classes with obviously fake names (`Student A01` …), fake phones in the `+91 00000 000NN` pattern, no Aadhaar values, and an `admin` user via the existing bootstrap mechanism. Idempotent (`ON CONFLICT DO NOTHING` like 01/02).
5. `docs/school-one/dev-environment.md`: how to run local stack vs dev project, which env vars, what the guard does, how to reset.
6. `.env.example`: add `PRODUCTION_SUPABASE_PROJECT_REF`, `SUPABASE_DEV_PROJECT_REF`, `ALLOW_PRODUCTION_DB_OUTSIDE_PRODUCTION` with comments explaining each (names only, no values).

**Acceptance:** `npm run db:push:dev` against the dev project applies all 218 migrations with zero errors and `supabase migration list` shows local = remote; `npm run db:seed:dev` is idempotent (second run makes no changes) and `cron.job` no longer lists the two Notion jobs in dev; `dev-db.mjs` with the production ref exits non-zero before doing anything; `.env.example` gains `SUPABASE_DEV_DB_PASSWORD` too; existing tests green.

---

## P0.3 — Production write guard (agent)

**Goal:** the app and every script refuse to talk to the production project unless the process is a Vercel production deployment (or a human explicitly overrides for a scripted read).

**EDIT LIST:** `src/platform/env.ts`, `src/platform/db-target.ts` (new), `src/instrumentation.ts`, `src/app/layout.tsx` (banner only), `src/ui/` (one new small component for the banner), `scripts/lib/db-target-guard.mjs` (new), `scripts/bulk-apply.mjs` (import the guard at the top; no other change), `tests/unit/db-target-guard.test.ts` (new), `src/messages/*` (banner strings, both locales).

**Task:**
1. `src/platform/db-target.ts` exports:
   - `getSupabaseProjectRef(url = NEXT_PUBLIC_SUPABASE_URL): string | null` — parses `https://<ref>.supabase.co`; returns `null` for `localhost`/`127.0.0.1` (local stack).
   - `getDatabaseTarget(): { ref, kind: 'production' | 'dev' | 'local' | 'unknown' }` — `production` when ref equals `PRODUCTION_SUPABASE_PROJECT_REF`; `local` when null ref; else `dev`.
   - `assertSafeDatabaseTarget(): void` — throws `DatabaseTargetError` with the message `Refusing to start: this environment (VERCEL_ENV=<value>) is pointed at the PRODUCTION Supabase project. Fix the environment variables.` when `kind === 'production'` and `VERCEL_ENV !== 'production'`, unless `ALLOW_PRODUCTION_DB_OUTSIDE_PRODUCTION === 'I understand'` **and** `VERCEL_ENV` is unset (local scripts only — never on Vercel). When the override is used, print a red multi-line warning to stderr.
   - If `PRODUCTION_SUPABASE_PROJECT_REF` is **unset**, the guard logs a warning once and allows (so a missing variable cannot take production down), but `tests` assert the warning path.
2. Call `assertSafeDatabaseTarget()` from `register()` in `src/instrumentation.ts` for the Node runtime only (keep existing Sentry setup intact). A thrown error must fail the server start visibly.
3. Banner: in `src/app/layout.tsx`, when `getDatabaseTarget().kind !== 'production'`, render a fixed top strip: `DEV DATABASE — <ref or 'local'> — not the live school data` (Hindi line below it). Never rendered in production. Keep the root layout's `force-dynamic` and existing structure; the banner is a server component with no client JS.
4. `scripts/lib/db-target-guard.mjs`: same logic for `.mjs` scripts reading `NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_URL`; import it as the first line of `scripts/bulk-apply.mjs` (leave its existing `LIVE_SESSION_LABEL` guard exactly as is — the two guards are complementary).
5. Tests: production ref + preview → throws; production ref + production → allows; dev ref + preview → allows; local → allows; override without VERCEL_ENV → allows with warning; override with VERCEL_ENV=preview → still throws; unset `PRODUCTION_SUPABASE_PROJECT_REF` → allows with warning.

**Acceptance:** tests above pass; `npm run build` passes; running `VERCEL_ENV=preview NEXT_PUBLIC_SUPABASE_URL=https://vgqyilgstjvgohrsiwkb.supabase.co PRODUCTION_SUPABASE_PROJECT_REF=vgqyilgstjvgohrsiwkb npm run start` exits with the refusal message (document the exact command and output in your report); the dev banner shows locally.

---

## P0.4 — Job platform: `job_runs`, `backup_runs`, `runJob()`, per-job secrets (agent)

**Goal:** every scheduled or triggered job leaves a row, and each job family has its own secret.

**EDIT LIST:** `supabase/migrations/<timestamp>_school_one_job_runs.sql` (new), `supabase/migrations/README.md`, `src/platform/jobs/run-job.ts` (new), `src/platform/jobs/job-secret.ts` (new), `src/platform/jobs/README.md` (new), `src/app/api/cron/nightly-backup/route.ts`, `src/app/api/cron/auto-day-close/route.ts`, `src/app/api/cron/whatsapp-scheduled-runs/route.ts`, `src/app/api/jobs/backup-report/route.ts` (new), `tests/unit/job-secret.test.ts` (new), `tests/unit/run-job.test.ts` (new), `.env.example` (names only), `supabase/schema.sql` (regenerate via `npm run schema:snapshot`).

**Facts from the inventory that shape this prompt:** `CRON_SECRET` is read by **five** route handlers and three scripts, not two routes. This prompt wraps the three *job* routes (`nightly-backup`, `auto-day-close`, `whatsapp-scheduled-runs`). The two `/api/admin/*` maintenance routes (`revalidate-after-bulk`, `repair-discount-drift`) and the scripts `scripts/repair-discount-drift.mjs`, `scripts/bulk-apply-payment-corrections.mjs`, `scripts/cloud/use-env.sh` are **fee-module tooling and stay untouched on `CRON_SECRET`**. Consequently `CRON_SECRET` is **not** retired in Phase 0 (see decisions.md D-21). Each route today has its own private `authorize()`; `auto-day-close` deliberately has no `maxDuration` — do not add one. The pg_cron → route template is `supabase/migrations/20260612023000_notion_fee_sync.sql` lines 310–320 (Vault-read header).

**Task:**
1. Migration (additive only): tables `public.job_runs` and `public.backup_runs` exactly as specified in `docs/school-one/BUILD-PLAN.md` §3.1; RLS enabled; SELECT policy `has_permission('staff:manage')` (admin) for both; no INSERT/UPDATE policies for `authenticated` (writes are service-role only); index `(job_name, started_at desc)`; table comments stating purpose. Follow the naming convention found in P0.0.
2. `job-secret.ts`: `requireJobSecret(request, jobName)` reads `Authorization: Bearer <token>` (also accept `?secret=` **only** for the three legacy routes, behind an explicit `allowQuery: true` option, so the existing pg_cron/Vercel callers keep working during transition), compares in constant time against `process.env[`JOB_SECRET_${JOB_NAME_UPPER}`]`, falls back to `CRON_SECRET` **only if** the job-specific variable is unset (log a deprecation warning), returns 401 `Unauthorized` with no detail otherwise. Unset both → log error, 401. The three job names are `nightly_backup`, `auto_day_close`, `whatsapp_scheduled_runs`.
3. `run-job.ts`: `runJob({ name, trigger, request }, fn)` inserts a `job_runs` row with `status='running'` using the service-role client, runs `fn(ctx)` where `ctx.progress(n)` updates `items_processed`, then updates `status/finished_at/details/error`. Errors are captured to Sentry with the job name tag and re-thrown after the row is updated. Never swallows.
4. Wrap the three existing job routes: same behaviour and same response bodies as today (diff the responses in tests — `nightly-backup` returns 200/207, `auto-day-close` keeps its `?date=` backfill and 500-on-error shape, `whatsapp-scheduled-runs` keeps `?dryRun=1`), just inside `runJob()` and using `requireJobSecret()` with `allowQuery: true`. `maxDuration` unchanged — including the deliberate absence on `auto-day-close`. The two `/api/admin/*` routes are **not** touched.
5. `POST /api/jobs/backup-report`: `requireJobSecret(request, 'backup_report')`; body validated with `zod` (kind, dump_bytes, sha256, row_counts, destinations, verified, notes); inserts `backup_runs`; returns `{ id }`. Node runtime.
6. `README.md` for the jobs platform: the `runJob` contract, secret naming, how pg_cron calls a route (existing `net.http_post` pattern from `20260612023000_notion_fee_sync.sql`), and the rule "a job that cannot record a `job_runs` row must not run".

**Acceptance:** migration applies on dev (`npm run db:push:dev`); `schema:snapshot --check` passes; all three job routes behave identically for a caller using `CRON_SECRET` and for a caller using the new per-job secret; `job_runs` shows a row per invocation; `grep -rn CRON_SECRET src scripts` still lists the two admin routes and three scripts (untouched) and nothing else new; tests green.

---

## P0.5 — MANUAL: backup destinations and secrets (Janmejay)

1. **Google:** in the Workspace Admin console confirm Shared Drives are enabled. In Google Drive create a Shared Drive `VPPS-SchoolOne-Backups`. In Google Cloud (create project `vpps-school-one`) enable the **Google Drive API**, create a service account `schoolone-backup@…`, create a JSON key, and add the service account's email to the Shared Drive as **Content manager**. Note the Shared Drive ID from its URL.
2. **Cloudflare R2:** create bucket `vpps-schoolone-backups` (no public access); create an R2 API token scoped to that bucket (Object Read & Write); note account id, access key id, secret.
3. **Encryption keys:** run `age-keygen` **twice** on your own machine. Key 1 = the school's recovery key: store the private key in your password manager **and** print it once for the school safe; only its public key (`age1…`) goes to GitHub. Key 2 = the drill key: its private key goes to GitHub as a secret so the monthly restore drill can decrypt. (If you prefer that no private key ever sits in GitHub, tell the agent to make the drill a manual local script instead — the trade-off is that the drill then depends on you running it.)
4. **Supabase:** Project → Settings → Database → Connection string → **Session pooler** (IPv4). Create a GitHub environment named `backup` with required reviewer = you, and add secrets: `SUPABASE_PROD_DB_URL`, `BACKUP_AGE_RECIPIENT` (key 1 public), `BACKUP_DRILL_AGE_RECIPIENT` (key 2 public), `BACKUP_DRILL_AGE_IDENTITY` (key 2 private), `GDRIVE_SA_JSON`, `GDRIVE_SHARED_DRIVE_ID`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `JOB_SECRET_BACKUP_REPORT`, `SCHOOLFEES_BASE_URL` (`https://schoolfees-two.vercel.app`).
5. **Vercel Production:** add `JOB_SECRET_BACKUP_REPORT` (same value as GitHub), `JOB_SECRET_NIGHTLY_BACKUP`, `JOB_SECRET_AUTO_DAY_CLOSE`, `JOB_SECRET_WHATSAPP_SCHEDULED_RUNS`. Do **not** remove `CRON_SECRET` (decisions.md D-21).
6. Write the location of the printed key on paper in the school's records register, not in any file.

---

## P0.6 — Nightly off-platform backup workflow (agent)

**Goal:** a nightly, encrypted, verified logical backup of the whole production database in two places, with a manifest, run by GitHub Actions.

**EDIT LIST:** `.github/workflows/backup-nightly.yml` (new), `scripts/school-one/backup/dump.sh` (new), `scripts/school-one/backup/invariants.sql` (new), `scripts/school-one/backup/manifest.mjs` (new), `scripts/school-one/backup/upload.sh` (new), `scripts/school-one/backup/README.md` (new).

**Task:**
1. Workflow: `schedule: '30 19 * * *'` (01:00 IST) + `workflow_dispatch`; `environment: backup`; `runs-on: ubuntu-latest`; concurrency group `backup` (no overlapping runs); timeout 30 min; installs the Supabase CLI (`supabase/setup-cli@v1`), `postgresql-client-17` from PGDG, `age`, `rclone`.
2. `dump.sh` (takes `$SUPABASE_PROD_DB_URL`, never echoes it): produces in `./out/<YYYY-MM-DD>/`: `roles.sql` (`supabase db dump --role-only`), `schema.sql` (`supabase db dump`), `data.sql` (`supabase db dump --data-only --use-copy`), and `public.dump` (`pg_dump -Fc --no-owner --no-privileges -n public -n auth -n storage`; if `auth`/`storage` are refused, retry with `-n public` only and note it in the manifest). Also runs `invariants.sql` with `psql --csv` → `invariants.csv`.
3. `invariants.sql`: `select count(*)` for every table in `public` (generated dynamically from `pg_tables`), plus three fixed aggregates chosen by reading `supabase/schema.sql`: total of the payments amount column grouped by session (via `installments.class_id → classes.session_label`, following the app's own anchoring rule), receipt count, student count by status. **Read-only.** Do not modify any row.
4. `manifest.mjs`: writes `manifest.json` with dump sizes, SHA-256 of each file, the git SHA of `supabase/migrations/` at run time, the invariants table, and `started_at/finished_at`. Then encrypts every file except the manifest with `age -r $BACKUP_AGE_RECIPIENT -r $BACKUP_DRILL_AGE_RECIPIENT`. Deletes plaintext.
5. `upload.sh`: `rclone` with config from env (`RCLONE_CONFIG_GDRIVE_TYPE=drive`, `RCLONE_CONFIG_GDRIVE_SERVICE_ACCOUNT_CREDENTIALS` from the JSON secret, `RCLONE_CONFIG_GDRIVE_TEAM_DRIVE=$GDRIVE_SHARED_DRIVE_ID`; `RCLONE_CONFIG_R2_TYPE=s3`, `RCLONE_CONFIG_R2_PROVIDER=Cloudflare`, endpoint `https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com`). Copies the day's folder to `daily/<date>/` in both; on Sundays also to `weekly/<date>/`; on the 1st also to `monthly/<date>/`. Verifies with `rclone check`. Prunes `daily/` older than 14 days, `weekly/` older than 56 days, `monthly/` older than 730 days (`rclone delete --min-age`). Both destinations must succeed or the job fails.
6. Final step: `curl` POST to `$SCHOOLFEES_BASE_URL/api/jobs/backup-report` with `Authorization: Bearer $JOB_SECRET_BACKUP_REPORT` and the manifest summary (`kind: 'nightly'`, `verified: true` only if `rclone check` passed on both).
7. README: how to run the workflow by hand, where files land, how to decrypt with key 1 on a laptop (`age -d -i key.txt`), and the sentence "the existing `/api/cron/nightly-backup` route is deprecated and will be removed after the first successful restore drill".

**Acceptance:** a `workflow_dispatch` run (started by Janmejay, since the `backup` environment requires approval) completes green; both destinations show the folder with identical checksums; `backup_runs` has a row with `verified = true`; no secret value appears in logs (grep the log for `postgres://` and the R2 key prefix).

---

## P0.7 — Monthly restore drill workflow (agent)

**Goal:** prove the backup restores, automatically, every month.

**EDIT LIST:** `.github/workflows/backup-restore-drill.yml` (new), `scripts/school-one/backup/restore-drill.sh` (new), `scripts/school-one/backup/compare-invariants.mjs` (new), `scripts/school-one/backup/README.md` (append).

**Task:**
1. Workflow: `schedule: '0 21 1 * *'` (02:30 IST on the 1st) + `workflow_dispatch`; `environment: backup`; service container `supabase/postgres` at the tag recorded in `docs/school-one/decisions.md` D-20 (production's version, read from the Supabase management API — never by connecting to the database; dev currently runs a newer build, `17.6.1.166`, which is fine for a restore target). Verify the tag exists on Docker Hub and fall back to the nearest `17.x` tag, noting the choice in the workflow log. Fallback if the image cannot start in CI: `postgres:17` plus a pre-script that creates the roles `anon`, `authenticated`, `service_role`, `supabase_admin`, schemas `auth`, `extensions`, `private`, and stub functions `auth.uid()`, `auth.role()`, `auth.jwt()` so policies load.
2. `restore-drill.sh`: downloads the newest `daily/` folder from R2 (`rclone copy`), decrypts with `BACKUP_DRILL_AGE_IDENTITY`, verifies SHA-256 against `manifest.json`, restores `public.dump` with `pg_restore --no-owner --no-privileges -n public` (do not `--exit-on-error`; collect errors to a file and fail only if data-section errors exist), then runs `invariants.sql` against the restored database.
3. `compare-invariants.mjs`: compares restored invariants to the manifest's; any difference → non-zero exit with a table of mismatches.
4. Report: POST to `/api/jobs/backup-report` with `kind: 'restore_drill'`, `verified: <bool>`, `notes: <error summary or 'ok'>`.

**Acceptance:** one manual run passes on the previous night's backup with zero invariant mismatches; a deliberately corrupted manifest (edit one count locally in a dry test) makes the compare step fail — document the test.

---

## P0.9 — Feature flags and the canary model (agent)

*(Numbered 9 because it was added after the pack was first written; run it here, before P0.8, so the docs prompt can describe it.)*

**Goal:** every School One surface can be shown to one user, one role, or everyone, without a deploy — so `director@vpps.co.in` keeps seeing today's fee app while `raj@vpps.co.in` sees new work.

**EDIT LIST:** `supabase/migrations/<timestamp>_school_one_feature_flags.sql` (new), `supabase/migrations/README.md`, `src/platform/features/flags.ts` (new), `src/platform/features/README.md` (new), `src/platform/config/navigation.ts` (add an optional `featureFlag` field to nav items and filter on it in `getVisibleProtectedNavigation`), `src/app/protected/settings/features/page.tsx` + `actions.ts` (new), `tests/unit/feature-flags.test.ts` (new), `supabase/schema.sql` (regenerate), `supabase/seeds/04_school_one_dev_seed.sql` (add a `school_one_placeholder` flag enabled for the seeded admin).

**Task:**
1. Migration (additive): `public.feature_flags` — `key text primary key`, `description text not null`, `enabled_for_all boolean default false`, `enabled_roles staff_role[] default '{}'`, `enabled_user_ids uuid[] default '{}'`, `updated_by uuid references users(id)`, `updated_at timestamptz default now()`. RLS on; SELECT for `authenticated` (flags are not secrets); INSERT/UPDATE only via `has_permission('settings:write')`; no DELETE policy (retire by turning off). Table comment explaining the canary model. Insert one row `school_one_placeholder` with everything off.
2. `flags.ts`: `isFeatureEnabled(key, staff: { id, role }): Promise<boolean>` — true if `enabled_for_all`, or role ∈ `enabled_roles`, or id ∈ `enabled_user_ids`; unknown key → false and a Sentry warning (never throw). Cache 60 s per key, same pattern as `STAFF_PROFILE_REVALIDATE_SECONDS` in `src/platform/supabase/session.ts`. Also export `requireFeature(key)` for server components/actions that returns a 404 (not 403 — the feature should be invisible, not forbidden) when disabled.
3. Navigation: items may carry `featureFlag: 'key'`; `getVisibleProtectedNavigation` drops them when disabled. Add one placeholder item "School One" → `/protected/school-one` (a one-line page that says the module list will appear here) gated by `school_one_placeholder`. Keep `src/proxy.ts` untouched (it must stay import-free).
4. Settings editor: table of flags with three controls (for all / roles multi-select / users multi-select by name), audit via the existing `audit_logs` mechanism if the settings pages already use it (check how `/protected/settings` writes `app_settings` and follow that pattern). `settings:write` only.
5. Tests: precedence rules; unknown key; cache invalidation on update; the placeholder page returns 404 for a user without the flag and 200 with it.

**Acceptance:** on the local stack, seeded admin sees the placeholder nav item; a second seeded admin without the flag does not and gets 404 on the route; `schema:snapshot --check` passes; existing tests green.

---

## P0.8 — Docs, checklists, deprecations (agent)

**EDIT LIST:** `CLAUDE.md` (one pointer line only, under the hard rules), `docs/school-one/README.md` (exists — update the index if files were added), `docs/school-one/decisions.md` (exists — add any default you introduced), `docs/school-one/RELEASES.md` (exists), `PRODUCTION_OPERATIONS_CHECKLIST.md` (add the backup section and the environment matrix; mark the Storage-bucket backup as deprecated), `src/app/api/cron/nightly-backup/route.ts` (a top-of-file deprecation comment only), `docs/school-one/fixtures/README.md` (exists).

**Acceptance:** `npm run docs:map:check` passes (the repo already checks its docs map — extend the map if the check requires it); links resolve.

---

## Phase 0 exit checklist (Janmejay signs)

- [ ] Preview deployment of the `school-one/phase-0` branch shows the DEV DATABASE banner and lists the dev ref.
- [ ] Setting the production URL in a Preview variable (temporarily, then reverting) makes the preview fail to boot with the refusal message.
- [ ] Two consecutive nightly backups exist in both Drive and R2 with matching manifests.
- [ ] One restore drill passed.
- [ ] `job_runs` shows `nightly-backup` and `auto-day-close` rows for two nights.
- [ ] `director@vpps.co.in` exists, is used for daily operations, and sees no School One item; `raj@vpps.co.in` sees the placeholder item after the flag is enabled for that user only.
- [ ] CI green on the PR; AI review has no blocking finding.
- [ ] Production release done per `BUILD-PLAN.md` §8 (Sunday; migrations `job_runs/backup_runs` and `feature_flags` only; deploy).
- [ ] `RELEASES.md` entry written.

Only after every box is ticked does Phase 1 start.
