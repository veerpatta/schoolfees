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
