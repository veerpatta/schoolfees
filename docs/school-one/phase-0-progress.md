# Phase 0 — execution log

One entry per prompt, written as each is finished: what was committed, the
evidence its acceptance criteria were actually met, and every deviation from
the prompt as written.

Prompts P0.0 (kickoff), P0.1 (manual) and P0.2 (dev bootstrap) were completed in
earlier sessions; see `kickoff-report.md`, `inventory-phase-0.md` and
`dev-environment.md`. This file starts at P0.3.

Database throughout: `wtgxcptmucjerhufzjcf` (dev). Production was never a target.

---

## P0.3 — Production write guard

**Commits:** see `git log` for `feat(school-one): refuse to start against the live school database`

### Acceptance

| Criterion | Evidence |
|---|---|
| Unit tests pass | `tests/unit/db-target-guard.test.ts` — **15 tests**, all green |
| `npm run build` passes | exit 0 |
| Preview + production ref refuses | command and output below |
| Dev banner shows locally | rendered HTML below |
| Full suite green | **372 files / 3,180 tests**, exit 0 (was 371/3,165 before this prompt) |

**The refusal**, exactly as run:

```
VERCEL_ENV=preview \
NEXT_PUBLIC_SUPABASE_URL=https://vgqyilgstjvgohrsiwkb.supabase.co \
PRODUCTION_SUPABASE_PROJECT_REF=vgqyilgstjvgohrsiwkb \
npm run start
```

```
Failed to prepare server Error [DatabaseTargetError]: An error occurred while
loading instrumentation hook: Refusing to start: this environment
(VERCEL_ENV=preview) is pointed at the PRODUCTION Supabase project. Fix the
environment variables.
```

The server never becomes ready, so every request 500s rather than being served
from the wrong database. Note the process does not exit on its own — Next
reports `unhandledRejection` and hangs; on Vercel the deployment is visibly
broken, which is the intent, but it is not a clean `exit 1`.

**The allow that matters just as much.** The Vercel preview of this branch is
dev ref + `VERCEL_ENV=preview`. If the guard were too eager, every preview would
stop booting:

```
VERCEL_ENV=preview npm run start
→ ✓ Ready in 220ms
```

**The banner**, served at `/auth/login` against the dev project:

```html
<div role="status" aria-live="polite" data-testid="dev-database-banner" …>
  <p …>DEV DATABASE — wtgxcptmucjerhufzjcf — not the live school data</p>
  <p …>विकास डेटाबेस — wtgxcptmucjerhufzjcf — यह स्कूल का असली डेटा नहीं है</p>
</div>
```

**The script guard**, via `scripts/bulk-apply.mjs`:

```
NEXT_PUBLIC_SUPABASE_URL=https://vgqyilgstjvgohrsiwkb.supabase.co node scripts/bulk-apply.mjs --help
  ✖  Refusing to start: this environment (VERCEL_ENV=unset) is pointed at the
     PRODUCTION Supabase project.                                    → exit 1

node scripts/bulk-apply.mjs --help                                   → exit 0
```

### Deviations and judgement calls

- **The `.mjs` guard loads `.env.local` itself.** The prompt says import it as
  the first line of `bulk-apply.mjs`, and that script loads its own environment
  at line 62 — long after an import has been evaluated. A guard that runs before
  the environment exists reads nothing and allows everything, so the guard loads
  the same files first (the loader skips keys already set, so the later load is
  a no-op). Without this the guard would have been decorative.
- **Guard logic is duplicated, not shared,** between `src/platform/db-target.ts`
  and `scripts/lib/db-target-guard.mjs`. The scripts are plain ESM with no build
  step and no `@/` alias; importing the TypeScript module would have meant a
  build dependency in the one place that must never fail to load. Both carry a
  `SHARED RULE` comment naming the other.
- **`kind: "unknown"` is refused-by-omission, not treated as dev.** An
  unreadable `NEXT_PUBLIC_SUPABASE_URL` is not a safe target, but it is also not
  production, so the guard allows it and `getDatabaseTarget()` reports `unknown`
  rather than guessing `dev`. The banner shows "unrecognised" for it, which is
  the visible half of the same answer.
