# Shri Veer Patta Senior Secondary School Fee Admin

Internal fee management web app for one school:
Shri Veer Patta Senior Secondary School.

This app is for office and accounts staff only. It is not a parent portal and
it is not a multi-school SaaS product.

## Product Intent

The app exists to replace workbook-driven fee operations gradually without
losing auditability.

Current priority areas:

- student master
- fee settings
- payment entry
- append-only ledger behavior
- printable receipts
- dashboard
- defaulters reporting
- staged spreadsheet import
- internal staff login and access control

## Current Repo State

As of April 21, 2026, the repo implementation status is as follows:

**Fully Functional Core Modules:**
- Branded landing page and internal auth flow (`app/page.tsx`, `app/auth/**`)
- Protected admin workspace dashboard (`app/protected/page.tsx`) with real-time aggregates via `v_installment_balances`
- Student Master (`app/protected/students`) with add, edit, and detail views
- Spreadsheet Import (`app/protected/imports`) with CSV/XLSX upload, column mapping, dry-run validation, duplicate detection, batch tracking, and valid-row-only save
- Fee Setup & Structure (`app/protected/fee-setup`, `app/protected/fee-structure`) with idempotent Session Ledger Generation
- Payment Entry (`app/protected/payments`, also accessible at `app/protected/collections`) with append-only RPC (`post_student_payment`)
- Ledger & Adjustments (`app/protected/ledger`) with chronological per-student history and linked adjustment entries
- Receipts (`app/protected/receipts`) with printable per-receipt view
- Defaulters Reporting (`app/protected/defaulters`) based on `v_installment_balances`
- Reports (`app/protected/reports`) with on-page filterable tables and working CSV export at `/protected/reports/export`
- Staff management (`app/protected/staff`) for admin-only staff creation, role changes, deactivation, and password resets
- Self password change (`app/protected/password`)
- Database integrity: RLS enabled, audit triggers present, append-only financial tables enforced
- Role-Based Access Control (RBAC): `public.staff_role` enum and RLS policies enforce `admin`, `accountant`, and `read_only_staff`
- 7 tracked migrations covering schema, RBAC alignment, auth/profile sync, and import workflow

**Incomplete Areas (proceed with caution):**
- PDF receipts: Printable HTML view exists; no server-side PDF generation
- Report PDF export: CSV export works; PDF generation is not implemented
- Testing: `tests/` scaffolding exists; there are still no test files

## Stack

- Next.js App Router
- React 19
- TypeScript
- Tailwind CSS
- shadcn/ui primitives
- Supabase auth + database
- Vercel deployment target

## Route Map

```text
app/
  page.tsx
  auth/
    login/
    forgot-password/
    update-password/
    confirm/route.ts
    error/
  protected/
    page.tsx
    students/
      [studentId]/
    imports/
    fee-setup/
      generate/
    fee-structure/
    collections/
    payments/
    ledger/
    receipts/
      [receiptId]/
    defaulters/
    reports/
      export/route.ts
    staff/
    password/
    settings/
proxy.ts
scripts/
  bootstrap-staff.mjs
```

## Auth And Safety Notes

- `proxy.ts` refreshes Supabase auth cookies for SSR
- only `/protected` routes are proxy-redirected to `/auth/login`
- login and logout run through server actions so cookies and redirects stay aligned with SSR
- public signup is disabled
- initial staff accounts are provisioned through the server-only bootstrap script
- `public.users` is synchronized from `auth.users` metadata for RBAC and audit visibility
- unknown or missing role mappings resolve to least privilege, not admin
- `SUPABASE_SERVICE_ROLE_KEY` must remain server-only

## Environment Variables

Copy `.env.local.example` to `.env.local` for local development.

Required in every environment:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Required server-only for staff bootstrap/admin flows:

```env
SUPABASE_SERVICE_ROLE_KEY=
```

App metadata defaults:

```env
NEXT_PUBLIC_SCHOOL_NAME=Shri Veer Patta Senior Secondary School
NEXT_PUBLIC_APP_MODE=internal-admin
```

Important:

- do not leave placeholder values in any deployed environment
- set `NEXT_PUBLIC_SITE_URL` explicitly in Vercel production
- never expose `SUPABASE_SERVICE_ROLE_KEY` in `NEXT_PUBLIC_*`

## Local Setup

