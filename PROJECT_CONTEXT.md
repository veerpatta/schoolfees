# PROJECT_CONTEXT.md

## One-Line Summary

This repo is a Next.js + Supabase internal fee management app for one school:
Shri Veer Patta Senior Secondary School.

## Names And Audience

School names you may see:

- Shri Veer Patta Senior Secondary School
- Veer Patta School
- VPPS

Primary users:

- office staff
- accounts staff
- admin staff

This is not a parent portal and not a general-purpose school ERP.

## Current Product Direction

The app exists to replace workbook-based fee work gradually while keeping
records auditable and office-friendly.

Current priority areas:

- first-time setup / onboarding with readiness checks
- student master
- fee settings and session ledger recalculation
- payment entry and receipts
- ledger and adjustment entries
- defaulters and outstanding reporting
- filterable report tables with CSV export
- staged spreadsheet import (implemented)

## Simplified Workspace Model

The protected workspace now follows a simplified workbook-style layout.

Primary daily navigation:

- `Start Here`
- `Students`
- `Fee Setup`
- `Payment Desk`
- `Dues & Receipts`
- `Advanced`

Operational boundaries:

- `Start Here` is the first daily worksheet for blockers, shortcuts, and
  recent office activity
- `Fee Setup` is the canonical live path for the workbook-style fee sheet:
  academic session, editable installment schedule, late fee, new/old academic
  fee, class-wise annual tuition, route-wise annual transport fee, and dues
  update review
- `Dues & Receipts` is the workbook-style working area for receipt register,
  installment tracker, master fee statement shortcuts, class register,
  defaulters, today’s receipts, today’s collection, and import issues
- `Advanced` keeps first-time setup, school setup lists, day close,
  reports/exports, staff, and settings out of the main daily flow
- `Setup` remains first-time go-live preparation only and must not be reused
  as a live fee-editing surface after setup completion

## Current Repo Structure

Main routes and modules in the repo today:

- `app/page.tsx`
  school-branded internal app landing page
- `app/auth/*`
  login, password reset/recovery, auth confirmation, and error screens
- `app/protected/page.tsx`
  `Start Here` daily sheet with blockers, continue-task shortcuts, and today’s
  office work
- `app/protected/students/page.tsx`
  student master list
- `app/protected/students/new/page.tsx`
  add student form
- `app/protected/students/[studentId]/page.tsx`
  student detail and workbook workspace view
- `app/protected/students/[studentId]/statement/page.tsx`
  printable master fee statement
- `app/protected/imports/page.tsx`
  CSV/XLSX import workflow with dry-run, mapping, and batch tracking
- `app/protected/setup/page.tsx`
  admin-only first-time setup wizard for session selection, class and route
  setup, school/class defaults, and go-live readiness; once marked complete it
  stays readable but is no longer a live-edit path for policy/default changes
- `app/protected/fee-structure/page.tsx`
  alias route to fee setup area
- `app/protected/fee-setup/page.tsx`
  workbook-style fee setup screen for academic session, editable installment
  schedule, late fee, new/old academic fee, class-wise annual tuition, route-
  wise annual transport fee, and embedded supporting list management, with
  mandatory impact preview and confirm-apply flow; a changed academic session
  now saves as a fresh fee-policy snapshot instead of overwriting the prior
  year in place
- `app/protected/fee-setup/generate/page.tsx`
  preview + safe recalculation workflow for unpaid and future session ledger
  installments, with paid/partial rows flagged for review
- `app/protected/advanced/page.tsx`
  secondary hub for setup, school setup lists, day close, reports, staff, and
  settings
- `app/protected/dues/page.tsx`
  workbook-style dues and receipt area with shortcut views for receipt
  register, installment tracker, master fee statements, class register,
  defaulters, today’s receipts, today’s collection, and import issues
- `app/protected/payments/page.tsx`
  payment entry desk (also served at /collections)
- `app/protected/collections/page.tsx`
  alias to payments page
- `app/protected/ledger/page.tsx`
  per-student chronological ledger with adjustment entry
- `app/protected/receipts/page.tsx`
  receipt list view
- `app/protected/receipts/[receiptId]/page.tsx`
  workbook-aligned printable receipt view
- `app/protected/defaulters/page.tsx`
  defaulters and outstanding summary
- `app/protected/reports/page.tsx`
  five filterable on-page report tables
- `app/protected/reports/export/route.ts`
  CSV download API endpoint for all report types
- `app/protected/master-data/page.tsx`
  admin CRUD for academic sessions, classes, transport routes, custom fee
  heads, and payment modes, with safe disable/delete guards; the same
  supporting list editor is also embedded inside Fee Setup for the daily
  workbook flow, but collapsed by default there to reduce scrolling
