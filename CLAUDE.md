# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Read First Before Product Decisions

1. `AGENTS.md`
2. `docs/product/project-context.md`
3. `docs/product/mvp-scope.md`
4. `docs/product/school-rules.md`
5. `docs/modules/import.md`
6. `docs/modules/dashboard.md`
7. `docs/modules/students.md`
8. `docs/product/roadmap.md`
9. `PRODUCTION_OPERATIONS_CHECKLIST.md`
10. `UAT_CHECKLIST.md`

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

npm run quality:budgets       # source line budgets + the money-formatting audit
npm run quality:bundles:check # route JS against quality/route-bundle-baseline.json
npm run smoke:readiness       # Playwright: authenticated a11y + visual smoke
```

**`quality:budgets` fails on raw money formatting.** `toLocaleString('en-IN')`,
`Intl.NumberFormat('en-IN')` and hand-written `₹`/`Rs.` outside `lib/helpers/currency.ts`
are CI errors; a deliberate exception needs an `@allow-raw-money-format` comment with a
reason. Bundle ceilings are **ratcheted down, never raised** to accommodate growth.

Run a single test file:
```bash
npx vitest run tests/integration/payment-desk-workflow.test.ts
```

Validation sequence (from AGENTS.md): `typecheck` → `lint` → `test` → `build`.

### Operational Scripts

```bash
node scripts/bootstrap-staff.mjs          # One-time staff setup (uses service role key)
node scripts/verify-live-fee-health.mjs   # Production fee-health verification
node scripts/verify-late-fee-health.mjs   # Late-fee invariants (both engines, waivers, grandfathering)
node scripts/verify-live-sync-health.mjs  # System sync verification
node scripts/check-quality-budgets.mjs    # Quality budget checks
node scripts/verify-workbook-parity.mjs   # Workbook engine parity
node scripts/verify-required-sessions.mjs # Required academic sessions exist
node scripts/audit-test-data-in-public.mjs # TEST- data leaking into live (read-only)
node scripts/prev-year-dues-dry-run.mjs   # Carry-forward matching, no writes

