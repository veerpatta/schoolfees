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
- fee setup and session ledger recalculation
- payment entry
- append-only financial history
- printable receipts
- read-only dashboard and dues visibility
- defaulters reporting
- staged spreadsheet import
- internal staff login and access control

## Simplified Daily Workflow

The protected workspace now follows a workbook-style office flow instead of a
module catalog.

Primary daily areas:

- `Dashboard`
  first overview screen for school-wide fee collection, pending dues, overdue
  follow-up, today receipts, attention items, and safe shortcuts
- `Students`
  student master, student-specific fee profiles, spreadsheet add/update, and
  one-student workspace
- `Fee Setup`
  the staged live workbook-style fee sheet for academic session, master fee
  heads, session policy, class tuition, route transport fee, and final
  review/publish
- `Payment Desk`
  counter posting, receipt printing, and next-payment shortcuts
- `Dues & Receipts`
  workbook-style views for receipt register, installment tracker, master fee
  statement shortcuts, class register, defaulters, today’s receipts, today’s
  collection, and import issues
- `Advanced`
  first-time setup, school setup lists, day close/corrections, detailed
  reports/exports, staff, and settings

## What Each Role Sees By Default

- `admin`
  lands on `Dashboard`; sees the simplified primary nav plus `Advanced`
- `accountant`
  lands on `Payment Desk`; nav order prioritizes `Payment Desk` and `Dues &
  Receipts`, with Dashboard available as a read-only overview
- `read_only_staff`
  lands on `Dashboard`; keeps the simplified primary nav without `Advanced`
  while still retaining intended deep-link access to detailed read-only screens
  such as reports or imports when permissions allow

## Before Real Data / UAT

Run UAT with dummy data before entering actual student records. Use a clearly
named test academic session such as `TEST-2026-27`, dummy students such as
`Test Student 001`, and dummy SR numbers such as `TEST-SR-001`.

UAT guidance lives in:

- `docs/uat-test-plan.md`
- `docs/test-data-setup.md`
- `docs/before-real-data-checklist.md`
- `docs/samples/student-import-test-sample.csv`

Do not change the real AY `2026-27` defaults just to test the workflow. Do not
post test payments against real students, and do not mix dummy students or
dummy receipts with production records.

## Dashboard vs Advanced

What belongs in `Dashboard`:

- read-only school-wide collection overview
- total expected, collected, pending, overdue, and collection-rate cards
- charts or chart-like views for trends, class pending, and installments
- follow-up students, latest receipts, and today collection
- blockers that stop live work and safe shortcut links
- import-review, fee-setup review, and dues-update attention items

Dashboard is analytical and read-only. It does not post payments, edit student
fee profiles, or change school-wide fee setup. Fee Setup remains the only
school-wide fee setup editor, Students remains the student-specific profile and
override editor, and Payment Desk remains the transaction posting surface.

What belongs in `Advanced`:

- first-time setup and go-live completion
- school setup lists for sessions, classes, and routes
- day close, correction review, and finance controls
- detailed reports, exports, and print views
- staff management
- deployment/settings checks

## Live Changes vs Historically Locked Records

Live fee changes happen in one place:

- `/protected/fee-setup`

This is where admins:

- update the active academic session label
- update the 4 installment due dates
- update the flat late fee and new/old academic fee
- update class-wise annual tuition
- update route-wise annual transport fee
- review the impact first
- save the live change only after the impact summary is visible
- open dues update review for future and unpaid rows

What remains append-only and historically locked:

- receipts
- payments
- payment adjustments
- audit logs

Operationally this means:

- paid history is never silently rewritten
- corrections must remain explicit and auditable
- live config changes only touch future or unpaid installment rows
- paid, partial, or adjusted rows are held for manual review instead of being
  rewritten

## Workbook-Style Office Mapping

The app now maps more closely to the school’s workbook flow:

- `Dashboard` behaves like the first office overview worksheet
- `Payment Desk` behaves like the collection counter sheet
- `Dues & Receipts` behaves like the working register for dues, receipts, and
  overdue follow-up