1. Install Node.js 20 or newer.
2. Create `.env.local` from `.env.local.example`.
3. Paste the real Supabase Project URL and Publishable key.
4. Add `SUPABASE_SERVICE_ROLE_KEY` for local bootstrap/admin flows.
5. Install dependencies with `npm install`.
6. Start the app with `npm run dev`.

Useful commands:

```bash
npm run dev
npm run lint
npm run typecheck
npm run check
npm run build
npm run bootstrap:staff
```

## Initial Staff Bootstrap

Use the bootstrap script once from a trusted terminal. Passwords are supplied at
runtime and are not stored in repo files.

Runtime env vars expected by the script:

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

The script is idempotent. It creates or updates these three staff accounts:

- `raj@vpps.co.in` as `admin`
- `accounts@vpps.co.in` as `accountant`
- `staff@vpps.co.in` as `read_only_staff`

It also writes matching rows into `public.users`.

Bootstrap prerequisites:

- `SUPABASE_SERVICE_ROLE_KEY` must be present server-side
- tracked migrations must be applied, especially the auth/profile sync migration
- public signup should remain disabled in Supabase Auth

## Ongoing Staff Management

After bootstrap:

- admin signs in and opens `/protected/staff`
- admin can create staff accounts and assign `admin`, `accountant`, or `read_only_staff`
- admin can optionally set an initial password while creating a new staff account
- if initial password is left blank for a new account, the app generates a temporary password and shows it once to the admin
- admin can reset passwords for existing staff accounts
- admin can deactivate accounts without deleting audit history
- each staff user can change their own password at `/protected/password`

## Manual Configuration

### 1. Supabase

1. Create the project.
2. Run `supabase/schema.sql` in SQL Editor, or apply the tracked migrations.
3. In `Authentication -> URL Configuration`, set `Site URL`:
   local: `http://localhost:3000`
   production: your final `https://...` domain
4. Add redirect URLs for:
   `http://localhost:3000/auth/login`
   `http://localhost:3000/auth/update-password`
   your production `https://<domain>/auth/login`
   your production `https://<domain>/auth/update-password`
5. Copy the Project URL, Publishable key, and Service Role key into the correct server/public env vars.
6. Keep email/password signup disabled in Supabase Auth for this internal app.

### 2. Vercel

Add these environment variables in Project Settings:

```env
NEXT_PUBLIC_SUPABASE_URL=<real project url>
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<real publishable key>
NEXT_PUBLIC_SITE_URL=https://<your production domain>
SUPABASE_SERVICE_ROLE_KEY=<server only service role key>
NEXT_PUBLIC_SCHOOL_NAME=Shri Veer Patta Senior Secondary School
NEXT_PUBLIC_APP_MODE=internal-admin
```

### 3. GitHub

- keep the repository private if school policy requires it
- no runtime GitHub secrets are required for the app itself

## Deployment Checklist

1. Repo pushed to GitHub.
2. Supabase project created and schema applied.
3. `NEXT_PUBLIC_SUPABASE_URL` set locally and in Vercel.
4. `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` set locally and in Vercel.
5. `NEXT_PUBLIC_SITE_URL` set to the final production `https://` domain.
6. `SUPABASE_SERVICE_ROLE_KEY` set server-side in local and Vercel environments.
7. Supabase `Site URL` and redirect URLs match the real deployed domain.
8. `npm run bootstrap:staff` executed once with runtime password env vars.
9. Public signup remains disabled in Supabase Auth.
10. Production deployment succeeds on Vercel.
11. Verify:
    `/auth/login`
    `/protected`
    `/protected/staff`
    `/protected/password`
    protected-route redirect when logged out
    login redirect back into the protected area

## Current Role Structure

Current staff roles defined in `lib/auth/roles.ts` and database `public.staff_role` enum are:

- `admin`
- `accountant`
- `read_only_staff`

These are enforced at the database level via Supabase RLS and
`public.has_permission()`.

## Current Operational Defaults

- late fee: flat Rs 1000
- installment due dates: 20 April, 20 July, 20 October, 20 January
- default installment count: 4
- accepted payment modes: Cash, UPI, Bank transfer, Cheque
- receipt prefix: `SVP`
- app mode: `internal-admin`

## Operating Rules

- keep the app internal-admin first
- preserve audit trails on student, fee, collection, and import data
- do not build history-rewriting payment workflows
- use correction or reversal style entries instead of editing payment history
- avoid delete-heavy workflows for operational records
- keep route contracts under `app/auth` and `app/protected` stable
- update docs when auth, env, or schema intent changes
