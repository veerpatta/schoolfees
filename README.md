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

## Current Repo State

As of April 21, 2026, the repo implementation status is as follows:

**Fully Functional Core Modules:**
- Branded landing page and auth flow (`app/page.tsx`, `app/auth/**`)
- Protected admin workspace dashboard (`app/protected/page.tsx`) with real-time aggregates via `v_installment_balances`.
- Student Master (`app/protected/students`)
- Spreadsheet Import (`app/protected/imports`) with CSV/XLSX upload, column mapping, dry-run validation, duplicate detection, batch tracking, and valid-row-only save.
- Fee Setup & Structure (`app/protected/fee-setup`, `app/protected/fee-structure`)
- Payment Entry (`app/protected/payments`) with append-only RPC (`post_student_payment`).
- Ledger & Receipts (`app/protected/ledger`, `app/protected/receipts`)
- Defaulters Reporting (`app/protected/defaulters`)
- Deployment Settings Validator (`app/protected/settings`)
- Database integrity measures (RLS enabled, append-only triggers, audit event triggers).

**Scaffolded / Incomplete Modules (UI exists, logic incomplete):**
- Advanced Reports (`app/protected/reports`): Static report catalog; actual generation of complex reports (CSV/PDF) is not implemented.
- Role-Based Access Control (RBAC): `lib/auth/roles.ts` exists, but Supabase RLS currently allows operations for any `authenticated` user and does not strictly enforce specific staff roles (e.g., admin vs accountant) on the backend.

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
    sign-up/
    sign-up-success/
    forgot-password/
    update-password/
    confirm/route.ts
    error/
  protected/
    page.tsx
    students/
    imports/
    fee-setup/
    fee-structure/
    collections/
    payments/
    ledger/
    receipts/
    defaulters/
    reports/
    settings/
proxy.ts
```

## Auth And Safety Notes

- `proxy.ts` refreshes Supabase auth cookies for SSR.
- Only `/protected` routes are proxy-redirected to `/auth/login`.
- `app/protected/layout.tsx` still performs a server-side auth check.
- `/auth/sign-up` is disabled by default and only opens when
  `NEXT_PUBLIC_ENABLE_BOOTSTRAP_SIGNUP=true`.
- Unknown or missing role claims no longer default to admin.
- `SUPABASE_SERVICE_ROLE_KEY` is optional and must remain server-only.

## Environment Variables

Copy `.env.local.example` to `.env.local` for local development.

Required in every environment:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

Recommended:

```env
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_ENABLE_BOOTSTRAP_SIGNUP=false
```

Optional server-only:

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
- keep `NEXT_PUBLIC_ENABLE_BOOTSTRAP_SIGNUP=false` except during first-admin
  bootstrap
- never expose `SUPABASE_SERVICE_ROLE_KEY` in `NEXT_PUBLIC_*`

## Local Setup

1. Install Node.js 20 or newer.
2. Create `.env.local` from `.env.local.example`.
3. Paste the real Supabase Project URL and Publishable key.
4. Leave bootstrap signup disabled unless you are creating the first admin.
5. Install dependencies with `npm install`.
6. Start the app with `npm run dev`.

Useful commands:

```bash
npm run dev
npm run lint
npm run typecheck
npm run check
npm run build
```

## Manual Configuration

### 1. Supabase

You must configure these items manually in the Supabase dashboard:

1. Create the project.
2. Run `supabase/schema.sql` in the SQL Editor, or apply the tracked migrations.
3. In `Authentication -> URL Configuration`, set `Site URL`:
   local: `http://localhost:3000`
   production: your final `https://...` Vercel or custom domain
4. In `Authentication -> URL Configuration`, add redirect URLs for:
   `http://localhost:3000/auth/login`
   `http://localhost:3000/auth/update-password`
   your production `https://<domain>/auth/login`
   your production `https://<domain>/auth/update-password`
5. If you want auth flows to work on preview deployments, add the matching
   preview URL pattern to Supabase Redirect URLs as well.
6. In `Settings -> API` or `Connect`, copy the Project URL and Publishable key
   into local env and Vercel env.
7. Only copy the service role key if you later add a server-only workflow that
   truly needs it.
8. Create or invite the first internal staff account.
9. Disable open signups in Supabase Auth after the initial bootstrap account is
   created.

### 2. GitHub

You must configure these items manually in GitHub:

1. Push this repo to a GitHub repository.
2. Keep the repository private if school policy requires it.
3. Set the intended production branch, usually `main`.
4. Install or authorize the Vercel GitHub integration for this repository so
   Vercel can build from pushes and pull requests.
5. Add branch protection or review rules if you want controlled production
   deploys.

What you do not need in GitHub right now:

- no GitHub Actions secrets are required for runtime deployment
- no GitHub-side env vars are used by the running app

### 3. Vercel

You must configure these items manually in Vercel:

1. Import the GitHub repository as a new Vercel project.
2. Confirm the framework preset is `Next.js`.
3. Add these environment variables in Project Settings for Production:

```env
NEXT_PUBLIC_SUPABASE_URL=<real project url>
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<real publishable key>
NEXT_PUBLIC_SITE_URL=https://<your production domain>
NEXT_PUBLIC_ENABLE_BOOTSTRAP_SIGNUP=false
NEXT_PUBLIC_SCHOOL_NAME=Shri Veer Patta Senior Secondary School
NEXT_PUBLIC_APP_MODE=internal-admin
```

4. Add the same variables to Preview if you want preview deployments to load the
   app correctly.
5. Add `SUPABASE_SERVICE_ROLE_KEY` only if a server-only admin flow actually
   requires it.
6. If you rely on Vercel system URL fallbacks, keep `Automatically expose System
   Environment Variables` enabled. This app can read
   `VERCEL_PROJECT_PRODUCTION_URL` and `VERCEL_URL`, but production should still
   set `NEXT_PUBLIC_SITE_URL` explicitly.
7. Deploy once, then verify the final production domain is the same domain you
   configured in Supabase Auth.

## Deployment Checklist

1. Repo pushed to GitHub.
2. Supabase project created and schema applied.
3. `NEXT_PUBLIC_SUPABASE_URL` set locally and in Vercel.
4. `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` set locally and in Vercel.
5. `NEXT_PUBLIC_SITE_URL` set to the final production `https://` domain.
6. `NEXT_PUBLIC_ENABLE_BOOTSTRAP_SIGNUP=false` in preview and production.
7. Supabase `Site URL` and redirect URLs match the real deployed domain.
8. First staff admin account created or invited.
9. Open signup disabled in Supabase after bootstrap.
10. Production deployment succeeds on Vercel.
11. Verify:
    `/auth/login`
    `/protected`
    password reset flow
    protected-route redirect when logged out
    login redirect back into the protected area

## Current Role Placeholders

Current shell-level role placeholders in `lib/auth/roles.ts` are:

- `admin`
- `accountant`
- `read_only_staff`

These are still UI and workflow placeholders rather than a fully enforced
database-backed staff authorization model.

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
