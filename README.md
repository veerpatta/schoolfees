# Shri Veer Patta Senior Secondary School Fee Admin

Internal fee management web app for one school:
Shri Veer Patta Senior Secondary School.

Accepted school names across code, docs, and UI:

- Shri Veer Patta Senior Secondary School
- Veer Patta School
- VPPS

This product is for office, accounts, and admin staff. It is not a parent
portal, not a public-facing fee app, and not a multi-school SaaS platform.

## Product Purpose

The app is meant to replace workbook-driven fee operations gradually without
losing auditability or making office workflows harder.

Current primary working areas:

- student master
- fee setup and session ledger generation
- payment entry
- append-only financial history
- printable receipts
- dashboard and dues visibility
- defaulters reporting
- staged spreadsheet import
- internal staff login and access control

## Current Repo State

This summary reflects the repo state on April 22, 2026.

Implemented core:

- school-branded landing page at `app/page.tsx`
- internal auth flow under `app/auth` with login, forgot password, update
  password, auth confirm handler, and error routes
- protected admin workspace under `app/protected`
- dashboard with live fee and outstanding summaries
- Student Master with list, add, detail, and edit flows
- student spreadsheet import with CSV/XLSX upload, header mapping, dry-run
  validation, duplicate detection, batch tracking, and valid-row-only save
- fee setup with a canonical global policy, school defaults, class defaults,
  transport defaults, and student overrides, now with mandatory impact preview
  and explicit confirm-apply workflow
- session ledger sync workflow for previewing and applying safe unpaid-ledger
  changes
- payment entry with append-only posting through RPCs
- student ledger with chronological history and linked adjustment trail
- receipt list and printable single-receipt view
- defaulters and outstanding reporting
- reports module with filterable tables and CSV export at
  `/protected/reports/export`
- deployment/settings validator page with env checks and policy notes
- admin-only staff management with role assignment, activation control, and
  password reset
- self password change for logged-in staff
- Supabase RLS on core tables
- audit triggers on core tables
- append-only enforcement on receipts, payments, payment adjustments, and audit
  logs
- 10 tracked SQL migrations covering schema, fee setup, payments, RBAC, import
  workflow, and auth/profile sync
- database-level RBAC using `public.staff_role` plus permission-aware policies

Incomplete or intentionally deferred:

- PDF receipt generation is not implemented; printable HTML exists
- PDF report export is not implemented; CSV export works
- automated bank reconciliation is not implemented
- test infrastructure exists, but there are still no actual test files

## Route And Module Map

Important current routes:

- `app/page.tsx`
  school-branded landing page
- `app/auth/login/page.tsx`
  staff login
- `app/auth/forgot-password/page.tsx`
  forgot-password request
- `app/auth/update-password/page.tsx`
  password update after recovery
- `app/auth/confirm/route.ts`
  auth confirmation handler
- `app/auth/sign-up/page.tsx`
  present in repo, but public signup should stay disabled for this app
- `app/protected/page.tsx`
  dashboard
- `app/protected/students/page.tsx`
  student list
- `app/protected/students/new/page.tsx`
  add student
- `app/protected/students/[studentId]/page.tsx`
  student detail
- `app/protected/students/[studentId]/edit/page.tsx`
  student edit
- `app/protected/imports/page.tsx`
  student import workflow
- `app/protected/fee-setup/page.tsx`
  fee defaults and overrides
- `app/protected/fee-setup/generate/page.tsx`
  session ledger generation
- `app/protected/fee-structure/page.tsx`
  alias route to fee setup
- `app/protected/payments/page.tsx`
  payment entry
- `app/protected/collections/page.tsx`
  alias route to payments
- `app/protected/ledger/page.tsx`
  ledger and adjustments
- `app/protected/receipts/page.tsx`
  receipt list
- `app/protected/receipts/[receiptId]/page.tsx`
  printable receipt document
- `app/protected/defaulters/page.tsx`
  defaulters and dues view
- `app/protected/reports/page.tsx`
  report tables
- `app/protected/reports/export/route.ts`
  CSV export endpoint
- `app/protected/staff/page.tsx`
  admin staff management
- `app/protected/password/page.tsx`
  self password change
- `app/protected/settings/page.tsx`
  environment and policy validator

Important supporting code:

- `components/admin/*`
- `components/students/*`
- `components/imports/*`
- `components/fees/*`
- `components/payments/*`
- `components/ledger/*`
- `components/receipts/*`
- `components/defaulters/*`
- `components/reports/*`
- `components/staff/*`
- `lib/config/*`
- `lib/auth/roles.ts`
- `lib/supabase/*`
- `lib/staff-management/data.ts`
- `lib/students/*`
- `lib/import/*`
- `lib/fees/*`
- `lib/payments/*`
- `lib/ledger/*`
- `lib/receipts/*`
- `lib/reports/*`
- `lib/defaulters/*`
- `scripts/bootstrap-staff.mjs`
- `supabase/schema.sql`
- `supabase/migrations/*`

## Current Data Model And Safety Rules

Current core tables:

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
- `school_fee_defaults`
- `student_fee_overrides`
- `installments`
- `receipts`
- `payments`
- `payment_adjustments`
- `audit_logs`

Current important views:

- `public.v_outstanding_summary`
- `public.v_installment_balances`

Current operating posture:

- RLS is enabled on core operational tables
- audit triggers are present
- payments, receipts, payment adjustments, and audit logs are append-only
- no delete-heavy workflow should be introduced for operational finance records
- import work remains staged and traceable by batch and row
- correction flows should use explicit adjustments or reversal-style entries