- `app/protected/settings/page.tsx`
  deployment readiness checks, active policy notes, and recent config-change
  batch history
- `app/protected/access-denied/page.tsx`
  explicit permission-denied screen inside the protected shell
- `app/protected/staff/page.tsx`
  admin-only staff account creation, role updates, password resets, and account activation control
- `app/protected/password/page.tsx`
  logged-in staff password change
- `components/admin/*`
  dashboard shell, cards, nav, page headers, loading and error boundaries
- `components/staff/*`
  staff management and password forms
- `lib/config/*`
  fallback school defaults, fee rules, navigation
- `lib/fees/policy.ts`
  server-only canonical fee policy/config service used across fee setup,
  generation, payments, settings, and policy notes
- `lib/fees/change-log.ts`
  server-only config-change audit helper for recent preview/apply batch history
- `lib/fees/regeneration.ts`
  server-only ledger recalculation service with preview/apply batch logging
- `lib/master-data/data.ts`
  server-only centralized source for session/class/route/fee-head/payment-mode
  options and in-use guardrails for master CRUD flows
- `lib/setup/data.ts`
  server-only first-time setup data, readiness, and completion-state service
- `lib/auth/roles.ts`
  role model and permission map
- `lib/staff-management/data.ts`
  server-only staff bootstrap and admin account-management helpers
- `lib/supabase/session.ts`
  server-side session, role resolution, and permission guards
- `lib/env.ts`
  environment variable helpers and placeholder guards
- `supabase/schema.sql`
  schema, audit triggers, RLS, reporting views
- `supabase/schema/*`
  reserved for future split schema/reference files
- `supabase/migrations/*`
  ordered SQL migration files for Supabase CLI workflows (currently 16)
- `scripts/bootstrap-staff.mjs`
  one-time server-only seed script for initial staff accounts

## Tech Stack

- Next.js App Router
- TypeScript
- React 19
- Tailwind CSS
- shadcn/ui primitives
- Supabase for auth and database
- Vercel for deployment

Current package context worth preserving:

- `next`: `16.2.4`
- `react`: `19.2.5`
- `react-dom`: `19.2.5`
- `@supabase/supabase-js`: `2.104.0`
- `@supabase/ssr`: `0.10.2`
- `vitest`: present for test infrastructure; initial unit tests for fee rules have been written in `tests/fee-rules.test.ts`

## Supabase Wiring

Canonical helper implementations:

- `utils/supabase/client.ts`
- `utils/supabase/server.ts`
- `utils/supabase/middleware.ts`

Stable app import paths:

- `lib/supabase/client.ts`
- `lib/supabase/server.ts`
- `lib/supabase/proxy.ts`
- `lib/supabase/admin.ts`
- `lib/supabase/session.ts`

Auth/session expectations:

- keep `proxy.ts` active
- use server-side auth checks for protected pages
- keep proxy redirects scoped to `/protected`
- use `lib/supabase/session.ts` for database-backed role-aware session checks
- keep public signup disabled
- bootstrap initial staff accounts through a server-only script or admin flow
- keep `public.users` synchronized from `auth.users` metadata for RBAC and audit visibility
- never expose `SUPABASE_SERVICE_ROLE_KEY` in browser code

Current local public Supabase project context:

- project ref: `lsdrvovwybzspcvbdcir`
- `NEXT_PUBLIC_SUPABASE_URL=https://lsdrvovwybzspcvbdcir.supabase.co`

Current site URL behavior:

- prefer explicit `NEXT_PUBLIC_SITE_URL`
- fall back to `VERCEL_PROJECT_PRODUCTION_URL`
- then fall back to `VERCEL_URL`
- use browser origin during client-side local flows when needed
- production should still set `NEXT_PUBLIC_SITE_URL` explicitly

## Current Domain Model

Important current tables:

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

Important current enums:

- `staff_role`
- `class_status`
- `student_status`
- `installment_status`
- `payment_mode`
- `adjustment_type`
- `audit_action`

Important current database behavior:

- audit triggers capture inserts, updates, and deletes
- append-only triggers block updates/deletes on receipts, payments, payment
  adjustments, and audit logs
- import batches keep source filename, detected headers, row-level validation,
  duplicate flags, and final imported-row traceability
- `v_outstanding_summary` supports outstanding reporting
- `v_installment_balances` supports legacy installment-level due tracking
- `v_workbook_student_financials` supports workbook student-wise totals
- `v_workbook_installment_balances` supports workbook installment tracking
- ledger regeneration batches and row previews support safe recalculation
- no delete policies exist for operational finance tables

## Product And Data Constraints

Future agents should assume:

- the app is internal-admin first
- history matters more than convenience edits
- simple UI is preferred over a clever UI
- records should be easy to verify later
- imports should stay traceable and staged through `import_batches` / `import_rows`

