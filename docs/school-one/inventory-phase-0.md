# Phase 0 inventory (P0.0) — read-only

Produced by the kickoff session (`docs/school-one/prompts/KICKOFF.md`, Step 4) against
branch `school-one/phase-0` at `b842d03`. **Nothing was changed.** Every line number
below refers to the file as it stands at that commit.

Its purpose is to confirm — or correct — the assumptions `BUILD-PLAN.md` and
`prompts/phase-0.md` make about this repository, *before* P0.2 writes anything.
Corrections are collected in `kickoff-report.md`.

---

## 1. Paths, exports and behaviour the plan assumes

### (a) Service-role Supabase client

`src/platform/supabase/admin.ts` — one export.

| Symbol | Line |
|---|---|
| `createAdminClient()` | 7 |

```ts
 1  import "server-only";
 7  export function createAdminClient() {
 8    const serviceRoleKey = getOptionalEnvVar("SUPABASE_SERVICE_ROLE_KEY");
10    if (!serviceRoleKey) {
11      throw new Error("Missing environment variable: SUPABASE_SERVICE_ROLE_KEY");
17      getRequiredEnvVar("NEXT_PUBLIC_SUPABASE_URL"),
21        schema: getSupabaseSchemaForAppMode(),
24        autoRefreshToken: false,
25        persistSession: false,
```

Notes for P0.3/P0.4: the module is `server-only`, takes no arguments, and reads the
project URL from `NEXT_PUBLIC_SUPABASE_URL` — the same variable `getDatabaseTarget()`
will parse. There is exactly one service-role constructor in the tree.

### (b) Browser / anon client

`src/platform/supabase/client.ts` — `createClient()` (line 5), wrapping
`createBrowserClient` from `@supabase/ssr`:

```ts
 5  export function createClient() {
 8    getRequiredEnvVar("NEXT_PUBLIC_SUPABASE_URL"),
 9    getRequiredEnvVar("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
```

The cookie-bound server client is a **third** module, `src/platform/supabase/server.ts`,
exporting `async createClient(cookieStore?: CookieStore)` (line 11). It is the client
that must be used for any RPC gating on `public.has_permission(...)`.

### (c) `src/platform/env.ts`

| Symbol | Line | Behaviour |
|---|---|---|
| `getRequiredEnvVar(name)` | 43 | trims; throws on empty **and** on a placeholder value |
| `getOptionalEnvVar(name)` | 63 | trims; returns `undefined` for empty — never throws |
| `getAppMode()` | 68 | `APP_MODE` ?? `"production"`; throws on anything but `production` / `test` |
| `getSupabaseSchemaForAppMode()` | 80 | |
| `isVercelProductionEnvironment()` | 127 | `getOptionalEnvVar("VERCEL_ENV") === "production"` |
| `getRuntimeEnvironmentLabel()` | 131 | |
| `hasRequiredEnvVars` | 200 | a const, not a function |

```ts
 63  export function getOptionalEnvVar(name: string): string | undefined {
 64    const value = process.env[name]?.trim();
 65    return value ? value : undefined;
 66  }
127  export function isVercelProductionEnvironment() {
128    return getOptionalEnvVar("VERCEL_ENV") === "production";
129  }
```

`getOptionalEnvVar` takes a free-form `string`; `getRequiredEnvVar` is narrowed to
`(typeof requiredEnvVars)[number]`. P0.3's new variables must therefore be read through
`getOptionalEnvVar` unless they are added to `requiredEnvVars` — and they must not be,
because a missing `PRODUCTION_SUPABASE_PROJECT_REF` is specified to warn-and-allow, not
to throw.

### (d) `src/instrumentation.ts`

```ts
 6  export async function register() {
 7    if (process.env.NEXT_RUNTIME === "nodejs") {
 8      await import("./sentry.server.config");
11    if (process.env.NEXT_RUNTIME === "edge") {
12      await import("./sentry.edge.config");
17  export const onRequestError = Sentry.captureRequestError;
```

`register()` today loads Sentry config and nothing else — there is no existing guard, no
existing throw, and no other statement to preserve. The Node-runtime branch at line 7 is
where `assertSafeDatabaseTarget()` belongs.

Two facts worth carrying into P0.3:

- The file's own first line reads `// Goes at REPO ROOT: instrumentation.ts`. It is
  **stale** — the file lives at `src/instrumentation.ts` and there is no root copy.
