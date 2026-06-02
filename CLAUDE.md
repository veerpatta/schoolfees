# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Read First Before Product Decisions

1. `AGENTS.md`
2. `docs/product/project-context.md`
3. `docs/product/mvp-scope.md`
4. `docs/product/school-rules.md`
5. `docs/modules/import.md`
6. `docs/product/roadmap.md`
7. `PRODUCTION_OPERATIONS_CHECKLIST.md`
8. `UAT_CHECKLIST.md`

## What This Project Is

Internal fee-management admin app for **Shri Veer Patta Senior Secondary School (VPPS)**. One school, one tenant — not a parent portal, not public self-service, not multi-school SaaS. Audience is office staff, accounts team, and school admins.

**Production status:** Live since AY 2026-27 with real student and payment data. All core workflows are operational.

## Commands

```bash
npm run dev            # Start Next.js dev server
npm run build          # Production build
npm run lint           # ESLint
npm run typecheck      # tsc --noEmit
npm run check          # lint + typecheck together
npm run test           # vitest run (all tests)
npm run test:watch     # vitest interactive watch
npm run test:coverage  # coverage report
```

Run a single test file:
```bash
npx vitest run tests/integration/payment-desk-workflow.test.ts
```

Validation sequence (from AGENTS.md): `typecheck` → `lint` → `test` → `build`.

### Operational Scripts

```bash
node scripts/bootstrap-staff.mjs          # One-time staff setup (uses service role key)
node scripts/verify-live-fee-health.mjs   # Production fee-health verification
node scripts/verify-live-sync-health.mjs  # System sync verification
node scripts/check-quality-budgets.mjs    # Quality budget checks
```

## Architecture

### Stack

Next.js 16.2.4 App Router + TypeScript 5 (strict) + React 19.2, deployed to Vercel. Supabase (Postgres + Auth + RLS) as the database, hosted in Mumbai region. UI via shadcn/ui (Radix UI + Tailwind CSS 3.4). Tests with Vitest 4.1.5. Path alias `@/*` maps to repo root.

### Source-of-Truth Rule

**Students + Fee Setup are canonical.** Dashboard, dues, pending totals, defaulters, Payment Desk projections, Transactions, and Exports all derive from those two sources without manual sync steps.

### Financial Immutability

All payment/receipt records are **append-only**. Corrections use a separate `payment_adjustments` table with an audit trail. Never rewrite `payments` or `receipts` rows directly — this constraint applies at every layer (DB, API, UI).

### RBAC

Five roles defined in `lib/auth/roles.ts`: `admin`, `accountant`, `teacher`, `fee_collector`, `view_only` (legacy aliases `read_only_staff`→`view_only` and `defaulter_followup`→`fee_collector` still resolve). Enforced in the app layer via `requireAuthenticatedStaff()` in `lib/supabase/session.ts` and by Supabase RLS. Default landing routes (`getDefaultProtectedHref()`): `admin`/`view_only` → Dashboard; `accountant` → Payment Desk; `teacher` → Students; `fee_collector` → Defaulters. Navigation item visibility is permission-driven via `lib/config/navigation.ts`.

### Module Structure

Folder structure: see `docs/maps/folder-map.md`.

All staff workspace modules live under `app/protected/`, each with a parallel three-layer structure: `app/protected/<module>/` (routes) + `components/<module>/` (UI) + `lib/<module>/` (domain/data logic).

**Core daily modules:**

| Module | Route | Purpose |
|--------|-------|---------|
| Dashboard | `/protected/dashboard` | Read-only analytics hub |
| Students | `/protected/students` | Student master + student-level exceptions |
| Fee Setup | `/protected/fee-setup` | AY policy/defaults editor |
| Payment Desk | `/protected/payments` | **Only** payment-posting surface |
| Transactions | `/protected/transactions` | Read-only finance records |
| Defaulters | `/protected/defaulters` | Daily follow-up list |
| Exports | `/protected/exports` | XLSX download center |
| Admin Tools | `/protected/admin-tools` | Rare setup/config/troubleshooting |

**Supporting modules:**

