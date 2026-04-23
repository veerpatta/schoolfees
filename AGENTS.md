# AGENTS.md

## Purpose

This repo is the internal fee management admin app for one school:
Shri Veer Patta Senior Secondary School.

Common school names used in conversation or docs:

- Shri Veer Patta Senior Secondary School
- Veer Patta School
- VPPS

This is an internal office/accounts/admin tool. It is not a parent portal and
it is not a multi-school SaaS product.

## Read These First

When starting work, read these root docs before making product decisions:

1. `AGENTS.md`
2. `PROJECT_CONTEXT.md`
3. `MVP_SCOPE.md`
4. `SCHOOL_RULES.md`
5. `IMPORT_NOTES.md`

Use them together:

- `AGENTS.md` for fast repo and workflow guidance
- `PROJECT_CONTEXT.md` for current architecture, modules, and real file
  locations
- `MVP_SCOPE.md` for what belongs in the product now
- `SCHOOL_RULES.md` for fee and audit rules
- `IMPORT_NOTES.md` for spreadsheet migration background and future import work

## Product Identity

Primary goals:

- student master
- fee settings
- session ledger recalculation
- payment entry
- append-only ledger behavior
- printable receipts
- dashboard
- defaulters reporting
- staged spreadsheet import
- internal staff login and access control

Primary product qualities:

- simple office-friendly UI
- reliable workflows over flashy design
- clear auditability
- gradual migration from workbook-based work
- explicit, correction-safe financial history

## Simplified Workspace Truth

The protected workspace now follows a workbook-style operating model.

Primary daily areas:

- `Start Here`
- `Students`
- `Fee Setup`
- `Payment Desk`
- `Dues & Receipts`
- `Advanced`

Operational boundaries:

- `Start Here` is the first daily worksheet for blockers, shortcuts, and
  continue-task links
- `Fee Setup` is the canonical live path for workbook-style fee setup:
  academic session, installment due dates, late fee, new/old academic fee,
  class-wise annual tuition, route-wise annual transport fee, and dues update
  review
- `Dues & Receipts` is the workbook-style working area for receipt register,
  installment dues, class dues summary, overdue list, today’s receipts,
  today’s collection, and import issues
- `Advanced` contains setup, school setup lists, day close/corrections,
  reports/exports, staff, and settings
- `Setup` remains first-time go-live preparation only and must not be reused
  as a live fee-editing path after completion

Default role landing:

- `admin` -> `Start Here`
- `accountant` -> `Payment Desk`
- `read_only_staff` -> `Start Here`

## Non-Goals

Unless a user explicitly asks otherwise, do not steer the app toward:

- parent-facing features
- public self-service flows
- generic SaaS multi-tenant architecture
- tutorial/demo pages replacing the current school app
- complex abstractions with weak operational value
- history-rewriting finance workflows

## Current Repo Snapshot

This file reflects the repo state on April 23, 2026.

Fully implemented core:

- branded landing page at `app/page.tsx`
- auth flow under `app/auth` with login, forgot password, update password,
  confirm route, error route, and a sign-up route that should remain disabled
  for public use
- protected admin workspace under `app/protected`
- simplified workbook-style protected shell with `Start Here`, `Students`,
  `Fee Setup`, `Payment Desk`, `Dues & Receipts`, and `Advanced`
- admin-only first-time setup wizard with academic session selection, class and
  route setup, school/class defaults, readiness checklist, and explicit setup
  completion marker; once setup is marked complete, the wizard no longer serves
  as a live-edit path for policy/default changes
- real-time dashboard, defaulters, and ledger modules
- Student Master with add, detail, and edit workflows
- Student Spreadsheet Import: CSV/XLSX upload, column mapping, dry-run
  validation, duplicate detection, batch tracking, and valid-row-only save
- Fee Setup: workbook-style live setup for academic session, editable
  installment schedule, flat late fee, new/old academic fee, class-wise
  annual tuition, route-wise annual transport fee, session-level fee heads,
  and inline session/class/route maintenance on one cleaner page, with
  impact preview and confirm-apply workflow
- AY `2026-27` workbook parity with `workbook_v1`, exact seeded class tuition,
  exact seeded annual route defaults, workbook student status, signed other
  adjustment, and late-fee-waiver support
- Ledger Recalculation workflow for previewing and applying safe
  unpaid/future-installment inserts, updates, and cancellations while flagging
  paid or partially paid rows for manual review
- Payment Entry: append-only posting via RPC, with receipts generated as linked
  financial records