- A sibling `src/instrumentation-client.ts` exists. It is the browser hook and must not
  learn about database targets.

### (e) The two cron routes

Both are `GET` handlers with a **private, duplicated** `authorize(request)` function —
not a shared helper.

| | `nightly-backup` | `auto-day-close` |
|---|---|---|
| `authorize()` | lines 70–82 | lines 38–51 |
| reads | `process.env.CRON_SECRET` (71) | `process.env.CRON_SECRET` (39) |
| accepts | `?secret=` **or** `Authorization: Bearer` | identical |
| secret unset | `misconfigured: true` → `logError` | same |
| secret wrong | `misconfigured: false` → `logWarn` | same |
| failure response | `{ ok: false, error: "Unauthorized" }`, **401** | identical |
| `maxDuration` | `export const maxDuration = 300` (line 97) | **absent, deliberately** |

```ts
// both files, modulo the route name in the log key
const provided =
  url.searchParams.get("secret") ?? request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
if (provided !== expectedSecret) {
  return { ok: false, reason: "Secret missing or does not match.", misconfigured: false };
}
```

The reason `auto-day-close` has no `maxDuration` is written down in the other file
(nightly-backup, lines 94–95): *"its work is bounded and does not grow with the roll."*
P0.4 says `maxDuration` unchanged — which means **do not add one** to `auto-day-close`.

Success responses P0.4 must reproduce byte-for-byte:

- `nightly-backup` → `{ ok, prefix, results }`, status **200 when every table succeeded,
  207 otherwise** (line 180).
- `auto-day-close` → `{ ok: true, targetDate, receiptCount, receiptTotal,
  refundProcessedTotal }` (197–203); on a query or upsert error `{ ok: false, targetDate,
  error }` with **500** (lines 90, 103, 191).

`auto-day-close` also accepts `?date=YYYY-MM-DD` for manual backfill (lines 76–79).

### (f) `scripts/bulk-apply.mjs` — the `LIVE_SESSION_LABEL` guard

| Line | Content |
|---|---|
| 73 | `const live = process.argv.includes("--live");` |
| 74 | `const allowFeeImpact = process.argv.includes("--allow-fee-impact");` |
| 78 | `const LIVE_SESSION_LABEL = "2026-27";` |
| 143–148 | the refusal: `if (sessionLabel === LIVE_SESSION_LABEL && !live)` → *"Refusing to touch the live session 2026-27 without --live."* |
| 212 | the fee-impact refusal |
| 380 | `liveSessionLabel: LIVE_SESSION_LABEL` written into the audit payload |
| 444–445 | the `⚠ Writing to the LIVE session …` banner |

The file's first import is line 1 (`@supabase/supabase-js`). P0.3 adds
`scripts/lib/db-target-guard.mjs` **above** it and changes nothing else — the session
guard above is complementary and stays exactly as written.

### (g) `scripts/lib/`

One file: `face-crop.mjs` (6,491 bytes), used by `import-student-photos.mjs`.
There is **no** existing shared guard, env loader, or Supabase helper for `.mjs`
scripts — `db-target-guard.mjs` will be the second file in the directory and cannot
reuse anything. `scripts/` itself holds 33 entries, including the sub-directories
`cloud/` and `smoke/`.

### (h) `package.json` scripts

Supabase / schema related:

| Script | Command |
|---|---|
| `schema:snapshot` | `node scripts/generate-schema-snapshot.mjs` |
| `schema:snapshot:check` | `node scripts/generate-schema-snapshot.mjs --check` |

**There are no `db:*` scripts at all.** `db:push:dev`, `db:reset:dev` and `db:seed:dev`
are entirely new in P0.2 and collide with nothing.

`"engines": { "node": ">=24.0.0 <25" }`.

Adjacent scripts P0.8's acceptance depends on: `docs:map` / `docs:map:check`
(`scripts/generate-repo-map.mjs`), `quality:budgets`, `quality:architecture`.

### (i) `supabase/config.toml`

| Key | Value |
|---|---|
| `project_id` | `"schoolfees"` (line 5) |
| `[db] port` | 54322 · `shadow_port` 54320 |
| `[db] major_version` | **17** (line 36) |
| `[db.pooler] enabled` | false |
| `[db.migrations] enabled` | true |
| `[db.seed] enabled` | true — `sql_paths = ["./seed.sql"]` (line 65) |
| `[api] port` | 54321 · `[studio]` 54323 · `[inbucket]` 54324 |