# Students whose ledger disagrees with their resolved fee policy. Read-only by
# default; `--apply` re-runs the real fee engine via
# /api/admin/repair-discount-drift (needs CRON_SECRET).
node scripts/repair-discount-drift.mjs --session 2026-27
node scripts/repair-discount-drift.mjs --session 2026-27 --apply --only-decreases
```

`--only-decreases` exists because the two drift directions are different
decisions. A negative drift is a discount that never landed — safe to repair.
A positive drift RAISES what a family owes, so it is never applied in bulk.

```bash
# The general bulk-change harness. Dry run by default; --apply is opt-in;
# --session 2026-27 is refused without --live; fee-moving operations need
# --allow-fee-impact. Every write lands an audit_logs row with a reason.
node scripts/bulk-apply.mjs --plan <file.json> --session TEST-2026-27
node scripts/bulk-apply.mjs --plan <file.json> --session TEST-2026-27 --apply
node scripts/bulk-apply.mjs --help   # lists the operations and their writable columns
```

**Bulk data work has a documented path: `docs/workflows/agent-bulk-operations.md`.**
Prefer an existing screen (`/protected/students/bulk-update`, `/protected/payments/bulk`,
`/protected/imports`) — they already carry RBAC, session scoping, server-side diff
recomputation, chunking, idempotency and cache invalidation. Reach for the harness only
when no screen covers the change.

### Headless callers must pass `useAdmin`

Anything that runs the fee engine outside a staff request — a cron, a script,
an admin route — has no session, so the cookie-based Supabase client returns
NOTHING under RLS. `getFeeSetupPageData({ useAdmin: true })` threads that flag
down to fee settings, master data, conventional discount policies and student
assignments. Miss it and the generator silently skips every student with
`CLASS_FEE_MISSING`, or resolves every RTE / Staff Child / 3rd Child student to
no discount at all. It fails quiet, not loud.

## Architecture

### Stack

Next.js 16.2.12 App Router + TypeScript 5 (strict) + React 19.2.8, deployed to Vercel in the Mumbai region (`bom1`). Supabase (Postgres + Auth + RLS) as the database, also Mumbai. UI via shadcn/ui (Radix UI + Tailwind CSS 3.4). i18n via next-intl 4 (en / hi / hi-en). Errors via Sentry. Tests with Vitest 4.1.10. Path alias `@/*` maps to repo root.

### Source-of-Truth Rule

**Students + Fee Setup are canonical.** Dashboard, dues, pending totals, defaulters, Payment Desk projections, Transactions, and Exports all derive from those two sources without manual sync steps.

### Financial Immutability

All payment/receipt records are **append-only**. Corrections use a separate `payment_adjustments` table with an audit trail. Never rewrite `payments` or `receipts` rows directly — this constraint applies at every layer (DB, API, UI). A reversed receipt stays visible and marked, and is excluded from every collection figure; it is never deleted or silently subtracted.

**Correcting a wrong fee entry** is reverse + repost, never an edit. Three reversal paths, all
writing the same compensating `payment_adjustments` rows: `undo_recent_payment` (10 minutes,
`payments:adjust`), `reverse_receipt_admin` (**any age**, admin-only `payments:reverse_any`,
mandatory reason), and `process_refund_with_adjustment` (real money handed back). In bulk,
`scripts/bulk-apply.mjs --plan … ` in `payment-correction` mode — CLI only, never a UI. Dues
recompute themselves because `pending_amount` is derived, not stored; the caches do not, so
every path must bust `session:{label}` and drain the matview.

One narrowing to the append-only rule: `receipts` uses
`private.protect_receipt_money_columns()` rather than the shared guard. Every money column
still raises; `reference_number`, `notes` and `received_by` may be updated in place because
they carry no money. `payments`, `payment_adjustments` and `audit_logs` are unchanged.

### A late fee is not a fee

Since `20260812120000` the two kinds of money have their own columns everywhere:

| Column | Means |
|--------|-------|
| `pending_amount` | **Fees only.** Never contains a late fee. Decides overdue and defaulter status. |
| `late_fee_pending` | The late fee still owed, after waivers and after any payment against it. |
| `total_pending` | The two added. What a cashier can actually collect. |

`balance_status` reads `paid` once fees are clear, whatever the late fee is doing;
`late_fee_status` (`none | pending | waived | paid`) carries that separately. A family
whose only debt is a late fee is **not** a defaulter.

Three things follow, and getting one wrong is a money bug:

- **The posting RPCs and the desk preview allocate against `total_pending`.** Fees-only
  would refuse to let a cashier take a late fee the ledger is still asking for.
- **The repayment-plan functions want `pending_amount`.** They used to subtract the late
  fee by hand; doing that now subtracts it twice.
- **`waive_late_fee` caps on `late_fee_pending`.** Never re-derive it as
  `least(final_late_fee, pending_amount)` — that expression reads 0 for exactly the
  families who still have a waivable late fee.

Verify with `node scripts/verify-late-fee-health.mjs --session <label>` (8 invariants).

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
| Settings | `/protected/settings` | School Settings hub (identity + fee-policy summary + system health) |
| Setup | `/protected/setup` | Retired — redirects to Admin Tools (first-time setup removed) |
| Fee Structure | `/protected/fee-structure` | Fee structure display |
| Password | `/protected/password` | Change own password |
| Access denied | `/protected/access-denied` | Where a failed permission guard lands |

There is no page at `/protected/session` — only `app/protected/session/actions.ts`.
Session switching happens through the pill in the workspace shell.
`/protected/collections` and `/protected/dues` are redirect aliases; see
`docs/maps/legacy-routes.md`.

**Admin Tools sub-features:** Transfer to Next Session (year-end rollover —
copies classes/fee policy/discount policies, promotes students, carries credit;
plus ≤30-day zero-payment session delete), Refunds (posts ledger reversals),
Session Health, Activity feed, WhatsApp templates.

**Automation:** Day close runs automatically via a nightly cron
(`/api/cron/auto-day-close`); refunds processed in Finance Controls post a
`reversal` `payment_adjustment` so they move money in the projection.

### Where to Look

- Dashboard: `app/protected/dashboard`, `lib/dashboard`, `components/dashboard`
- Payments: `app/protected/payments`, `lib/payments`, `components/payments`
- Students: `app/protected/students`, `lib/students`, `components/students`
- Fee Setup: `app/protected/fee-setup`, `lib/setup`, `lib/fees`, `components/fees`
- Imports: `app/protected/imports`, `lib/import`, `components/imports`
- Transactions: `app/protected/transactions`, `lib/transactions`, `lib/ledger`, `lib/reports`
- Defaulters: `app/protected/defaulters`, `lib/defaulters`
- Exports: `app/protected/exports`, `lib/reports`
- Admin tools: `app/protected/admin-tools` (+ legacy redirect from `/protected/advanced`)
- Session: `lib/session` (active session, switcher, cookie, resolver)
- EMI plans: `lib/repayment-plans`, `components/students/student-repayment-plan-card.tsx`
- Segments: `lib/segments` (deliberately outside `lib/students`, which is `server-only`)
- Money vocabulary: `lib/money/glossary.ts`, `lib/helpers/currency.ts`, `components/ui/money*.tsx`
- Previous-year dues: `lib/prev-year-dues`, `app/protected/admin-tools/prev-year-dues`
- Left students who still owe: `lib/recovery` (read model; the non-active complement to `lib/defaulters`)
- System sync: `lib/system-sync` (finance revalidation, office sync, health checks)
- MCP server: `workers/schoolfees-mcp` (read-only Cloudflare Worker; `src/scope.mjs` is the
  student-scope rule, `src/permissions.mjs` mirrors `lib/auth/roles.ts`). See
  `docs/modules/mcp-server.md`.
- i18n: `i18n/` (locale config), `messages/` (en / hi / hi-en dictionaries), `hooks/` (shared client hooks)
- Database: `supabase/schema.sql`, `supabase/migrations/`

### Key Domain Files

- `lib/config/fee-rules.ts` — session parsing, default schedules, core labels. This file and `docs/product/school-rules.md` are authoritative when docs conflict.
- `lib/config/navigation.ts` — workspace nav items, route metadata, role-based visibility.
- `lib/config/school.ts` — school profile, receipt prefix, product principles.
- `lib/fees/policy.ts` — canonical active fee policy resolver (server-only).
- `lib/fees/regeneration.ts` — safe dues recalculation logic.
- `lib/fees/generator.ts` — batch fetching for installment rows.
- `lib/dashboard/analytics.ts` — the dashboard boards, the analytics fetch and its cache contract.
- `lib/money/glossary.ts` — one canonical definition per money label. **Update this first; the code follows it.**
- `lib/segments/student-segments.ts` — the 24 filter chips and the columns behind them.
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
- `supabase/schema.sql` — readable snapshot of the schema, **not** the source of truth and
  currently stale: it was last regenerated on 2026-08-09, before the late-fee split and the
  dashboard analytics work. Its own header lists the objects that have moved since.
  `supabase/migrations/` is authoritative.
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

### Applying migrations

**Use the CLI.** It authenticates from `supabase/.temp/project-ref`, honours the filename's
timestamp, and runs the migration in a transaction:

```bash
npx supabase db push --linked --yes
npx supabase migration list --linked      # confirm local and remote agree
```

Wrap anything risky in explicit `begin; … commit;` so a failure rolls the whole thing back —
that is what made it safe to drop and rebuild the financial view stack with `CASCADE`.

Two traps:

- **`npx supabase db dump` needs Docker, and without it truncates its target file to zero
  bytes.** It destroyed `supabase/schema.sql` once; `git checkout --` restored it. Do not
  point it at a tracked file on a machine without Docker.
- **`mcp__supabase__apply_migration` stamps its own `schema_migrations.version` from the
  wall clock, not the filename**, so the Supabase Preview check then fails with *"Remote
  migration versions not found in local migrations directory."* If you must use it (urgent
  hotfix, no CLI to hand), immediately call `list_migrations` and `git mv` the local file so
  its leading timestamp matches what Postgres recorded. Contents stay byte-identical.

Read-only catalog inspection through the MCP is fine, and it honours
`begin; … rollback;` — which makes it a good way to dry-run a migration before pushing it.

`supabase/.temp/` is gitignored CLI scratch, so `--linked` fails on a fresh clone until you
re-link: `npx supabase link --project-ref vgqyilgstjvgohrsiwkb`. After adding a migration,
update the index in `supabase/migrations/README.md`. The full agent procedure — migrations,
bulk data, and what is never scriptable — is `docs/workflows/agent-bulk-operations.md`.

### Fee Engine (Workbook Mode)

The fee calculation engine is `workbook_v1`. Core lib files in `lib/fees/` and `lib/workbook/`. Key DB objects:
- `v_workbook_student_financials` — per-student financial projection (materialized view)
- `v_workbook_installment_balances` — installment-level balances (materialized view)
- `v_student_financial_state` — pending vs credit/refund projection
- `preview_workbook_payment_allocation` — the Payment Desk's read model
- `post_student_payment_with_adjustments` — **the posting RPC the desk uses**, with
  idempotency, per-student advisory locking, receipt linkage and counter-side discount /
  late-fee waiver. `post_student_payment` is the older, narrower one.
- `get_dashboard_summary`, `get_dashboard_fee_split`, `get_dashboard_analytics` — the three
  reads behind the dashboard
- `private.workbook_installment_snapshot` — the second engine

**The late-fee rule is duplicated verbatim in `v_workbook_installment_balances` and
`private.workbook_installment_snapshot`, and the two must be edited together.** Both carry
the same `>>> SHARED LATE FEE RULE <<<` marker. `20260812001114` string-patched only the
function, and EMI late fees were visible to the Payment Desk and invisible to the dashboard,
defaulters and every export for four days.

### Dashboard

Five boards behind a switcher, chosen by `?view=overview|collection|recovery|classes|latefee`,
under a money band that stays put. See `docs/modules/dashboard.md`. Three rules:

- Boards are **links, not client tab state** — a board must stay linkable and back-navigable.
- **No charting library.** `/protected/dashboard` sits under a gzip ceiling in
  `quality/route-bundle-baseline.json`; every chart is hand-rolled SVG on `--chart-1…5`.
- `get_dashboard_summary` and `get_dashboard_analytics` are cached on the
  `session:{label}` tag that `revalidateSessionFinance` already busts after every posting.
  **Anything that moves money must bust that tag** — refunds did not, and served stale
  numbers until the next posting happened to clear it.

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
| `/api/imports/payments/upload` + `/batch/[batchId]/{summary,commit}` | Bulk payment upload |
| `/api/cron/auto-day-close` | Nightly automatic day close (`CRON_SECRET`) |
| `/api/cron/nightly-backup` | Nightly backup (`CRON_SECRET`) |
| `/api/admin/repair-discount-drift` | Re-runs the fee engine for drifted students |
| `/api/command/students`, `/api/command/receipts` | Command-palette lookups |
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
| `/protected/payments/bulk/template` | Bulk payment template |
| `/protected/receipts/[receiptId]/detail` | Receipt detail fetch |
| `/protected/defaulters/{contact-log,fee-breakdown,voice-note}` | Follow-up logging |
| `/protected/students/{photo,index}` | Photo upload, student search |
| `/protected/students/[studentId]/fee-pdf` · `/family/[familyGroupId]/{fee-pdf,statement}` | Parent documents |
| `/r/[code]` | Public receipt verification |

## Test Structure

```
tests/unit/            # pure/domain logic, no DB
tests/integration/     # module/workflow/system tests
tests/ui/              # route/component/resilience/UI policy tests
tests/deep/            # Playwright + Node — the permutation harness and the
                       #   live MCP conformance suite. See docs/qa/deep-test/README.md
tests/smoke-readiness/ # Playwright — authenticated a11y + visual smoke
tests/smoke-2026-05/   # Playwright — the older crawl, superseded by tests/deep
tests/setup.ts         # Global afterEach: clears and restores mocks
```

**`npm run scan` is the source-level half, and it is the cheapest signal here.**
No database, no build, no browser — 11 deterministic checks over every module,
migration, locale file, route handler and server action, in about two minutes.
It answers the questions a browser sweep structurally cannot: a route handler
nobody guarded, a money split that loses a rupee, a TypeScript rule that has
drifted away from its own SQL copy, a secret that would reach the browser
bundle. Two optional layers sit behind flags — `--layers ai` (subsystem
reviewers, then three adversarial refuters per claim) and `--layers fuzz` (51
malformed payloads at each route handler, against a running server). All three
stream into one report, gated by the same severity table as `tests/deep`. See
`tests/scan/README.md`.

```bash
npm run scan           # static, ~2 min
npm run scan:fast      # same, minus the npm-audit check
npm run scan:baseline  # after a deliberate change to P2 volume
```

**`tests/deep` is the harness a new bug should surface in first.** One command
(`npm run deep`) sweeps every route, every switcher value, every export, the
5 × 29 role/route matrix, three viewports, 25 malformed inputs and all 32 MCP
tools across both sessions — then applies a gate that actually fails. Two rules
make it trustworthy rather than just large:

- **Coverage is a claim it has to earn.** Every dimension declares a strategy in
  `tests/deep/surface/`, domains are imported or globbed from source, and
  `assertNoSilentGaps()` fails the run when a dimension declared exhaustive left
  a value unvisited. The report opens with what was *not* tested.
- **Redirects and `notFound()` in this app stream.** Next answers 200 with the
  shell and the browser moves during hydration, after `networkidle` — so
  anything asserting on a status code or a once-sampled `page.url()` reports
  working guards as broken. The harness waits for the destination instead. That
  mistake produced 41 false P0s before it was found; do not reintroduce it.

`npm run test` runs **333 vitest files / 2,250 tests** across two projects: `node` for
everything, and `interaction` (jsdom + Testing Library) for `tests/ui/interaction/**`.
Playwright is separate — `npm run smoke:readiness`.

Coverage is collected for `lib/**/*.ts` and `app/protected/**/*.ts`. Coverage provider: v8.

**Many tests assert on source strings** — that a component is still mounted, that a class
recipe is still applied, that a budget is still declared. A refactor that renames a component
will fail them, and the fix is to repoint the assertion, not to delete it.

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
5. No alternate payment-posting paths outside the Payment Desk module
   (`/protected/payments`, including its admin-only bulk-entry sub-surface
   `/protected/payments/bulk`, which posts every row through
   `post_student_payment_with_adjustments`).
6. `2026-27` is the live production session with real school financial records.
   Use `TEST-2026-27` for all testing and debugging. Never add test data,
   post test payments, or make experimental changes to the `2026-27` session.
7. Fee Setup publish must preview impact first and protect paid/partial/adjusted rows from
   silent rewrite. It must also leave carry-forward rows and EMI-covered installments alone.
8. A late fee is never folded into a fees figure, and never makes a student a defaulter.
   The rule lives in two engines that must be edited together.
8b. **Headcount and money count different students, on purpose.** Headcount is
   `record_status = 'active'`. Money — expected, collected, pending, defaulters — is
   `record_status = 'active' OR total_paid > 0`, because a student who left owing money
   still owes it (`20260808210000`). Never let one rule drift onto the other's question:
   that is what hid ₹17,250 of live collectable dues, and what made the MCP server and the
   Dashboard disagree. `lib/workbook/data.ts:680` and `workers/schoolfees-mcp/src/scope.mjs`
   are the two places the rule is written down.
9. A plan is never edited in place. Rescheduling writes a replacement and supersedes the
   old one, so the schedule a parent was shown stays on file.

## Testing and Debugging Rules

- Never modify the live `2026-27` session for testing.
- Use `TEST-2026-27` for all ongoing testing.
- Test student admission numbers must use the `TEST-` prefix.
- Never post test payments against real students.

## Active AY 2026-27 Policy Defaults

Canonical values (from `docs/product/school-rules.md` and `lib/config/fee-rules.ts`):
- Late fee: ₹1,000 flat — charged the day an installment passes its due date with fees
  still unsettled, and kept until paid or explicitly waived. **Never part of fees pending**,
  and never accrues on a carry-forward row (those carry a rate of 0 deliberately).
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
docs/qa/            # Reusable QA checklists
docs/quality/       # Quality baselines and advisor decisions
docs/samples/       # Sample data files (e.g. import test CSV)
```

Finished one-time plans, specs, go-live runbooks, and audit/UAT reports are
intentionally not kept in the tree — they live in git history.