Non-negotiable rule:

- do not build UI that rewrites historical payment facts

## Current School Defaults

Active defaults in docs and config:

- app mode: `internal-admin`
- receipt prefix: `SVP`
- late fee: flat Rs 1000
- installment due dates: 20 April, 20 July, 20 October, 20 January
- default installment count: 4
- accepted payment modes: Cash, UPI, Bank transfer, Cheque
- Class 12 Science annual fee default: Rs 38000

Historical values that may appear in old notes or spreadsheets but are not
current policy:

- due dates on the 10th
- late fee at Rs 50/day

## Role Model

Current staff roles:

- `admin`
- `accountant`
- `read_only_staff`

These are enforced in app logic and at the database layer through Supabase RLS
and permission helpers.

## Tech Stack

- Next.js App Router
- React 19
- TypeScript
- Tailwind CSS
- shadcn/ui primitives
- Supabase auth + database
- Vercel deployment target

Current package baseline:

- `next`: `16.2.4`
- `react`: `19.2.5`
- `react-dom`: `19.2.5`
- `@supabase/supabase-js`: `2.104.0`
- `@supabase/ssr`: `0.10.2`
- `vitest`: `4.1.5`

Canonical Supabase helpers:

- `utils/supabase/client.ts`
- `utils/supabase/server.ts`
- `utils/supabase/middleware.ts`

Preferred app imports:

- `lib/supabase/client.ts`
- `lib/supabase/server.ts`
- `lib/supabase/proxy.ts`
- `lib/supabase/admin.ts`
- `lib/supabase/session.ts`

## Environment Variables

Copy `.env.local.example` to `.env.local`.

Required in every environment:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
NEXT_PUBLIC_SITE_URL=
NEXT_PUBLIC_SCHOOL_NAME=Shri Veer Patta Senior Secondary School
NEXT_PUBLIC_APP_MODE=internal-admin
```

Required server-only for staff bootstrap and admin auth-management flows:

```env
SUPABASE_SERVICE_ROLE_KEY=
```

Important:

- production should set `NEXT_PUBLIC_SITE_URL` explicitly
- do not deploy placeholder env values
- never expose `SUPABASE_SERVICE_ROLE_KEY` in `NEXT_PUBLIC_*`

## Local Development

1. Install Node.js 20 or newer.
2. Copy `.env.local.example` to `.env.local`.
3. Fill in the real Supabase URL and publishable key.
4. Add `SUPABASE_SERVICE_ROLE_KEY` for local admin/bootstrap flows.
5. Install dependencies with `npm install`.
6. Start the app with `npm run dev`.

Useful commands:

```bash
npm run dev
npm run lint
npm run typecheck
npm run check
npm run build
npm run test
npm run test:watch
npm run test:coverage
npm run bootstrap:staff
```

## Supabase Setup

1. Create the Supabase project.
2. Apply `supabase/schema.sql` or run the tracked migrations in
   `supabase/migrations/*`.
3. In Supabase Auth URL configuration, set the Site URL for local and
   production correctly.
4. Add redirect URLs for:
   `http://localhost:3000/auth/login`
   `http://localhost:3000/auth/update-password`
   `https://<your-domain>/auth/login`
   `https://<your-domain>/auth/update-password`
5. Copy the Project URL, Publishable key, and Service Role key into the
   correct env vars.
6. Keep public email/password signup disabled.

## Staff Bootstrap And Admin Management

Initial staff bootstrap is handled by:

- `scripts/bootstrap-staff.mjs`

Expected runtime env vars for the bootstrap script:

- `BOOTSTRAP_MAIN_ADMIN_PASSWORD`
- `BOOTSTRAP_ACCOUNTS_PASSWORD`
- `BOOTSTRAP_STAFF_PASSWORD`

Example PowerShell run:

```powershell
$env:BOOTSTRAP_MAIN_ADMIN_PASSWORD="46EfTz@1"
$env:BOOTSTRAP_ACCOUNTS_PASSWORD="vpps@123"
$env:BOOTSTRAP_STAFF_PASSWORD="vpps@123"
npm run bootstrap:staff
```

Current seeded accounts:

- `raj@vpps.co.in` as `admin`
- `accounts@vpps.co.in` as `accountant`
- `staff@vpps.co.in` as `read_only_staff`

After bootstrap:

- admin can create staff accounts from `/protected/staff`
- admin can assign roles
- admin can deactivate accounts without removing audit history
- admin can reset staff passwords
- staff can change their own password at `/protected/password`

## Deployment Notes

Keep these constraints intact:

- `proxy.ts` must continue to protect `/protected` routes
- public signup should remain disabled
- `public.users` should stay synchronized with auth metadata for RBAC and audit
  visibility
- `SUPABASE_SERVICE_ROLE_KEY` must remain server-only
- the school-branded landing page should not be replaced with generic sample
  content

## Documentation Sync Rules

If fee rules change, update together:

- `lib/config/fee-rules.ts`
- `app/protected/settings/page.tsx`
- `README.md`
- `AGENTS.md`
- `SCHOOL_RULES.md`

If auth or env wiring changes, update together:

- `.env.example`
- `.env.local.example`
- `components/login-form.tsx`
- `app/auth/*`
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
- `supabase/migrations/*`
- affected app flows
- `README.md`
- `PROJECT_CONTEXT.md`
- `AGENTS.md`