Two things follow for P0.2:

- **`[db.seed].sql_paths` points only at `./seed.sql`**, which is a two-line comment
  saying no seed data is required. The three files in `supabase/seeds/` are **not**
  applied by `supabase db reset`. `dev-db.mjs seed` must apply them itself — which is
  what the prompt already specifies, but nobody should expect `db reset` to do it.
- Linking state is not in `config.toml`; it lives in `supabase/.temp/` (gitignored):
  `project-ref` currently reads `wtgxcptmucjerhufzjcf` (dev), and `postgres-version`
  reads **`17.6.1.166`**.

### (j) `supabase/seeds/*.sql`

| File | Creates | Re-runnable |
|---|---|---|
| `01_test_session_setup.sql` (5.4 KB) | the `TEST-2026-27` session (`is_current = false`), 19 classes, `fee_settings`, the three conventional discount policies (RTE / Staff Child / 3rd Child), 4 test family groups | yes — `ON CONFLICT` / `WHERE NOT EXISTS` |
| `02_test_students_seed.sql` (73.8 KB) | ~120 students across the 19 classes, every admission number prefixed `TEST-`; covers standard, new, transport, RTE, Staff Child, 3rd Child, family groups, custom overrides, no-phone, no-DOB, combined policies | yes — `ON CONFLICT DO NOTHING` |
| `03_cleanup_existing_students.sql` (6.0 KB) | **not a seed.** A DANGER-marked deletion script: preview queries, a safe-delete block for students with no payment history, and a commented-out full wipe | n/a |
| `README.md` | documents the above and the rule "always run 01 before 02" | |

`04_school_one_dev_seed.sql` must therefore reuse 01's session and class rows, and
`dev-db.mjs seed` must apply **01 and 02 only** — running 03 unattended would delete
rows.

### (k) `.github/workflows/ci.yml`

Four jobs, all `runs-on: ubuntu-latest`, all `actions/setup-node@v4` with
**`node-version: 24`** and `cache: npm`:

| Job | Timeout | Steps |
|---|---|---|
| `verify` | 15 min | typecheck · lint · test · `quality:budgets` · `quality:architecture` · `docs:map:check` |
| `bundles` | 20 min | build (with six placeholder env vars) · `quality:bundles:check` |
| `scan` | 10 min | `npm run scan -- --skip deps` · uploads `docs/qa/scan/` as an artifact |
| `dependencies` | 15 min | `npm run scan -- --only deps`; **only** on `schedule` or `workflow_dispatch` |

Triggers: `pull_request`, `push` to `main`, `schedule: "0 2 * * *"`, `workflow_dispatch`.
Concurrency group `ci-${{ github.ref }}` with `cancel-in-progress: true`.

The other two workflows are `claude.yml` and `claude-code-review.yml`. There is **no**
existing workflow that touches a database, and **no** existing GitHub `environment` — the
`backup` environment in P0.5 will be the first.

### (l) `.env.example` — variable names

`NEXT_PUBLIC_SUPABASE_URL` · `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` ·
`NEXT_PUBLIC_SITE_URL` · `SUPABASE_SERVICE_ROLE_KEY` · `NEXT_PUBLIC_SCHOOL_NAME` ·
`NEXT_PUBLIC_APP_MODE` · `APP_MODE` · `NEXT_PUBLIC_SENTRY_DSN` · `SENTRY_AUTH_TOKEN` ·
`OPENAI_MODEL` · `SCHOOLFEES_MCP_HOST` · `SCHOOLFEES_MCP_PORT` · `SCHOOLFEES_MCP_PATH` ·
`SCHOOLFEES_MCP_ALLOWED_HOSTS` · `SCHOOLFEES_MCP_DEFAULT_SESSION` ·
`SCHOOLFEES_MCP_TOKEN` · `SCHOOLFEES_MCP_SUPABASE_SCHEMA` · `SCHOOLFEES_WORKER_MCP_URL` ·
`SCHOOLFEES_WORKER_MCP_TOKEN` · `SCHOOLFEES_DOC_TOKEN` ·
`BOOTSTRAP_MAIN_ADMIN_PASSWORD` · `BOOTSTRAP_ACCOUNTS_PASSWORD` ·
`BOOTSTRAP_STAFF_PASSWORD` · `AISENSY_API_KEY`