| Module | Route | Purpose |
|--------|-------|---------|
| Imports | `/protected/imports` | Staged student import workflow |
| Receipts | `/protected/receipts` | Receipt lookup and reprint |
| Reports | `/protected/reports` | Report views and student ledger |
| Ledger | `/protected/ledger` | Ledger display |
| Finance Controls | `/protected/finance-controls` | Automatic day-close view (read-only), refunds, and correction review |
| Master Data | `/protected/master-data` | School lists (sessions, classes, routes) |
| Staff Management | `/protected/staff` | Staff accounts and RBAC |
| Session Switcher | `/protected/session` | Academic session switching |
| Settings | `/protected/settings` | School Settings hub (identity + fee-policy summary + system health) |
| Setup | `/protected/setup` | Retired — redirects to Admin Tools (first-time setup removed) |
| Fee Structure | `/protected/fee-structure` | Fee structure display |

**Admin Tools sub-features:** Transfer to Next Session (year-end rollover —
copies classes/fee policy/discount policies, promotes students, carries credit;
plus ≤30-day zero-payment session delete), Refunds (posts ledger reversals),
Session Health, Activity feed, WhatsApp templates.

**Automation:** Day close runs automatically via a nightly cron
(`/api/cron/auto-day-close`); refunds processed in Finance Controls post a
`reversal` `payment_adjustment` so they move money in the projection.

### Where to Look

- Payments: `app/protected/payments`, `lib/payments`, `components/payments`
- Students: `app/protected/students`, `lib/students`, `components/students`
- Fee Setup: `app/protected/fee-setup`, `lib/setup`, `lib/fees`, `components/fees`
- Imports: `app/protected/imports`, `lib/import`, `components/imports`
- Transactions: `app/protected/transactions`, `lib/transactions`, `lib/ledger`, `lib/reports`
- Defaulters: `app/protected/defaulters`, `lib/defaulters`
- Exports: `app/protected/exports`, `lib/reports`
- Admin tools: `app/protected/admin-tools` (+ legacy redirect from `/protected/advanced`)
- Session: `lib/session` (active session, switcher, cookie, resolver)
- System sync: `lib/system-sync` (finance revalidation, office sync, health checks)
- i18n: `i18n/` (locale config), `messages/` (en / hi / hi-en dictionaries), `hooks/` (shared client hooks)
- Database: `supabase/schema.sql`, `supabase/migrations/`

### Key Domain Files

- `lib/config/fee-rules.ts` — session parsing, default schedules, core labels. This file and `docs/product/school-rules.md` are authoritative when docs conflict.
- `lib/config/navigation.ts` — workspace nav items, route metadata, role-based visibility.
- `lib/config/school.ts` — school profile, receipt prefix, product principles.
- `lib/fees/policy.ts` — canonical active fee policy resolver (server-only).
- `lib/fees/regeneration.ts` — safe dues recalculation logic.
- `lib/fees/generator.ts` — batch fetching for installment rows.
- `lib/fees/conventional-discounts.ts` + `lib/fees/conventional-discount-rules.ts` — discount policy logic.
- `lib/payments/workflow.ts` + `lib/payments/payment-desk-workflow.ts` — payment posting workflow.
- `lib/payments/allocation.ts` — payment allocation logic.
- `lib/auth/roles.ts` — role and permission type definitions.
- `lib/supabase/session.ts` — `requireAuthenticatedStaff()`, auth claims, role resolution.
- `lib/session/active.ts` — active academic session resolution.
- `lib/session/switcher.ts` — session switching with prefetching and cache handling.
- `lib/system-sync/finance-revalidation.ts` — financial sync and revalidation.
- `lib/env.ts` — env var accessors that throw on missing or placeholder values.
- `lib/db/types.ts` — generated Supabase database types.
- `supabase/schema.sql` — canonical DB schema.
- `supabase/migrations/` — ordered migration history.

### Supabase Client Pattern

Clients used by context:
- `lib/supabase/client.ts` — browser (client components)
- `lib/supabase/server.ts` — Server Components, Route Handlers, Server Actions
- `lib/supabase/middleware.ts` + `lib/supabase/proxy.ts` — middleware session refresh
- `lib/supabase/admin.ts` — service-role (server/scripts only; never expose to browser)
- `lib/supabase/session.ts` — auth claims, RBAC guards, requireAuthenticatedStaff()
- `lib/supabase/cache-safe.ts` — cache-safe query helpers