- **Corrected the stale `// Goes at REPO ROOT: instrumentation.ts` comment** in
  `src/instrumentation.ts`, as the prompt permits — the file is at
  `src/instrumentation.ts` and there is no root copy.
- **Banner strings went into all three catalogues**, not two: the repo has
  `en`, `hi` and `hi-en`. The English line follows the active locale; the Hindi
  line is always shown beneath it except when the app is already in Hindi, where
  it would be a duplicate. A warning most of the office cannot read is not a
  warning.
- **The banner sits outside the providers** in `layout.tsx`. It must not be able
  to fail because a theme, locale or provider failed.
- `resetDatabaseTargetWarningsForTests()` is exported solely so the warn-once
  path can be asserted more than once in a suite. Nothing in the app calls it.

---

## P0.4 — Job platform

**Commits:** `feat(school-one): every job leaves a row, and each one has its own key`

### Acceptance

| Criterion | Evidence |
|---|---|
| Migration applies on dev | `20260916090000` + `20260916090500` applied; `job_runs` and `backup_runs` exist, RLS on, 1 SELECT policy each, 9 columns each |
| `schema:snapshot:check` passes | "supabase/schema.sql is up to date" (see the exit-code note below) |
| Three routes work on `CRON_SECRET` **and** the per-job secret | live runs below |
| `job_runs` shows a row per invocation | live rows below |
| `CRON_SECRET` readers unchanged | 2 admin routes + 3 scripts, nothing new |
| Tests green | **374 files / 3,195 tests** |