**Absent and worth noting:** `CRON_SECRET` and `AISENSY_WEBHOOK_SECRET` are read by
shipped code but are not documented here (a pre-existing gap, not one School One
created). `PRODUCTION_SUPABASE_PROJECT_REF`, `SUPABASE_DEV_PROJECT_REF` and
`ALLOW_PRODUCTION_DB_OUTSIDE_PRODUCTION` are the three P0.2 adds.

---

## 2. Migration naming and the README index format

**Naming.** `<14-digit timestamp>_<snake_case_name>.sql` — `YYYYMMDDHHMMSS`. The last
three files, in order:

```
20260912165421_a_second_receipt_deserves_its_own_notice.sql
20260912190000_a_notice_can_carry_its_document.sql
20260912200000_one_lane_for_a_parent_message.sql
```

218 `.sql` files in total. Names are full sentences in snake_case describing the intent,
not the mechanism (`a_second_receipt_deserves_its_own_notice`, not
`alter_receipt_notices_index`). Timestamps ending in `0000` are hand-written; the rest
come from `supabase migration new`.

**`supabase/migrations/README.md` format.** A prose header ("Append-only. Each `.sql`
file is one migration that has been applied to production…") → a numbered **Golden
rules** section (never rename an applied migration; never edit its body; create via the
CLI; update this index) → **Migration index (grouped by feature)** with `###` feature
headings and one bullet per migration:

```
- `20260421103000_align_rbac_roles_and_policies` — admin / accountant / read_only_staff roles + RLS policies.
```

Filenames appear **without** the `.sql` extension, in backticks, followed by ` — ` and a
one-sentence description. Complex migrations additionally get several paragraphs of prose
at the end of the file explaining the reasoning and any dry-run result.

---

## 3. Every place that reads `CRON_SECRET`

**The plan names two routes. There are five route handlers and three scripts.**

### Route handlers (`process.env.CRON_SECRET`)

| File | Line | In the plan? |
|---|---|---|
| `src/app/api/cron/nightly-backup/route.ts` | 71 | yes — P0.4 wraps it |
| `src/app/api/cron/auto-day-close/route.ts` | 39 | yes — P0.4 wraps it |
| `src/app/api/cron/whatsapp-scheduled-runs/route.ts` | 71 | **no** |
| `src/app/api/admin/revalidate-after-bulk/route.ts` | 32 | **no** |
| `src/app/api/admin/repair-discount-drift/route.ts` | 52 | **no** |

The three unlisted ones use the same `authorize()` shape. The two `/api/admin/*` routes
return a slightly different body (`reason: "CRON_SECRET env var not configured."`).

### Scripts

| File | Line | Use |
|---|---|---|
| `scripts/repair-discount-drift.mjs` | 287 (documented at 29) | required for `--apply`; POSTs to the route above |
| `scripts/bulk-apply-payment-corrections.mjs` | 1208 | asks the deployed app to drop its cache; warns and continues when unset (line 1239) |
| `scripts/cloud/use-env.sh` | 63 | `emit CRON_SECRET` — passes it through to a cloud shell |

### Database

`supabase/migrations/20260612023000_notion_fee_sync.sql` schedules pg_cron jobs that
`net.http_post` with a header read from Vault — but the secret is named
`VPPS_NOTION_FEE_SYNC_CRON_SECRET`, a *different* value from `CRON_SECRET`. It is the
template P0.4's README should cite for "how a pg_cron job calls a route":

```sql
310  select cron.schedule(
314    select net.http_post(
315      url := (select decrypted_secret from vault.decrypted_secrets where name = 'VPPS_SUPABASE_PROJECT_URL')
319        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'VPPS_SUPABASE_ANON_KEY'),
320        'x-vpps-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'VPPS_NOTION_FEE_SYNC_CRON_SECRET')
```

The two job names P0.2 must unschedule in dev — `notion-fee-sync-daily` and
`notion-fee-sync-daily-test` — are both defined in this file (line 303 and nearby).

### Callers outside the repo

`vercel.json` schedules only the two routes P0.4 names:

```json
{ "path": "/api/cron/nightly-backup",  "schedule": "0 18 * * *" }
{ "path": "/api/cron/auto-day-close",  "schedule": "30 18 * * *" }
```

Vercel Cron sends `Authorization: Bearer $CRON_SECRET`, which is why `allowQuery: true`
is needed only for callers that use `?secret=` — and which of the two forms each live
caller actually uses is **not determinable from the repo**. It has to be checked in the
Vercel and Supabase dashboards before `CRON_SECRET` is retired.
