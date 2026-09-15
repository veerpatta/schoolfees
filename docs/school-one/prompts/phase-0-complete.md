# Phase 0 — complete end to end (P0.3 → P0.7), then hand over for release

Paste everything below the line into Claude Code, in the repo root, on branch `school-one/phase-0`. One session; it runs the remaining Phase 0 prompts back to back and ends with a pull request ready for Janmejay to merge. It never merges, never touches production, and never runs a backup for real.

---

You are completing **Phase 0 of School One** end to end in this session. P0.0 (kickoff), P0.1 (manual) and P0.2 (dev bootstrap) are done and committed on `school-one/phase-0`. Your job is to execute **P0.3, P0.4, P0.9, P0.8, P0.6, P0.7** from `docs/school-one/prompts/phase-0.md`, in that order, then prepare the pull request. You do **not** merge to `main`; Janmejay does that per `docs/school-one/BUILD-PLAN.md` §8.

## Context to load first

1. `docs/school-one/CLAUDE-addendum.md` — hard rules; they apply to every step below.
2. `docs/school-one/decisions.md` — especially D-20 to D-28 (added after the kickoff and P0.2). If D-24 to D-28 are missing, add them first from `docs/school-one/kickoff-report.md` and the P0.2 commit messages, then continue.
3. `docs/school-one/prompts/phase-0.md` — the prompts you will execute. Read all of it once before starting.
4. `docs/school-one/inventory-phase-0.md` — the real file paths and behaviours; where a prompt and the inventory disagree, the inventory wins and you note the deviation.
5. `scripts/school-one/dev-db.mjs` and `docs/school-one/dev-environment.md` — how the dev database is built (restore, not replay; `--include-seed` does not re-seed; the tripwire).

## Operating rules for this session

- **Database:** only `wtgxcptmucjerhufzjcf` (dev), via `npm run db:push:dev` / `db:seed:dev` / `db:reset:dev`. Production ref `vgqyilgstjvgohrsiwkb` is never a target — not for `db push`, not for `migration repair`, not for a `select`. If any command would touch it, stop.
- **Fee module is read-only.** Nothing under `src/modules/fees|payments|receipts|promotion`, no fee table, RPC, trigger or policy. The two `/api/admin/*` routes and the three `CRON_SECRET` scripts stay untouched (D-21).
- **One prompt = one or more commits, then push.** After each prompt's acceptance is met: commit with a conventional message, `git push`, and append a short entry to `docs/school-one/phase-0-progress.md` (create it) with: prompt id, commits, acceptance evidence (numbers, command output summaries), deviations. Do not stop between prompts unless a stop condition below fires.
- **Validation before every commit:** `npm run typecheck && npm run lint && npm run test`. `npm run build` before the commit that ends each prompt. `npm run schema:snapshot:check` whenever a migration changed. D-23's flaky test may be re-run once; anything else red is a stop.
- **Stop conditions (write the reason in `phase-0-progress.md`, commit, push, and stop):** a file outside the prompt's edit list is needed and it is not a docs/test file; a new npm dependency is needed; a test that was green goes red and the cause is not your change; anything requires a production credential, a real WhatsApp send, or a real backup run; you are unsure whether a step is safe.
- **No secrets anywhere.** Names only in `.env.example`, docs and workflows. Never print `.env.local` values.
- **Deviation from a prompt is allowed when the inventory or the code proves the prompt wrong** (as P0.2 did with `db reset --linked`). Record every deviation in the progress file and in the PR description.

## Sequence

### 1. P0.3 — production write guard

Execute P0.3 as written. Notes from the inventory: the admin client is `src/platform/supabase/admin.ts#createAdminClient()`; the guard hooks into the `NEXT_RUNTIME === "nodejs"` branch of `src/instrumentation.ts#register()` and must leave the Sentry imports intact; `getOptionalEnvVar` is the accessor (do not add the new variables to `requiredEnvVars`); the stale `// Goes at REPO ROOT` header comment in `instrumentation.ts` may be corrected. For the refusal proof, run a production build once and start it with the preview/production-ref environment from the acceptance line; capture the refusal message into the progress file. Also confirm the guard **allows** when pointed at the dev ref with `VERCEL_ENV=preview`, because the Vercel preview of this branch relies on exactly that.

### 2. P0.4 — job platform

Execute P0.4 as amended: three job routes (`nightly-backup`, `auto-day-close`, `whatsapp-scheduled-runs`), per-job secrets with `CRON_SECRET` fallback, `job_runs` + `backup_runs` migration, `/api/jobs/backup-report`. Reproduce each route's response shapes exactly (200/207 on nightly-backup; `?date=` and 500-on-error on auto-day-close; `?dryRun=1` on whatsapp-scheduled-runs). Apply the migration to dev with `npm run db:push:dev`, regenerate the snapshot, and update `supabase/migrations/README.md` in the repo's index style. Prove with tests that the same request succeeds with `CRON_SECRET` and with the per-job secret, and that a missing secret yields 401 with no detail.

### 3. P0.9 — feature flags and the canary model