- workbook-style dues views for transactions, installment tracker, master fee
  statements, class register, defaulters, today�s receipts, and today�s
  collection
- Ledger: chronological per-student history with linked adjustment entries
- Receipts: receipt list plus workbook-aligned printable per-receipt view
- printable master fee statement route at
  `/protected/students/[studentId]/statement`
- Reports: on-page filterable tables for Outstanding, Daily Collection, Receipt
  Register, Student Ledger, and Import Verification, plus working CSV export at
  `/protected/reports/export`
- Master Data Management: admin CRUD for academic sessions, classes, transport
  routes, custom fee heads, and payment modes under `/protected/master-data`,
  with in-use delete guards and active/current session markers; the same
  supporting list editor is also embedded in the daily Fee Setup screen so the
  workbook workflow stays in one place
- Deployment Settings Validator showing env checks, policy notes, and recent
  config-change batch history
- explicit access-denied route under `app/protected/access-denied`
- internal staff management under `app/protected/staff` with role assignment,
  activation toggles, password resets, and initial password handling
- self password change under `app/protected/password`
- append-only behavior enforced by RPCs and DB triggers on receipts, payments,
  payment_adjustments, and audit_logs
- 17 tracked migrations covering schema, fee setup, config preview/apply,
  payments, RBAC alignment, import workflow, setup progress, ledger
  regeneration, and finance-office controls
- Role-Based Access Control (RBAC): `public.staff_role` enum and RLS policies
  enforce `admin`, `accountant`, and `read_only_staff` at the database layer

Incomplete or deferred:

- PDF receipts: printable HTML view exists but no server-side PDF generation
- advanced report export to PDF is not implemented
- automated bank reconciliation is not implemented
- testing infrastructure exists, and initial unit tests for fee rules have been written in `tests/fee-rules.test.ts`.

Do not replace the existing school-branded landing page with generic tutorial
content or Supabase sample code unless the user explicitly requests that.

## Key Real Paths

- landing page: `app/page.tsx`
- auth routes: `app/auth/*`
- login action: `app/auth/login/actions.ts`
- protected layout and dashboard: `app/protected/layout.tsx`,
  `app/protected/page.tsx`
- students list: `app/protected/students/page.tsx`
- student add: `app/protected/students/new/page.tsx`
- student detail: `app/protected/students/[studentId]/page.tsx`
- student master statement: `app/protected/students/[studentId]/statement/page.tsx`
- student edit: `app/protected/students/[studentId]/edit/page.tsx`
- student actions: `app/protected/students/actions.ts`
- imports: `app/protected/imports/page.tsx`
- import actions: `app/protected/imports/actions.ts`
- setup wizard: `app/protected/setup/page.tsx`
- setup actions: `app/protected/setup/actions.ts`
- fee settings alias: `app/protected/fee-structure/page.tsx`
- fee setup: `app/protected/fee-setup/page.tsx`
- fee setup actions: `app/protected/fee-setup/actions.ts`
- fee recalculation: `app/protected/fee-setup/generate/page.tsx`
- fee recalculation actions: `app/protected/fee-setup/generate/actions.ts`
- advanced hub: `app/protected/advanced/page.tsx`
- dues workbook: `app/protected/dues/page.tsx`
- fee regeneration service: `lib/fees/regeneration.ts`
- payment entry: `app/protected/payments/page.tsx`
- payment actions: `app/protected/payments/actions.ts`
- collections alias to payments: `app/protected/collections/page.tsx`
- ledger: `app/protected/ledger/page.tsx`
- ledger actions: `app/protected/ledger/actions.ts`
- receipts: `app/protected/receipts/page.tsx`
- printable receipt: `app/protected/receipts/[receiptId]/page.tsx`
- defaulters: `app/protected/defaulters/page.tsx`
- reports: `app/protected/reports/page.tsx`
- reports CSV export: `app/protected/reports/export/route.ts`
- master data: `app/protected/master-data/page.tsx`
- master data actions: `app/protected/master-data/actions.ts`
- access denied page: `app/protected/access-denied/page.tsx`
- staff management: `app/protected/staff/page.tsx`
- staff actions: `app/protected/staff/actions.ts`
- self password change: `app/protected/password/page.tsx`
- password actions: `app/protected/password/actions.ts`
- settings: `app/protected/settings/page.tsx`
- admin shell/components: `components/admin/*`
- student UI: `components/students/*`
- import UI: `components/imports/*`
- fee UI: `components/fees/*`
- setup UI: `components/setup/*`
- payment UI: `components/payments/*`
- ledger UI: `components/ledger/*`
- receipt UI: `components/receipts/*`
- report UI: `components/reports/*`
- master data UI: `components/master-data/*`
- staff UI: `components/staff/*`
- bootstrap seed script: `scripts/bootstrap-staff.mjs`
- fee rules: `lib/config/fee-rules.ts`
- canonical fee policy service: `lib/fees/policy.ts`
- config-change audit helper: `lib/fees/change-log.ts`
- setup/readiness service: `lib/setup/data.ts`
- master-data service: `lib/master-data/data.ts`
- school profile: `lib/config/school.ts`
- navigation: `lib/config/navigation.ts`
- roles + permissions: `lib/auth/roles.ts`
- session/permission helpers: `lib/supabase/session.ts`
- server-only admin helper: `lib/supabase/admin.ts`
- env helpers: `lib/env.ts`
- tests/fee-rules.test.ts: unit tests for session labeling, fee normalization, and installment due-dates
- schema: `supabase/schema.sql`
- schema notes: `supabase/schema/*`
- migrations: `supabase/migrations/*`
- tests setup only: `tests/setup.ts`