Root `proxy.ts` delegates to `lib/supabase/proxy.ts` for session refresh on every request.

`SUPABASE_SERVICE_ROLE_KEY` must never appear in `NEXT_PUBLIC_*` variables or be imported in browser code.

**RPCs that gate on `public.has_permission(...)` MUST be called via the user-JWT supabase client (`createClient()` from `lib/supabase/server.ts`), NEVER the service-role admin client.** `has_permission` requires `auth.uid() is not null`, which is null under a service-role JWT — every call would raise "You do not have permission…". Server Actions enforce RBAC upstream via `requireStaffPermission()` and the in-RPC check is defense-in-depth. Affected RPCs: `post_student_payment_with_adjustments`, `waive_late_fee`, and anything else with `public.has_permission(...)` as its first guard.

### Supabase MCP Migration Workflow — version mismatch trap

**`mcp__supabase__apply_migration` generates its own `schema_migrations.version` from the wall-clock time at apply, not from the filename.** If you write `supabase/migrations/20260528100000_foo.sql` and apply it via the MCP, the remote table records (say) `20260528151701` — a different version. The Supabase Preview action / `supabase db push --dry-run` then fails with:

```
Remote migration versions not found in local migrations directory.
```

**Required workflow when applying migrations via the MCP:**

1. Write the migration file with any sortable timestamp filename.
2. Call `mcp__supabase__apply_migration({ name, query })`.
3. Immediately call `mcp__supabase__list_migrations` and find the version that was just recorded for `name`.
4. **`git mv`** the local file so its filename version matches the recorded version (`<recorded_version>_<name>.sql`).
5. `grep` the repo for any tests / docs that hardcode the old filename and update them.

The file CONTENTS stay byte-for-byte identical — only the filename's leading timestamp changes. This keeps the Supabase Preview check, the rollout doc, and the `supabase/migrations/` ordering all consistent with what's actually live in Postgres. PR #41 (commit `bfb5fee`) shows the pattern.

Alternative: avoid the MCP for new migrations and use `supabase db push` from the CLI instead, which honors the filename version. The MCP is fine for applying urgent hotfixes when CLI access isn't handy, as long as the rename step is done in the same session.

### Fee Engine (Workbook Mode)

The fee calculation engine is `workbook_v1`. Core lib files in `lib/fees/` and `lib/workbook/`. Key DB objects:
- `v_workbook_student_financials` — per-student financial projection (materialized view)
- `v_workbook_installment_balances` — installment-level balances (materialized view)
- `v_student_financial_state` — pending vs credit/refund projection
- `preview_workbook_payment_allocation` — date-aware preview RPC
- `post_student_payment` — posting RPC with idempotency/locking and receipt linkage

### Academic Session Labels

Format: `2026-27`. Test prefixes accepted: `TEST-2026-27`, `UAT-2026-27`, `DEMO-2026-27`. Parsing is handled by `parseAcademicSessionLabel()` in `lib/config/fee-rules.ts`. `2026-27` is the live production session. Use `TEST-2026-27` for all ongoing testing and debugging. Multi-session switching is supported via `lib/session/`.

### Student Import

Staged workflow: upload → column mapping → dry-run validation → row-by-row review → commit valid rows only. Every `import_rows` record must carry a `batch_id`. Batch and row traceability must be preserved. Conventional discount assignments should not be silently applied from import data — use the explicit assignment workflow.

API routes: `/api/imports/students/upload`, `/api/imports/students/batch/[batchId]/summary`, `/api/imports/students/batch/[batchId]/commit`.

### API Routes

Routes are embedded in their respective modules (not centralized under `/api/`):