- `Students` behaves like the student master, student fee-profile, and bulk
  student add/update sheet
- `Fee Setup` behaves like the controlled live policy/default sheet with audit
  protection behind it, and it now behaves like the workbook `Fee_Setup` sheet
  for academic session and live fee values, organized as staged office work
- `Advanced` keeps the less-frequent admin tasks out of the daily path

## Canonical Configuration Model

Live fee configuration now follows one explicit model:

- `fee_policy_configs` is the canonical source for the active academic session,
  installment schedule, late fee, receipt prefix, accepted payment modes, and
  custom fee-head catalog. Phase 1 fee-head metadata is stored in the existing
  `custom_fee_heads` JSON payload rather than a separate table.
- `school_fee_defaults`, `fee_settings`, `transport_routes`, and
  `student_fee_overrides` are the editable default/override layers resolved
  beneath that policy.
- live policy/default changes should run through `/protected/fee-setup`, which
  creates a preview batch, shows impact, and only applies future or unpaid
  ledger changes after explicit confirmation.
- `/protected/master-data` remains available for direct admin maintenance of
  sessions, classes, and routes, but live workbook fee values should be saved
  through fee setup so the preview/apply audit trail stays intact.
- Standard concession profiles are shown as planned/read-only setup structure
  in Phase 1; existing student override fields remain the active concession
  mechanism.
- `/protected/setup` is first-time go-live setup only. After setup is marked
  complete, the wizard stays readable but no longer acts as a live-edit path
  for policy/default changes.

System-wide propagation:

- fee setup, setup readiness, dashboard policy notes, payment entry, landing
  and auth policy copy, defaulters, reports, and settings all read the active
  policy from the same canonical service
- payment entry enforces the current accepted payment modes and current receipt
  prefix
- workbook-mode transport defaults resolve from annual route fee, while the
  legacy per-installment route amount remains compatibility-only for older
  sessions

Historically locked behavior:

- receipts, payments, payment adjustments, and audit logs stay append-only
- paid or partially paid installment rows are never silently rewritten by
  policy/default changes
- configuration apply only touches future or unpaid installment rows; blocked
  paid, partial, or adjusted rows are logged for manual review

## Current Repo State

This summary reflects the repo state on April 23, 2026.

Implemented core:

- school-branded landing page at `app/page.tsx`
- internal auth flow under `app/auth` with login, forgot password, update
  password, auth confirm handler, and error routes
- protected admin workspace under `app/protected`
- read-only dashboard with live fee collection, outstanding, class-wise, follow-up, and attention summaries
- Student Master with list, add, detail, and edit flows
- student spreadsheet import with CSV/XLSX upload, header mapping, dry-run
  validation, duplicate detection, batch tracking, and valid-row-only save
- admin-only first-time setup wizard with academic-session selection, class and
  route master-data setup, school/class defaults, readiness checklist, and
  explicit go-live completion marker; once setup is marked complete, the wizard
  stops acting as a live-edit path for fee policy/default changes
- fee setup with a staged workbook-style screen for academic session, master
  fee heads, 4 due dates, flat late fee, new/old academic fee, class-wise
  annual tuition, and route-wise annual transport fee, with mandatory impact
  preview and explicit publish/apply workflow
- AY `2026-27` workbook parity with `workbook_v1` fee calculation, seeded class
  tuition defaults, seeded annual route defaults, workbook student status,
  other adjustment, and late-fee-waiver support
- session ledger recalculation workflow for previewing and applying safe
  unpaid/future-ledger changes while flagging paid or partially paid rows for
  manual review
- payment entry with append-only posting through RPCs
- workbook-style dues views for transactions, installment tracker, master fee
  statements, class register, defaulters, and today’s receipts/collection
- student ledger with chronological history and linked adjustment trail
- receipt list, workbook-aligned printable receipt, and printable master fee
  statement per student
