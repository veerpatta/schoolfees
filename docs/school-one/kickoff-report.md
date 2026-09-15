# School One — kickoff session report

Session run per `docs/school-one/prompts/KICKOFF.md` on **15 September 2026**.
Scope: verify the environment is safe, confirm the CLI target, produce the P0.0 inventory,
stop. **No feature, migration, or refactor was implemented. No SQL was executed against
any remote project. No `.env*` file was read aloud, changed, or committed.**

Files added by this session, and nothing else:

- `docs/school-one/inventory-phase-0.md`
- `docs/school-one/kickoff-report.md`

---

## Step 1 — Branch and tree

| | |
|---|---|
| Branch | `school-one/phase-0` (not `main`) ✅ |
| Working tree at start | clean ✅ |
| `HEAD` | `b842d030 docs(school-one): add build plan, addendum, runbook, decisions, phase 0 prompts` |
| Parent | `3a3ee8ac docs(map): count the tests this week added` (tip of `main`) |

The branch already existed with one docs-only commit. Nothing outside `docs/school-one/`
differs from `main`.

## Step 2 — Environment safety

**Result: safe. No stop condition triggered.**

| Check | Result |
|---|---|
| Files containing the production ref | `.env.local` — **only** |
| Lines in those files that are not exactly `PRODUCTION_SUPABASE_PROJECT_REF=vgqyilgstjvgohrsiwkb` | none |
| `PRODUCTION_SUPABASE_PROJECT_REF` in `.env.local` | present |
| `SUPABASE_DEV_PROJECT_REF` in `.env.local` | present |
| `supabase/.temp/project-ref` | `wtgxcptmucjerhufzjcf` — the **dev** project |

The one occurrence of the production ref is the guard's own reference value, which is
what runbook step B4 asks for. The application's Supabase URL in `.env.local` resolves to
the dev ref, not production. No secret value was printed at any point.

| Tool | Version | Verdict |
|---|---|---|
| Node | v24.19.0 | ✅ 24.x as required |
| npm | 11.17.0 | |
| Supabase CLI | 2.109.1 | ✅ |
| Docker | **not available** — `docker ps` fails | ⚠️ see Step 5 |

## Step 3 — CLI link

The CLI was **already linked to the dev project**, so no `supabase link` was run and no
database password was requested, typed, or read from a file.

```
supabase/.temp/project-ref      → wtgxcptmucjerhufzjcf
supabase/.temp/postgres-version → 17.6.1.166
```

`npx supabase migration list --linked` connected on cached credentials and returned:

| | Count |
|---|---|
| Local migration files | **218** |
| Applied on the dev project (remote) | **0** |

Every row came back with an empty `remote` field — the dev project is empty, exactly as
the kickoff expects. **Nothing was pushed.**

One cosmetic note: this CLI version prints the list as JSON rather than the table the
prompt describes, and warns `Skipping migration README.md...` for the index file. Both
are normal.

## Step 4 — Inventory

`docs/school-one/inventory-phase-0.md` written, with all three of P0.0's sections and
every sub-item (a)–(l) answered from source, quoting line numbers. Nothing was marked
"not found".

## Step 5 — Local stack smoke

**Not run — Docker is unavailable on this machine.** Diagnostic only, so the session
continued as instructed.

This has a consequence beyond today: `npx supabase start`, `supabase db reset --linked`,
and `supabase db dump` all need Docker. Two of those are in P0.2's acceptance criteria,
and `CLAUDE.md` already records that `supabase db dump` without Docker **truncates its
target file to zero bytes** — it destroyed `supabase/schema.sql` once. Until Docker Desktop
is installed and running here, P0.2 can only be exercised against the remote dev project,
not the local stack.

## Step 6 — Baseline validation

