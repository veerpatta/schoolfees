# VPPS Schoolfees Agent Map

## What this app is
Internal office/accounts fee-management app for **Shri Veer Patta Senior Secondary School (VPPS)**.

## What this app is not
- Not a parent portal
- Not public self-service
- Not multi-school SaaS

## Read first
1. `AGENTS.md`
2. `PROJECT_CONTEXT.md`
3. `MVP_SCOPE.md`
4. `SCHOOL_RULES.md`
5. `IMPORT_NOTES.md`
6. `ROADMAP.md`
7. `UAT_CHECKLIST.md`

## Source of truth
`Students` + `Fee Setup` are canonical. Dashboard, dues, Payment Desk, Transactions, Defaulters, and Exports must derive from these.

## Folder map
- `app/protected/*`: staff routes and module surfaces
- `components/*`: UI by module + shared `components/ui`
- `lib/*`: domain/business logic and data access
- `supabase/schema.sql`, `supabase/migrations/*`: DB schema and changes
- `tests/*`: unit/integration/ui/db test suites
- `docs/*`: workflows, decisions, archive, and module/db maps

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
- Transactions: `app/protected/transactions`, `lib/ledger`, `lib/reports`
- Defaulters: `app/protected/defaulters`, `lib/defaulters`
- Exports: `app/protected/exports`, `lib/reports`
- Admin tools: `app/protected/admin-tools` (+ legacy redirect from `/protected/advanced`)
- Database: `supabase/schema.sql`, `supabase/migrations/*`
- Tests: `tests/unit`, `tests/integration`, `tests/ui`, `tests/db`