## Tech Stack

- Next.js App Router
- React 19
- TypeScript
- Tailwind CSS
- shadcn/ui primitives
- Supabase auth + database
- Vercel deployment target

Current package baseline worth preserving:

- `next`: `16.2.4`
- `react`: `19.2.5`
- `react-dom`: `19.2.5`
- `@supabase/supabase-js`: `2.104.0`
- `@supabase/ssr`: `0.10.2`
- `vitest`: `4.1.5`

Canonical Supabase helpers live in `utils/supabase`.
App code should usually import from `lib/supabase/*`.

## Operating Rules For Agents

1. Keep this app internal-admin first.
2. Favor clear, dependable office workflows over flashy design.
3. Preserve auditability on student, fee, collection, and import data.
4. Never treat historical payments as editable facts.
5. Use adjustment or reversal-style entries instead of rewriting history.
6. Keep correction flows explicit and traceable.
7. Avoid delete-heavy workflows for operational records.
8. Keep route contracts under `app/auth` and `app/protected` stable.
9. Keep `SUPABASE_SERVICE_ROLE_KEY` server-only.
10. Preserve school-specific branding and terminology.
11. Keep public signup disabled; bootstrap staff accounts through a server-only
    flow or admin-only management workflow.
12. Preserve `public.users` sync with auth metadata for RBAC and audit
    visibility.
13. Prefer reporting and operational clarity over clever abstractions.

Important nuance:

- The current schema allows updates on master and due-schedule tables.
- Do not interpret that as permission to build history-rewriting UI.
- Payments, receipts, payment adjustments, and audit logs should stay
  append-only at the workflow and data-model level.

## Canonical Configuration Truth

Treat the live configuration model like this:

- `fee_policy_configs` is the canonical source for active session label,
  installment schedule, late fee, receipt prefix, accepted payment modes, and
  custom fee-head catalog.
- `school_fee_defaults`, `fee_settings`, `transport_routes`, and
  `student_fee_overrides` are the editable default/override layers resolved
  beneath the canonical policy.
- live workbook fee setup edits should go through `/protected/fee-setup`, not
  setup or master-data shortcuts, because fee setup creates
  `config_change_batches`, shows impact preview, applies only after
  confirmation, and then runs ledger-safe propagation; when the academic
  session changes, the save flow creates a fresh fee-policy snapshot for the
  new session instead of rewriting the prior year in place.
- `/protected/setup` is first-time go-live preparation. After setup completion,
  it becomes read-only for live policy/default edits.
- `/protected/fee-setup` is now the primary live surface for the active
  workbook-style fee sheet: academic session label, editable installment
  schedule, workbook fee values, class tuition, route transport fees, and
  session/class/route management plus session-level fee heads.
  `/protected/master-data` remains
  available for direct admin maintenance of sessions, classes, routes, fee
  heads, and payment modes, but Fee Setup is the workflow staff should use
  first for live fee values because preview, audit, and propagation stay
  attached there.

Propagation expectations:

- dashboard, payments, reports, defaulters, settings, setup readiness, and
  landing/auth policy copy should all read the active policy through the same
  canonical service
- payment entry must enforce the current accepted payment modes and receipt
  prefix
- role landing and simplified navigation should stay workbook-first:
  `admin` -> `Start Here`, `accountant` -> `Payment Desk`,
  `read_only_staff` -> `Start Here`
- receipts, payments, and payment adjustments remain historical facts after
  posting even if the current policy later changes