| Step | Result |
|---|---|
| `npm run typecheck` | ✅ clean, exit 0 |
| `npm run lint` | ✅ exit 0 — 4 pre-existing warnings, 0 errors |
| `npm run test` | ⚠️ **1 failed, 3,164 passed** (371 files, 3,165 tests, 418 s) |
| `npm run docs:map:check` | ✅ "Repo map is current" — the two new docs files do not affect it |
| `npm run build` | not run (Step 6 does not require it; CI's `bundles` job covers it) |

The four lint warnings are `jsx-a11y/alt-text` ×3 in `src/platform/pdf/document-kit.tsx`
and one `import/no-anonymous-default-export` in `workers/schoolfees-mcp/oauth-entry.mjs`.
Pre-existing, not errors.

### The one failing test is a flake, not a red test

```
tests/integration/transactions-page-resilience.test.ts
  × renders for a valid selected session — Test timed out in 5000ms
```

Re-run in isolation it **passes in 2.63 s**. It only exceeds the 5 s per-test timeout
under full-suite parallel load on this machine. It was not touched by this branch (which
is docs-only), so it is pre-existing, and per the kickoff it was recorded rather than
fixed.

Worth a decision later, not today: a test whose pass depends on machine load will fail CI
intermittently. Raising that one test's timeout would be a one-line change.

---

## Corrections the plan needs before P0.2 runs

Ordered by how much damage the uncorrected version would do.

### 1. `dev-db.mjs seed` must **not** apply `supabase/seeds/*.sql` as a glob

P0.2 item 2 says seed "applies `supabase/seeds/*.sql` in order". The third file,
`03_cleanup_existing_students.sql`, is **not a seed** — it is a DANGER-marked deletion
script containing `DELETE` statements and a commented-out full wipe. Globbing the
directory would run it immediately after seeding.

**Correction:** seed applies `01`, `02`, then the new `04` — by explicit list, never a
glob. `03` is excluded by name, and the prompt should say so.

### 2. Five files read `CRON_SECRET`, not two

P0.4's edit list covers `/api/cron/nightly-backup` and `/api/cron/auto-day-close`. Also
reading it today:

- `src/app/api/cron/whatsapp-scheduled-runs/route.ts:71`
- `src/app/api/admin/revalidate-after-bulk/route.ts:32`
- `src/app/api/admin/repair-discount-drift/route.ts:52`

plus `scripts/repair-discount-drift.mjs:287`,
`scripts/bulk-apply-payment-corrections.mjs:1208` and `scripts/cloud/use-env.sh:63`.

This matters because BUILD-PLAN §7 says "`CRON_SECRET` is retired after Phase 0". Retiring
it after wrapping only two routes would break the WhatsApp scheduled runner and both admin
maintenance routes — silently, since they would simply start returning 401.

**Decision needed (Janmejay):** either P0.4's edit list grows to all five routes, or
BUILD-PLAN §7 changes to "`CRON_SECRET` survives Phase 0 and is retired when the last
reader moves". Either is fine; the current pair is not.

### 3. The restore drill's Postgres tag is unverified

P0.7 pins the service container to production's Postgres version and states it as
`17.6.1.121`. The **dev** project reports `17.6.1.166`. Production's actual version was
not checked — doing so means connecting to production, which this session will not do.

**Action:** Janmejay reads the production version from the Supabase dashboard and writes
it into `decisions.md` before P0.7 is written. The fallback path in the prompt (nearest
`17.x`, noted in the manifest) stays as specified.

### 4. `auto-day-close` deliberately has no `maxDuration`

P0.4 says "`maxDuration` unchanged". For `nightly-backup` that means keeping
`export const maxDuration = 300`. For `auto-day-close` it means **not adding one** — its
absence is a documented decision, explained in nightly-backup's own comment at lines
94–95. Easy to "fix" by accident while wrapping both routes in `runJob()`.

### 5. `supabase db reset` does not seed

`[db.seed].sql_paths` in `config.toml` is `["./seed.sql"]`, and that file is a two-line
comment. Nothing in `supabase/seeds/` is applied automatically by a reset. P0.2's
acceptance ("`npm run db:seed:dev` is idempotent") is unaffected, but anyone expecting
`db:reset:dev` to leave seeded data behind will be surprised. Worth one sentence in
`dev-environment.md`.

### 6. Smaller confirmations (no action, just recorded)

- `scripts/lib/` contains only `face-crop.mjs` — `db-target-guard.mjs` has no prior art to
  follow and no shared env loader to reuse.
- There are **no** `db:*` npm scripts today; P0.2's three names are free.
- `schema:snapshot:check` exists as its own npm script. `npm run schema:snapshot -- --check`
  (as the addendum writes it) also works — both reach the same `--check` flag.
- `src/instrumentation.ts` is the only instrumentation entry point; its own first-line
  comment claiming it "goes at REPO ROOT" is stale. P0.3's edit list has the right path.
- There is no existing GitHub `environment` in this repo. P0.5's `backup` environment will
  be the first, so the required-reviewer setting has no precedent to copy.
- `zod@^4.4.3` is already a dependency — P0.4 needs no new package.
- `STAFF_PROFILE_REVALIDATE_SECONDS = 60` at `src/platform/supabase/session.ts:54` is the
  caching pattern P0.9 is told to copy; it exists and is exported.
- `getVisibleProtectedNavigation(staffRole)` is at `src/platform/config/navigation.ts:328`
  and currently takes only a role — P0.9's `featureFlag` filtering will need the staff id
  too, since flags can be enabled per user. Its one internal caller is line 392.
- `settings:write` and `staff:manage` both exist in `src/platform/auth/roles.ts` (lines 46,
  47) — the two permissions P0.4 and P0.9 gate on.
- `private.prevent_append_only_mutation()` exists and is used as recently as
  `20260817113000_bulk_payment_corrections.sql`.

### 7. Root `CLAUDE.md` drift noticed in passing (out of this session's edit list)

Neither affects the plan; both would mislead the next agent.

- Line 520 claims `npm run test` runs **333 files / 2,250 tests**. Today it runs **371
  files / 3,165 tests**.
- Line 356 says "Root `proxy.ts` delegates to `src/platform/supabase/proxy.ts`". The
  delegation is real, but the file is `src/proxy.ts`; there is no root `proxy.ts`.

---

## What was *not* done, and why

| | |
|---|---|
| `supabase db push` to dev | out of scope — that is P0.2 |
| Any write to production | forbidden, and never attempted |
| Local stack smoke | Docker unavailable |
| Fixing the flaky test | kickoff says record, do not fix |
| Fixing the `CLAUDE.md` drift above | outside this session's edit list |
| `npm run build` | not required by Step 6 |

## Ready for P0.2 when

1. Janmejay decides item 2 above (scope of the `CRON_SECRET` retirement).
2. Docker Desktop is installed here, **or** we accept that P0.2 is verified against the
   remote dev project only and say so in its acceptance note.
3. Item 1 (the seed glob) is corrected in `prompts/phase-0.md`.

Items 3–6 do not block P0.2; item 3 blocks P0.7.