Payment-history rule:

- do not build direct historical payment editing flows
- use explicit adjustments/reversals instead
- preserve the original receipt trail

## Canonical Configuration Behavior

Live fee configuration currently works like this:

- `fee_policy_configs` is the canonical source for active session label,
  installment schedule, late fee, receipt prefix, accepted payment modes, and
  custom fee-head catalog
- `school_fee_defaults`, `fee_settings`, `transport_routes`, and
  `student_fee_overrides` are the editable default/override layers beneath the
  canonical policy
- live workbook fee setup edits should run through `/protected/fee-setup`,
  which creates a preview batch, records changed fields, applies only after
  explicit confirmation, and then runs ledger-safe propagation
- `/protected/setup` is first-time go-live preparation only; once setup is
  marked complete, live edits move to fee setup or master data depending on the
  change type
- `/protected/fee-setup` is now the primary live surface for the active
  workbook-style fee sheet: academic session label, due dates, late fee,
  new/old academic fee, class tuition, and route transport fee.
  `/protected/master-data` remains available for direct admin maintenance of
  sessions, classes, and routes, but Fee Setup is the workflow staff should use
  first for live fee values because preview and audit stay attached there

Propagation expectations:

- dashboard, payments, reports, defaulters, settings, setup readiness, and
  landing/auth policy copy all consume the same canonical policy service
- payment entry enforces the current accepted payment modes and current receipt
  prefix
- role landing remains workbook-first: admin -> `Start Here`, accountant ->
  `Payment Desk`, read_only_staff -> `Start Here`
- reports and receipts keep historical financial facts visible even after the
  current policy changes
- paid, partially paid, or adjusted installment rows are never silently
  rewritten by config apply; blocked rows are logged for manual review

## Current Defaults

Current defaults from config and project docs:

- active academic session: `2026-27`
- fee engine: `workbook_v1`
- late fee: flat Rs 1000
- due dates: 20-04-2026, 20-07-2026, 20-10-2026, 20-01-2027
- default installment count: 4
- new student academic fee: Rs 1100
- old student academic fee: Rs 500
- Class 12 Science annual fee default: Rs 38000
- payment modes: Cash, UPI, Bank transfer, Cheque
- receipt prefix: `SVP`
- school display name default: `Shri Veer Patta Senior Secondary School`
- app mode: `internal-admin`
- books are excluded from workbook-mode fee calculation for AY `2026-27`

Historical values that should be treated as old reference only:

- due dates on the 10th
- late fee at Rs 50/day
- stale workbook note showing flat late fee Rs 3000 while editable AY 2026-27 setup uses Rs 1000

## Working Style Expectations

Prefer:

- incremental workflow improvements
- correction-safe data modeling
- school-specific terminology
- practical reporting
- documentation updates when policy or schema intent changes

Avoid:

- SaaS-first abstractions
- parent-facing assumptions
- destructive cleanup flows
## Roadmap

### Phase 1: Stabilization & Hardening
- [x] Master data CRUD for sessions, classes, and routes.
- [x] Role-based access control (RBAC) at database and UI levels.
- [x] Staged spreadsheet import workflow.
- [x] Fee generation and preview logic.
- [x] Comprehensive error, loading, and empty states.
- [x] Robust environment variable validation.

### Phase 2: Canonical Configuration & Safe Propagation
- [x] Canonical live fee policy service used across fee setup, payments,
  reports, dashboard, settings, and setup readiness.
- [x] Preview/apply workflow for live policy/default changes.
- [x] Ledger-safe propagation that only updates future or unpaid installment
  rows.
- [x] Blocked-row logging for paid, partial, or adjusted installment rows that
  need manual review.
- [x] Protected-shell access-denied screen and clearer permission-denied
  behavior.
- [x] Live config audit visibility in settings through recent config-change
  batch history.

### Operational Rollout (Manual / Deployment)
- [ ] Initial server setup and migration application.
- [ ] Bootstrap initial staff accounts.
- [ ] Manual import of existing student workbooks.
- [ ] Training for accounts staff on payment entry and receipt printing.

### Phase 3: Enhanced Reporting & Print
- [x] Print-optimized Student Ledger view.
- [ ] Server-side PDF generation for receipts.
- [ ] Bulk receipt printing for installment periods.
- [ ] PDF export for reports (Defaulters, Daily Collection, Outstanding).
- [ ] Monthly collection email/SMS notification integration (Future).

### Phase 4: Financial Extensions
- [ ] Integrated bank reconciliation module.
- [ ] Expense tracking (petty cash, staff salary).
- [ ] Inventory management (uniforms, books).
- [ ] Multi-session history migration for older years.