- defaulters and outstanding reporting
- reports module with filterable tables and CSV export at
  `/protected/reports/export`
- dedicated master-data management for academic sessions, classes, and
  transport routes under `/protected/master-data`, plus reference-only
  visibility of current fee heads and payment modes
- deployment/settings validator page with env checks, policy notes, and recent
  configuration batch history
- explicit `/protected/access-denied` page for permission-denied cases inside
  the protected shell
- admin-only staff management with role assignment, activation control, and
  password reset
- self password change for logged-in staff
- Supabase RLS on core tables
- audit triggers on core tables
- append-only enforcement on receipts, payments, payment adjustments, and audit
  logs
- 17 tracked SQL migrations covering schema, fee setup, policy preview/apply,
  payments, RBAC, import workflow, setup completion, ledger regeneration, and
  finance-office controls
- database-level RBAC using `public.staff_role` plus permission-aware policies

Incomplete or intentionally deferred:

- PDF receipt generation is not implemented; printable HTML exists
- PDF report export is not implemented; CSV export works
- automated bank reconciliation is not implemented
- test infrastructure exists, and `tests/fee-rules.test.ts` covers fee-rule
  normalization and installment due-date behavior

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
  student bulk upload/update workflow
- `app/protected/setup/page.tsx`
  first-time setup wizard and go-live readiness checklist
- `app/protected/fee-setup/page.tsx`
  fee defaults and overrides
- `app/protected/fee-setup/generate/page.tsx`
  ledger recalculation preview/apply
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
- `app/protected/access-denied/page.tsx`
  explicit protected-shell permission denied screen

Important supporting code:

- `components/admin/*`
- `components/students/*`
- `components/imports/*`
- `components/fees/*`
- `components/setup/*`
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
- `lib/fees/*` fee policy and ledger recalculation services
- `lib/setup/*`
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

Current important views:

- `public.v_outstanding_summary`
- `public.v_installment_balances`
- `public.v_workbook_student_financials`
- `public.v_workbook_installment_balances`

Current operating posture:

- RLS is enabled on core operational tables
- audit triggers are present
- payments, receipts, payment adjustments, and audit logs are append-only
- no delete-heavy workflow should be introduced for operational finance records
- import work remains staged and traceable by batch and row
- correction flows should use explicit adjustments or reversal-style entries

Non-negotiable rule:

- do not build UI that rewrites historical payment facts

## Safe Live Policy Changes

Admins should use this sequence for live fee changes:

1. open `/protected/fee-setup`
2. edit the academic session label, 4 due dates, fee policy values, class
   tuition table, or route transport fee table
3. run preview first and review the changed fields, affected students, and
   blocked rows
4. confirm apply only after reviewing the impact summary
5. let the apply step run ledger-safe regeneration
6. review blocked rows in settings if paid or partially paid installments were
   protected from rewrite

What the apply step does:

- saves the requested configuration change
- regenerates only future or unpaid installment rows in scope
- never rewrites paid receipts, payments, or adjustment history
- marks locked rows for manual review instead of mutating them
- records the batch in `config_change_batches` and the blocked rows in
  `config_change_blocked_installments`

## Current School Defaults

Active defaults in docs and config:

- app mode: `internal-admin`
- active academic session: `2026-27`
- active fee engine: `workbook_v1`
- receipt prefix: `SVP`
- late fee: flat Rs 1000
- installment due dates: 20-04-2026, 20-07-2026, 20-10-2026, 20-01-2027
- default installment count: 4
- accepted payment modes: Cash, UPI, Bank transfer, Cheque
- Class 12 Science annual fee default: Rs 38000
- new student academic fee: Rs 1100
- old student academic fee: Rs 500
- books are excluded from workbook-mode fee calculation for AY `2026-27`
- Phase 1 fee-head metadata does not change AY `2026-27` workbook calculation

Historical values that may appear in old notes or spreadsheets but are not
current policy:

- due dates on the 10th
- late fee at Rs 50/day
- stale workbook note showing flat late fee Rs 3000

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