Execute P0.9 as written: `feature_flags` table, `isFeatureEnabled()`, `requireFeature()` returning 404, nav gating via an optional `featureFlag` field, the `/protected/settings/features` editor behind `settings:write`, the `school_one_placeholder` flag and its one-line page. Seed the flag **off for everyone** in the migration; in `04_school_one_dev_seed.sql` enable it for the seeded dev admin only. Keep `src/proxy.ts` import-free. Tests must show: unknown key → false; a user without the flag gets 404 on `/protected/school-one`; a user with the flag gets 200; the nav item is absent/present accordingly.

### 4. P0.8 — docs, checklist, deprecations, and the snapshot generator fix (D-25)

Execute P0.8 as written, plus D-25: change `scripts/generate-schema-snapshot.mjs` so indexes on materialized views are emitted **after** the views (keep every other section order identical), regenerate `supabase/schema.sql`, then delete the reordering list from `dev-db.mjs` and prove it with a full `npm run db:reset:dev` that reproduces the same counts as before (139 students, 0 non-TEST, 24 assignments, 11 family members, 19 classes, 4 cron jobs, 0 Notion jobs). If the generator fix is larger than ~50 lines or touches anything beyond section ordering, leave D-25 open, keep the reordering list, and say so. `npm run docs:map:check` must pass; add the `docs/school-one/` files to the docs map if the check demands it.

### 5. P0.6 and P0.7 — backup workflows, written and inert until secrets exist

Write both workflows and their scripts exactly as specified, with one addition: **gate both workflows** on a repository variable so they cannot fail nightly before Janmejay finishes runbook section C:

```yaml
jobs:
  backup:
    if: vars.SCHOOLONE_BACKUPS_ENABLED == 'true'
```

Document in `scripts/school-one/backup/README.md` that Janmejay sets `SCHOOLONE_BACKUPS_ENABLED=true` (Settings → Secrets and variables → Actions → Variables) only after C1–C8 are done, then triggers `workflow_dispatch` once and checks `backup_runs`. You cannot run either workflow; validate them instead with `actionlint` if available (`npx actionlint` is fine as a one-off, do not add it as a dependency) and by `bash -n` on every shell script and `node --check` on every `.mjs`. `invariants.sql` must be derived from `supabase/schema.sql`: confirm the payments amount column name and the session anchoring path (`payments → installments.class_id → classes.session_label`) by reading the schema, and run the invariants query **against dev** to prove it executes (its numbers will be the seed's, which is fine). D-20 supplies the Postgres image tag.

### 6. Prepare the release — do not perform it

1. Final full validation: `npm run typecheck && npm run lint && npm run test && npm run build && npm run schema:snapshot:check && npm run docs:map:check && npm run quality:budgets && npm run quality:architecture`.
2. `npm run db:reset:dev` one last time from scratch; confirm `supabase migration list` shows local = remote and record the applied version count.
3. **Self-review pass (this is the AI review step from D-15):** read the complete `git diff main..HEAD` in chunks and list, in `phase-0-progress.md`, every place where the diff touches anything named in the fee-module read-only list, every new env var, every new route, every new table with its RLS policies, and anything you would flag if reviewing a colleague. Fix what is clearly wrong; leave judgement calls listed.
4. Write the draft `docs/school-one/RELEASES.md` row for Phase 0 with these exact release-day steps for Janmejay, in order: (a) fresh backup — until P0.6 has run for real, this means downloading the latest Storage-bucket CSV backup **and** taking a manual `supabase db dump` from his machine; (b) `supabase migration repair --status applied 20260612023100 20260727113700` against production (D-26); (c) `npx supabase db push --linked --yes` — list the exact migration versions it will apply (the P0.4 and P0.9 ones); (d) merge the PR; (e) after deploy, log in as `director@vpps.co.in` and confirm nothing visible changed; log in as `raj@vpps.co.in`, enable `school_one_placeholder` for that user only in `/protected/settings/features`, confirm the placeholder appears for `raj@` and not for `director@`; (f) set the three new `JOB_SECRET_*` production variables (C8) and watch `job_runs` for two nights; (g) after C1–C8, set `SCHOOLONE_BACKUPS_ENABLED=true`, run the backup workflow by hand, then the restore drill, and tick the exit checklist.
5. Update `docs/school-one/SETUP-RUNBOOK.md` section D/E to reflect what is now done.
6. Open the pull request with `gh pr create` (if `gh` is not authenticated, write the title and body to `docs/school-one/phase-0-pr.md` and stop): title `School One Phase 0 — safety rails, job platform, feature flags, backups`; body = summary per prompt, the deviations list, the self-review findings, the release-day steps from RELEASES.md, and the phrase "**No production change until the release-day steps are performed by Janmejay.**" Base `main`, head `school-one/phase-0`, draft = false.
7. Final report in `phase-0-progress.md`: one table — prompt, commits, acceptance met (yes/partial), what remains for a human. Push. Stop.

## What "done" looks like

- Every agent prompt of Phase 0 committed and pushed on `school-one/phase-0`, each with acceptance evidence in `docs/school-one/phase-0-progress.md`.
- Full validation green; dev rebuilt from scratch; local = remote on dev.
- Backup workflows present, syntax-checked, and inert until `SCHOOLONE_BACKUPS_ENABLED=true`.
- A PR against `main` whose body tells Janmejay exactly what to do on release day, including the `migration repair` step.
- Nothing merged, nothing on production changed, no secret in the repo, no message sent.