| Route | Purpose |
|-------|---------|
| `/api/imports/students/upload` | Student import file upload |
| `/api/imports/students/batch/[batchId]/summary` | Import batch preview |
| `/api/imports/students/batch/[batchId]/commit` | Finalize import |
| `/api/manifest` | PWA manifest (role-aware runtime caching) |
| `/auth/confirm` | Email confirmation callback |
| `/protected/students/index` | Student search/index |
| `/protected/payments/student-summary` | Payment summary lookup |
| `/protected/payments/preview` | Payment allocation preview (RPC wrapper) |
| `/protected/transactions/data` | Transaction data fetch |
| `/protected/transactions/export` | Transaction export |
| `/protected/receipts/search` | Receipt lookup |
| `/protected/exports/[exportType]` | Dynamic XLSX export |
| `/protected/finance-controls/export` | Finance report export |
| `/protected/reports/export` | General report export |
| `/protected/imports/template` | Excel template download |

## Test Structure

```
tests/unit/        # 29 files — pure/domain logic, no DB
tests/integration/ # 50 files — module/workflow/system tests
tests/ui/          # 22 files — route/component/resilience/UI policy tests
tests/setup.ts     # Global afterEach: clears and restores mocks
```

Coverage is collected for `lib/**/*.ts` and `app/protected/**/*.ts`. Coverage provider: v8.

## Environment Variables

Copy `.env.example` to `.env.local` for local development. Required values:

| Variable | Notes |
|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase anon/publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server/scripts only — never in browser |
| `NEXT_PUBLIC_SITE_URL` | Production domain; `http://localhost:3000` for local |
| `NEXT_PUBLIC_SCHOOL_NAME` | `Shri Veer Patta Senior Secondary School` |
| `NEXT_PUBLIC_APP_MODE` | `internal-admin` |

## Hard Safety Rules

1. Never directly edit or delete posted `payments` or `receipts` rows — use `payment_adjustments` with audit trail for corrections.
2. Never expose `SUPABASE_SERVICE_ROLE_KEY` in browser code or `NEXT_PUBLIC_*` variables.
3. Keep public signup disabled after the bootstrap phase.
4. The `/protected` root redirect must never loop back to itself.
5. No alternate payment-posting paths outside Payment Desk (`/protected/payments`).
6. `2026-27` is the live production session with real school financial records.
   Use `TEST-2026-27` for all testing and debugging. Never add test data,
   post test payments, or make experimental changes to the `2026-27` session.
7. Fee Setup publish must preview impact first and protect paid/partial/adjusted rows from silent rewrite.

## Testing and Debugging Rules

- Never modify the live `2026-27` session for testing.
- Use `TEST-2026-27` for all ongoing testing.
- Test student admission numbers must use the `TEST-` prefix.
- Never post test payments against real students.

## Active AY 2026-27 Policy Defaults

Canonical values (from `docs/product/school-rules.md` and `lib/config/fee-rules.ts`):
- Late fee: ₹1,000 flat
- Installment due dates: 20-04-2026, 20-07-2026, 20-10-2026, 20-01-2027
- New student academic fee: ₹1,100 | Existing: ₹500
- Class 12 Science annual tuition default: ₹38,000
- Receipt prefix: `SVP`
- Payment modes: Cash, UPI, Bank transfer, Cheque
- Reference number is **optional for all payment modes** (the Payment Desk no longer collects it). `post_student_payment_with_adjustments` does not require a reference for UPI/bank transfer/cheque — see migration `20260602042112_drop_payment_reference_requirement.sql`.
- Books excluded from workbook fee calculation by default

### Conventional Discount Policies

- RTE → tuition = ₹0
- Staff Child → tuition = 50%
- 3rd Child Policy → tuition = ₹6,000
- Rules: tuition-only impact; max 2 active policies per student per year; lowest candidate tuition wins; year-scoped and auditable; manual override remains separate.

## Documentation Map

```
docs/product/       # Project context, MVP scope, school rules, roadmap
docs/modules/       # Per-module guides (import, payment-desk, exports, etc.)
docs/maps/          # Folder map, database map, module map, legacy routes, danger zones
docs/workflows/     # Operational workflow docs (test data, production ops)
docs/design/        # Design system notes
docs/i18n/          # Translation/dictionary status
docs/samples/       # Sample data files (e.g. import test CSV)
```

Finished one-time plans, specs, go-live runbooks, and audit/UAT reports are
intentionally not kept in the tree — they live in git history.
