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
- fee settings and session ledger generation
- payment entry and receipts
- ledger and adjustment entries
- defaulters and outstanding reporting
- filterable report tables with CSV export
- staged spreadsheet import (implemented)

## Current Repo Structure

Main routes and modules in the repo today:

- `app/page.tsx`
  school-branded internal app landing page
- `app/auth/*`
  login, password reset/recovery, auth confirmation, and error screens
- `app/protected/page.tsx`
  main dashboard with real-time aggregates
- `app/protected/students/page.tsx`
  student master list
- `app/protected/students/new/page.tsx`
  add student form
- `app/protected/students/[studentId]/page.tsx`
  student detail and edit view
- `app/protected/imports/page.tsx`
  CSV/XLSX import workflow with dry-run, mapping, and batch tracking
- `app/protected/setup/page.tsx`
  admin-only first-time setup wizard for session selection, class and route
  setup, school/class defaults, and go-live readiness
- `app/protected/fee-structure/page.tsx`
  alias route to fee setup area
- `app/protected/fee-setup/page.tsx`
  canonical global fee policy, school defaults, class defaults, transport
  defaults, and student overrides, with mandatory impact preview and
  confirm-apply flow
- `app/protected/fee-setup/generate/page.tsx`
  preview + safe sync workflow for unpaid session ledger installments
- `app/protected/payments/page.tsx`
  payment entry desk (also served at /collections)
- `app/protected/collections/page.tsx`
  alias to payments page
- `app/protected/ledger/page.tsx`
  per-student chronological ledger with adjustment entry
- `app/protected/receipts/page.tsx`
  receipt list view
- `app/protected/receipts/[receiptId]/page.tsx`
  printable single-receipt view
- `app/protected/defaulters/page.tsx`
  defaulters and outstanding summary
- `app/protected/reports/page.tsx`
  five filterable on-page report tables
- `app/protected/reports/export/route.ts`
  CSV download API endpoint for all report types
- `app/protected/master-data/page.tsx`
  admin CRUD for academic sessions, classes, transport routes, fee heads, and
  payment mode activation, with safe disable/delete guards
- `app/protected/settings/page.tsx`
  deployment readiness checks and active policy notes
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
  ordered SQL migration files for Supabase CLI workflows (currently 12)
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
- `v_installment_balances` supports installment-level due tracking
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

## Current Defaults

Current defaults from config and project docs:

- late fee: flat Rs 1000
- due dates: 20 April, 20 July, 20 October, 20 January
- default installment count: 4
- Class 12 Science annual fee default: Rs 38000
- payment modes: Cash, UPI, Bank transfer, Cheque
- receipt prefix: `SVP`
- school display name default: `Shri Veer Patta Senior Secondary School`
- app mode: `internal-admin`

Historical values that should be treated as old reference only:

- due dates on the 10th
- late fee at Rs 50/day

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

### Phase 1: Stabilization & Hardening (Current)
- [x] Master data CRUD for sessions, classes, routes, and fee heads.
- [x] Role-based access control (RBAC) at database and UI levels.
- [x] Staged spreadsheet import workflow.
- [x] Fee generation and preview logic.
- [x] Comprehensive error, loading, and empty states.
- [x] Robust environment variable validation.

### Phase 2: Operational Rollout (Next)
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