## Active School Rules

Current active fee-policy defaults:

- late fee: flat Rs 1000
- installment due dates: 20 April, 20 July, 20 October, 20 January
- default installment count: 4
- Class 12 Science annual fee default: Rs 38000
- accepted payment modes: Cash, UPI, Bank transfer, Cheque
- receipt prefix: `SVP`
- app mode: `internal-admin`
- active academic session: `2026-27`
- active fee engine: `workbook_v1`
- new student academic fee: Rs 1100
- old student academic fee: Rs 500
- books are excluded from workbook-mode fee calculation for AY `2026-27`

Historical SOP values that may appear in old notes or workbooks but are not
active rules:

- due dates on the 10th
- late fee at Rs 50 per day
- stale workbook note showing flat late fee Rs 3000 while AY `2026-27` setup and formulas use Rs 1000

If old workbook data or staff notes conflict with current policy, current
policy wins unless the user explicitly asks for historical-rule handling.

## Current Data And Audit Context

Current core tables in `supabase/schema.sql`:

- `users`
- `classes`
- `transport_routes`
- `students`
- `import_batches`
- `import_rows`
- `fee_settings`
- `fee_policy_configs`
- `config_change_batches`
- `config_change_blocked_installments`
- `ledger_regeneration_batches`
- `ledger_regeneration_rows`
- `setup_progress`
- `school_fee_defaults`
- `student_fee_overrides`
- `installments`
- `receipts`
- `payments`
- `payment_adjustments`
- `audit_logs`

Current operational posture:

- RLS is enabled on core tables
- audit triggers exist on core tables
- spreadsheet imports are staged and traceable by batch and row
- payments, receipts, payment adjustments, and audit logs are append-only
- no delete policies exist for core operational finance tables
- `public.v_outstanding_summary` exists for reporting
- `public.v_installment_balances` exists for installment due tracking
- `public.v_workbook_student_financials` exists for workbook student-wise totals
- `public.v_workbook_installment_balances` exists for workbook installment tracking

Preserve:

- `created_at` / `updated_at`
- `created_by` / `updated_by`
- auditable correction history
- imported-row and batch traceability
- receipt and payment chronology

## Auth And Env Context

Current auth/environment expectations:

- `proxy.ts` protects `/protected` routes and refreshes auth cookies for SSR
- server actions handle login/logout and key account-management flows
- keep `NEXT_PUBLIC_SITE_URL` explicitly set in production
- keep the service role key out of browser code
- `.env.example` and `.env.local.example` are part of the contract and must be
  updated when env requirements change

Required env variables today:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_SITE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SCHOOL_NAME`
- `NEXT_PUBLIC_APP_MODE`

Bootstrap/runtime-only password env vars used by `scripts/bootstrap-staff.mjs`:

- `BOOTSTRAP_MAIN_ADMIN_PASSWORD`
- `BOOTSTRAP_ACCOUNTS_PASSWORD`
- `BOOTSTRAP_STAFF_PASSWORD`

## Change Control

If fee rules change, update together:

- `lib/config/fee-rules.ts`
- relevant UI under `app/protected/settings`
- `README.md`
- `AGENTS.md`
- `SCHOOL_RULES.md`
- `PROJECT_CONTEXT.md` if the default behavior summary changes

If env or auth wiring changes, update together:

- `.env.example`
- `.env.local.example`
- `app/auth/*`
- `components/login-form.tsx`
- `app/protected/settings/page.tsx`
- `utils/supabase/*`
- `lib/supabase/*`
- `lib/env.ts`
- `proxy.ts`
- `README.md`
- `PROJECT_CONTEXT.md`
- `AGENTS.md`

If schema intent changes, update together:

- `supabase/schema.sql`
- relevant `supabase/migrations/*`
- affected UI/workflows
- `README.md`
- `PROJECT_CONTEXT.md`
- `AGENTS.md`

If staff-management behavior changes, update together:

- `scripts/bootstrap-staff.mjs`
- `lib/staff-management/data.ts`
- `app/protected/staff/*`
- `app/protected/password/*`
- `.env.example`
- `.env.local.example`
- `README.md`
- `PROJECT_CONTEXT.md`
- `AGENTS.md`

## Delivery Guidance

Prefer this order when adding or changing product behavior:

1. make the data rule explicit
2. make the workflow safe
3. make the UI clear
4. make the reporting auditable
5. add polish only after the workflow is reliable

When in doubt, choose the option that reduces staff confusion and preserves an
audit trail.
