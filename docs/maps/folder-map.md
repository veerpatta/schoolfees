# VPPS Schoolfees Agent Map

## What this app is
Internal office/accounts fee-management app for **Shri Veer Patta Senior Secondary School (VPPS)**.

## What this app is not
- Not a parent portal
- Not public self-service
- Not multi-school SaaS

## Read first
1. `AGENTS.md`
2. `docs/product/project-context.md`
3. `docs/product/mvp-scope.md`
4. `docs/product/school-rules.md`
5. `docs/modules/import.md`
6. `docs/product/roadmap.md`
7. `PRODUCTION_OPERATIONS_CHECKLIST.md`
8. `UAT_CHECKLIST.md`

## Source of truth
`Students` + `Fee Setup` are canonical. Dashboard, dues, Payment Desk, Transactions, Defaulters, and Exports must derive from these.

## Folder map
- `app/protected/*`: staff routes and module surfaces
- `components/*`: UI by module + shared `components/ui`
- `lib/*`: domain/business logic and data access
- `lib/supabase/`: Supabase browser, server, middleware/proxy, admin, and session clients/helpers
- `supabase/schema.sql`, `supabase/migrations/*`: DB schema and changes
- `tests/*`: unit/integration/ui/db test suites
- `docs/product/*`: product scope, school rules, and roadmap
- `docs/modules/*`: module guides for office workflows
- `docs/maps/*`: folder, database, module, legacy route, and danger-zone maps
- `docs/design/*`: design system notes
- `docs/workflows/*`: current operational workflows
- `docs/i18n/*`: translation/dictionary status
- `docs/samples/*`: sample data files (e.g. import test CSV)
- `i18n/`, `messages/`: locale config and Hindi/Hinglish/English dictionaries
- `hooks/`: shared client React hooks

## Module ownership quick map
- Dashboard: analytics/read-only shortcuts
- Students: student master + student-level exceptions
- Fee Setup: school-wide AY policy/defaults
- Payment Desk: only payment posting surface
- Transactions: read-only financial history center
- Defaulters: follow-up workspace
- Exports: download workspace
- Admin Tools: rare setup/config/troubleshooting

## Safety rules
- Preserve append-only payments, receipts, adjustments, and audit trails.
- Do not alter payment/receipt history semantics.
- Do not expose service-role keys in browser code.
- Do not add hidden payment-posting paths outside Payment Desk.

## Where to look
- Payments: `app/protected/payments`, `lib/payments`, `components/payments`
- Students: `app/protected/students`, `lib/students`, `components/students`
- Fee Setup: `app/protected/fee-setup`, `lib/setup`, `lib/fees`, `components/fees`
- Imports: `app/protected/imports`, `lib/import`, `components/imports`
- Transactions: `app/protected/transactions`, `lib/transactions`, `lib/ledger`, `lib/reports`
- Defaulters: `app/protected/defaulters`, `lib/defaulters`
- Exports: `app/protected/exports`, `lib/reports`
- Admin tools: `app/protected/admin-tools` (+ legacy redirect from `/protected/advanced`)
- Database: `supabase/schema.sql`, `supabase/migrations/*`
- Tests: `tests/unit`, `tests/integration`, `tests/ui`, `tests/db`

## Supabase clients
- `lib/supabase/client.ts`: browser client for Client Components and event handlers
- `lib/supabase/server.ts`: server client for Server Components, Route Handlers, and Server Actions
- `lib/supabase/middleware.ts`: middleware session refresh implementation
- `lib/supabase/proxy.ts`: stable proxy export used by root `proxy.ts`
- `lib/supabase/admin.ts`: service-role client for server/scripts only
- `lib/supabase/session.ts`: auth claims, RBAC guards, and staff session helpers

## New module-aligned folders
- `lib/transactions/`: workbook-style Transactions views and downloads; currently holds `workbook.ts` and `dues.ts` moved from `lib/office/`.

## Compatibility maps
- Legacy routes: `docs/maps/legacy-routes.md`
- Danger zones: `docs/maps/danger-zones.md`