**Live, against the dev project** (`APP_MODE=production`, which is production's mode):

```
# CRON_SECRET only — the transition state every live caller is in today
GET /api/cron/auto-day-close?date=2020-01-01   Bearer shared-only
→ 200 {"ok":true,"targetDate":"2020-01-01","receiptCount":0,"receiptTotal":0,"refundProcessedTotal":0}

# the same, as ?secret= — the form the existing pg_cron/Vercel callers use
→ 200 (identical body)

# per-job secret, once JOB_SECRET_AUTO_DAY_CLOSE is set
GET …?date=2020-01-02   Bearer per-job-secret
→ 200 {"ok":true,"targetDate":"2020-01-02",…}   (identical shape)

# CRON_SECRET after the per-job secret exists — the fallback closes behind it
→ 401 {"ok":false,"error":"Unauthorized"}

# no secret / wrong secret
→ 401 {"ok":false,"error":"Unauthorized"}   (no variable name in the body)
```

The rows those calls left:

```
job_name        trigger  status     items  details                               error
auto_day_close  manual   succeeded  0      {targetDate: 2020-01-02, receipt…}    null
auto_day_close  manual   succeeded  0      {targetDate: 2020-01-01, receipt…}    null
```

Probe rows and the two artificial `collection_closures` dates were deleted from
dev afterwards; `job_runs` is back to 0.

### Deviations and judgement calls

- **`ctx.fail(reason)` was added to the `runJob` contract.** The prompt says
  wrapping must not change response bodies, and these routes answer their own
  handled failures — 207 when some dumps failed, 500 with the message when a
  query did. Throwing would change what the caller receives; returning normally
  would record a failed run as succeeded. `fail()` records the truth and leaves
  the response alone. Unhandled throws still record, report to Sentry and
  re-throw.
- **A second migration, `20260916090500`, was needed and is not in the edit
  list.** `APP_MODE=test` points every Supabase client at the `test` schema, so
  `runJob` looked for `job_runs` there, did not find it, and correctly refused
  to run — `Invalid schema: test`. The contract worked; the outcome was that no
  job ran at all in test mode. The test schema already distinguishes physical
  copies (per-session money data) from read-through views (shared reference
  data), and job records are the second kind: "did the backup run" is a fact
  about the deployment, not about a session. A separate migration rather than
  editing an applied one.
- **`tests/scan/checks/guards.mjs` gained `requireJobSecret` as a recognised
  guard.** The scan matched on the literal string `CRON_SECRET` to decide a
  route was guarded. Moving the routes onto per-job secrets removed that string,
  so the scan called four routes unguarded — they had become *more* guarded, not
  less. Outside the edit list, but a green test went red as a direct result of
  this change, so fixing it is part of the change.
- **`20260612023100` (from P0.2) gained `with (security_invoker = true)`** on
  both views — see the finding below. It has never been applied to production
  and D-26 will `migration repair` it there rather than execute it, so its body
  will never run against live data.
- `backup-report` does **not** accept `?secret=`. The three legacy routes get
  that affordance because they already had it; a new route should not put a
  secret somewhere that lands in proxy logs.

### Findings worth more than this prompt

**1. `supabase/schema.sql` does not record `security_invoker` on views, so every
database restored from it silently loses RLS enforcement on them.**

The migrations set `security_invoker` **79 times**. The snapshot contains the
string **zero times**. Consequence, measured on dev:

```
select count(*) from pg_class … relkind='v' … security_invoker unset  →  19 of 19
```

All nineteen views on the dev project run as their owner, so RLS on `students`,
`installments`, `payments` and `receipts` is not consulted for any of them.
Production is unaffected — the ALTERs really ran there — but dev was built by
restoring the snapshot (D-24), and the restore is now the documented way to
build a database. On a database holding real rows this would be a live
privilege hole, not a fidelity nit.

This is the same defect family as D-25 and is fixed with it in P0.8: the
generator must emit view options, and dev's nineteen views need the option set.
Until then, dev's RLS behaviour on views does not match production's.

**2. `schema:snapshot:check` exits 127 while printing the right answer.** On this
Windows machine the script prints `supabase/schema.sql is up to date.` and then
dies with `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)` from libuv at
teardown. Pre-existing — the script is untouched by School One — and not wired
into CI today, but an exit code that contradicts the output is worth fixing
while P0.8 is in that file anyway.

**3. The `test` schema is not in the snapshot either,** so a restored database
has no test schema at all until the migrations that create it are replayed —
which, per D-24, they are not. Lower stakes than (1); noted for completeness.

**4. Test-mode job routes additionally need `test` in PostgREST's exposed
schemas** (Supabase dashboard → Settings → API). The dev project does not expose
it, which is why `Invalid schema: test` persisted after the views existed. A
dashboard setting, so left for Janmejay rather than changed by an agent.

---

## P0.9 — Feature flags and the canary model

**Commits:** `feat(school-one): one id sees it, and nobody else`

### Acceptance

| Criterion | Evidence |
|---|---|
| Migration applies on dev | `20260916091000` applied; `feature_flags` holds `school_one_placeholder`, everything off |
| Precedence, unknown key, 404-vs-200 | `tests/unit/feature-flags.test.ts` — **17 tests** |
| Nav item hidden by default, shown with the key | covered in the same file, both flat and grouped nav |
| `schema:snapshot:check` passes | pending — see below |
| Existing tests green | **375 files / 3,212 tests**, exit 0 |
| Build | exit 0; `/protected/school-one` and `/protected/settings/features` both emitted as dynamic routes |

**The claim the rollout model rests on**, pinned as a test: two staff with the
*same role* and different ids, one on `enabled_user_ids` —

```
isFeatureEnabledForStaff(flag({ enabled_user_ids: [CANARY] }), { id: CANARY,   role: "admin" })  → true
isFeatureEnabledForStaff(flag({ enabled_user_ids: [CANARY] }), { id: DIRECTOR, role: "admin" })  → false
```

### Still to do — blocked on a Supabase maintenance window

The dev project went into scheduled maintenance at 21:18 GMT (stated completion
21:45) part-way through this prompt:

```
LegacyDbConfigLoginRoleStatusError: unexpected login role status 503:
{"error":"Service temporarily unavailable for scheduled maintenance"}
```

Done before it started: the migration is applied, the flag row exists, and the
five role logins plus a second admin (`QA Director`) were created on dev so the
canary pair is real rather than hypothetical.

Outstanding: setting the flag for one admin's id and reading it back for both,
and re-running `schema:snapshot`. Both are DB-only steps with no code
implication; picked up after the window.

The browser-level check — nav item visible to one login and absent for the
other — is deliberately **not** claimed here. It is release-day step (e) in
`RELEASES.md`, done against production with the two real accounts, which is
where it actually matters.

### Deviations and judgement calls

- **`getVisibleProtectedNavigation` gained a second parameter and the shell two
  props.** `src/ui/shell/sidebar-nav.tsx` is a client component that recomputes
  navigation from `staffRole`, so it cannot read a flag. Without threading the
  resolved set through `DashboardShell`, a gated item would render for
  everybody — the exact failure the model exists to prevent. Both files are
  outside the edit list; the alternative was a flag that does not work.
- **The gated page calls `requireStaffPermission` as well as `requireFeature`.**
  The scan's guard check flagged it, correctly: a feature flag is not a
  permission. They answer different questions and the page now asks both.
- **The editor redirects and flashes rather than returning action state.** Two
  repo contracts — `action-feedback-contract` and `route-loading-contract` —
  went red on the new surfaces. Both known-gap lists are documented as
  "must only ever shrink", so the fix was to satisfy the contracts
  (`PendingSubmitButton`, `FlashNotice`, two `loading.tsx` files) rather than to
  add entries.
- **No `audit_logs` write.** The prompt says to follow how `/protected/settings`
  writes `app_settings` — it does not write anything; it is a read-only hub with
  no `actions.ts`. `feature_flags.updated_by` / `updated_at` plus the absent
  DELETE policy are the trail instead.
- **Seed 04 enables the flag by looking up `full_name = 'QA Admin'`**, so it is
  a no-op until `bootstrap-test-staff.mjs` has run. Before then the flag stays
  off for everyone, which is also the correct state.

### P0.9 — live proof, after the maintenance window

The flag set for one admin's id, then evaluated for every staff member on dev:

```
full_name          role           sees_school_one
QA Admin           admin          true      ← the only id on enabled_user_ids
QA Director        admin          false     ← same role, different id
QA Accountant      accountant     false
QA Teacher         teacher        false
QA Fee Collector   fee_collector  false
QA View Only       view_only      false
```

That is the canary model, on real rows: `director@` and `raj@` are the same
role, and only the named id sees the feature.

---

## P0.6 and P0.7 — backup workflows

**Commits:** `feat(school-one): backups that leave the building, and a drill that proves them`

### Acceptance

The prompt's acceptance for both is a real workflow run, which needs runbook
section C (R2, Shared Drive, service account, `age` keys, GitHub secrets). That
is Janmejay's, so **neither workflow has been run**. What was verified instead:

| Check | Result |
|---|---|
| `bash -n` on every shell script | 3/3 ok — `dump.sh`, `upload.sh`, `restore-drill.sh` |
| `node --check` on every `.mjs` | 2/2 ok — `manifest.mjs`, `compare-invariants.mjs` |
| Workflow YAML parses; every job has `runs-on` and steps; every step has `uses` or `run` | both files ok |
| **Both jobs gated** on `SCHOOLONE_BACKUPS_ENABLED` | 1/1 in each file |
| `invariants.sql` executes against dev | all four statements run |

`actionlint` is a Go binary and `npx actionlint` cannot resolve it on this
machine; adding it as a dependency was not permitted, so YAML and job structure
were checked directly instead.

**The invariants query, run against dev:**

```
table_count        academic_sessions   1
table_count        app_settings        2
table_count        audit_logs        233
...
students_by_status active            139
receipt_count      all                 0
payments_by_session                    (no rows — dev has no payments)
```

`payments_by_session` returning nothing is correct here: dev is seeded but
nothing has been collected, so the join has nothing to group. The join itself
executes, and it is the app's own anchoring path —
`payments` to `installments.class_id` to `classes.session_label` — so a restore
that lost a whole session's payments would show up as a missing row rather than
a total that happens to still match.

One correction to the file as specified: it opened with a `\pset` psql
meta-command. Removed — `--csv --quiet` already shape the output, and without
backslash commands the file runs under anything that speaks SQL, which is how it
was checked against dev at all.

---

## P0.8 — Docs, checklists, deprecations

**Commits:** `docs(school-one): what changed, what it costs, and what is left`

| Edit | Done |
|---|---|
| `CLAUDE.md` pointer | one paragraph under the hard rules, naming the two rules that change how anyone works on this repo |
| `docs/school-one/README.md` | index updated for the four new files |
| `docs/school-one/decisions.md` | **D-29 to D-32** added |
| `docs/school-one/RELEASES.md` | the Phase 0 row plus the full release-day sequence |
| `PRODUCTION_OPERATIONS_CHECKLIST.md` | Off-platform backups section, "Which database is this?" matrix, Storage-bucket backup marked deprecated |
| `src/app/api/cron/nightly-backup/route.ts` | deprecation comment naming all three reasons it is not a backup |
| `docs/school-one/SETUP-RUNBOOK.md` | sections D and E rewritten to what is actually done |

### D-25 is deliberately left open

The prompt says to leave it open if the fix is larger than ~50 lines or touches
anything beyond section ordering. Both are true:

1. **The ordering is not in `scripts/generate-schema-snapshot.mjs`.** That file
   only calls `public.generate_schema_snapshot()` and writes the result. The
   section order lives in that function — 401 lines of PL/pgSQL — and
   `create or replace function` means restating the whole body in a migration.
2. **Ordering is not the only defect.** The same function omits view
   `reloptions`, which is why `security_invoker` is absent from the snapshot and
   why all 19 views on a restore-built database stop consulting RLS (D-29). A
   fix worth doing fixes both.

So the reordering list stays in `dev-db.mjs`, D-25 stays open, and D-29 records
the more serious half. One focused PR should do both and then delete the list.

### A third gap in the restore path, found by the final rebuild

`npm run db:reset:dev` reproduced every count exactly — 139 students, 60 School
One, 0 non-`TEST-`, 24 assignments, 11 family members, 19 classes, 4 cron jobs,
0 Notion jobs — except one:

```
flags: 0
```

`supabase/schema.sql` records structure, not rows, so **any reference row a
migration INSERTs is lost on a database built by restore**. The
`school_one_placeholder` row exists in production (the migration runs there) and
did not exist on dev. Fixed for this row by inserting it in seed 04 as well; the
general problem is the same family as D-29 and belongs in the same PR.

It fails safe — no flags means everything gated is hidden — but dev not matching
production is exactly the kind of difference that makes a dev check meaningless.

---

## Self-review (the AI review step, D-15)

Read over the complete `git diff main..HEAD`: **78 files, +9,722 / −419**.

### The rules this phase is bound by

| Rule | Result |
|---|---|
| No file under `src/modules/fees / payments / receipts / promotion` | **none touched** |
| No fee table, RPC, trigger or policy altered | **none** — the three new migrations only `create table`, and name no fee table |
| The two `/api/admin/*` routes and three `CRON_SECRET` scripts untouched (D-21) | confirmed by grep |
| No secret value committed | no key material, no connection string with a real password, `.env.local` never staged |
| No personal data | the only phone-shaped strings are `+91 00000 000NN` in the seed; the regex's other hits are migration timestamps inside scan-report prose |

### New surface, listed so it can be argued with

**Routes:** `/api/jobs/backup-report` (new), `/protected/school-one` (new),
`/protected/settings/features` (new); three existing cron routes rewrapped.

**Tables:** `job_runs`, `backup_runs`, `feature_flags` — all three RLS-enabled.
`job_runs` and `backup_runs` have a single admin SELECT policy and **no**
INSERT/UPDATE policy, so writes are service-role only and no signed-in user can
forge a run record. `feature_flags` is readable by any authenticated staff member
(flags are not secrets) and writable only with `settings:write`, with no DELETE
policy.

**Environment variables:** eight names, no values — four database-target, four
job secrets.

### What I would flag reviewing this as a colleague

1. **`revalidatePath("/protected", "layout")` on every flag save** busts the
   whole protected layout cache for everyone, not just the affected user. It is
   correct — a flag change alters navigation for whoever it names, and the
   action cannot know who is currently rendering — but it is a blunt instrument
   on a busy afternoon. Worth revisiting if flag edits ever become frequent;
   they should not.
2. **The flag editor lists every staff member's name and role**, read with the
   admin client. Appropriate for a `settings:write` holder who manages staff
   anyway, but it is the first screen that does so, and that is worth being
   deliberate about rather than incidental.
3. **A caller holding a job secret can create unlimited `job_runs` rows** by
   calling the route repeatedly. Bounded by possession of the secret and by the
   platform's own limits; not worth a rate limiter today, worth knowing.
4. **`scripts/lib/db-target-guard.mjs` calls `process.exit(1)` at import time.**
   That is the point — it must refuse before the importing script's body runs —
   but it means importing it from a test would kill the runner. Nothing does,
   and a test of that module should import the TypeScript twin instead.
5. **The `test` schema views (`20260916090500`) are unreachable on dev** because
   PostgREST does not expose the `test` schema there. The migration is still
   right; the dashboard setting is Janmejay's.
6. **D-29 is the one to act on.** Everything else here is a note; that one is a
   privilege gap on any database built the way this project now builds them.

### Nothing was found that contradicts the plan's safety rails

The three deviations from edit lists — the shell props in P0.9, the scan guard
rule in P0.4, the second migration in P0.4 — are each recorded above with the
reason, and each was required for the prompt's own acceptance to be reachable.

---

## Final state

| Prompt | Commits | Acceptance | What remains, and whose |
|---|---|---|---|
| P0.3 — write guard | `6f79162c` | **met** | — |
| P0.4 — job platform | `6f542d9f` | **met** | Janmejay: set the three `JOB_SECRET_*` in Vercel (release step f) |
| P0.9 — feature flags | `dce649c2` | **met** | Janmejay: prove it in the browser with the two real logins (release step e) |
| P0.6 — nightly backup | `29fd30e0` | **partial** — written, syntax-checked, inert | Janmejay: runbook C1–C8, then `SCHOOLONE_BACKUPS_ENABLED=true` and one manual run |
| P0.7 — restore drill | `29fd30e0` | **partial** — same | Janmejay: one manual run after the first nightly backup |
| P0.8 — docs | this commit | **met**, D-25 deliberately left open | one focused PR for D-25 + D-29 |

### Final validation, all green

```
typecheck            exit 0
lint                 exit 0 (4 pre-existing warnings, 0 errors)
test                 3,212 passed / 3,212
build                exit 0
scan --skip deps     PASS — P0 0 · P1 0
quality:budgets      passed — 493 files, 0 money-format violations
quality:architecture passed
docs:map:check       current
schema:snapshot      up to date at 20260916091000
```

Dev rebuilt from nothing with `db:reset:dev`: **223 local migrations, 223
applied, 0 pending — local = remote.**

### The three things a human has to do

1. **Release day** — `RELEASES.md` has the ordered steps. The one not to skip is
   `supabase migration repair --status applied 20260612023100 20260727113700`
   **before** `db push`, or the push refuses the whole run (D-26).
2. **Prove the canary in the browser** — release step (e). It has been proven at
   the data layer and in unit tests; the browser check against production with
   `director@` and `raj@` is the one that makes it true for the school.
3. **Runbook C1–C8, then turn the backups on** — release step (g). Until then
   both workflows sit inert and nothing fails nightly.

### The one finding worth acting on beyond Phase 0

**D-29.** `generate_schema_snapshot()` omits view options, so every database
built by restoring `supabase/schema.sql` — which is now how databases are built
(D-24) — loses `security_invoker` on all 19 views and stops consulting RLS on
`students`, `installments`, `payments` and `receipts`. Production is unaffected.
Dev is affected today. It travels with D-25 and the missing-reference-row gap in
one small PR.
