# Shri Veer Patta Senior Secondary School Fee Admin

Internal fee management web app for one school:
Shri Veer Patta Senior Secondary School.

This project is for school office and accounts staff only.
It is not a parent portal.

## Project Intent

The app exists to replace workbook-driven fee operations gradually without
losing auditability. The product scope should stay narrow and operational:

- maintain student master records
- import workbook data in traceable batches
- define fee structures and ledger defaults
- configure school-wide defaults, class defaults, and student overrides
- record collections and receipts
- prepare reports for reconciliation and audit

## Current Repo State

As documented on April 21, 2026, the repo already includes:

- branded landing page at `app/page.tsx`
- auth pages under `app/auth`
- protected internal workspace under `app/protected`
- Supabase SSR auth wiring with browser, server, admin, and proxy helpers
- server-side session guard helper at `lib/supabase/session.ts`
- initial fee schema at `supabase/schema.sql`
- dedicated migration folder at `supabase/migrations`
- internal role model for `admin`, `accounts`, and `clerk`
- settings page that surfaces environment and policy assumptions

Do not replace the landing page with a generic Supabase tutorial sample or a
`todos` demo page. The current homepage is intentionally school-specific.

## Active Domain Defaults

These are current app-wide assumptions and should not be changed casually:

- Late fee: flat Rs 1000
- Installment due dates: 20 April, 20 July, 20 October, 20 January
- Default installment count: 4
- Class 12 Science annual fee default: Rs 38000
- Accepted payment modes: Cash, UPI, Bank transfer, Cheque
- Receipt prefix: `SVP`
- App mode: `internal-admin`

If fee policy changes, update all of the following together:

- `lib/config/fee-rules.ts`
- relevant settings UI under `app/protected/settings`
- this README
- `AGENTS.md`

## Tech Stack And Versions

- Next.js App Router: `16.2.4`
- React: `19.2.5`
- TypeScript: `^5`
- Tailwind CSS: `^3.4.1`
- shadcn/ui primitives via Radix UI
- Supabase JS: `2.104.0`
- Supabase SSR: `0.10.2`
- Node.js: `>=20.0.0`
- Deployment target: Vercel

## Route And Module Map

```text
app/
  page.tsx                        Landing page for the internal admin app
  auth/
    login/                        Staff login
    sign-up/                      Bootstrap signup flow if temporarily enabled
    sign-up-success/              Signup confirmation screen
    forgot-password/              Password reset request
    update-password/              Password reset completion
    confirm/route.ts              Auth confirmation route
    error/                        Auth error screen
  protected/
    page.tsx                      Main internal operations dashboard
    students/                     Student master workflow
    imports/                      Workbook migration batches
    fee-setup/                    School defaults, class defaults, student overrides
    fee-structure/                Alias route to fee-setup
    collections/                  Counter collection workflow
    reports/                      Reporting and audit outputs
    settings/                     Policy, roles, and env checklist
components/
  admin/                          Internal dashboard shell and cards
  ui/                             Reusable UI primitives
lib/
  auth/                           Staff roles and permissions
  config/                         School profile, nav, fee rules
  db/                             Shared domain types
  helpers/                        Formatting helpers
  supabase/                       Stable import paths that re-export helpers
    session.ts                    Server-side session/auth placeholder helpers
utils/
  supabase/                       Canonical Supabase SSR helper implementations
supabase/
  schema.sql                      Starter database schema, RLS, audit, view
  schema/                         Reserved folder for future split schema files
  migrations/                     Ordered SQL migrations for Supabase CLI flow
proxy.ts                          Next.js proxy entry point for session refresh
```

## Current Navigation Model

Protected navigation currently includes:

- `/protected` for overview
- `/protected/students`
- `/protected/imports`
- `/protected/fee-structure`
- `/protected/collections`
- `/protected/reports`
- `/protected/settings`

## Supabase Project Context

The local workspace is currently wired to this Supabase project:

- Project ref: `lsdrvovwybzspcvbdcir`
- Project URL: `https://lsdrvovwybzspcvbdcir.supabase.co`

Current local public environment values in `.env.local` should look like:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_REPLACE_WITH_REAL_KEY
```

These values are public client-side values. Do not store server-only keys in
`NEXT_PUBLIC_*` variables.

## Supabase Client Wiring

Current client/helper layout:

- `utils/supabase/client.ts`
  browser client via `createBrowserClient`
- `utils/supabase/server.ts`
  server client via `createServerClient` with cookie store support
- `utils/supabase/middleware.ts`
  session refresh logic for Next.js proxy
- `lib/supabase/client.ts`
  re-export for stable imports
- `lib/supabase/server.ts`
  re-export for stable imports
- `lib/supabase/proxy.ts`
  re-export for stable imports
- `lib/supabase/admin.ts`
  server-only admin client using `SUPABASE_SERVICE_ROLE_KEY`
- `lib/supabase/session.ts`
  placeholder helper for protected-route auth checks and future role gates

Session/auth handling notes:

- `proxy.ts` calls `updateSession(request)`
- the proxy refreshes auth cookies and redirects unauthenticated requests away
  from protected pages
- `app/protected/layout.tsx` also enforces a server-side auth check
- server-side auth checks currently use `supabase.auth.getClaims()`
- keep `SUPABASE_SERVICE_ROLE_KEY` server-only
- keep invite-oriented internal staff access as the default posture
- client auth email redirects use `NEXT_PUBLIC_SITE_URL` when set, with local
  and browser-origin fallbacks for development

## Current Environment Variables

Required public values:

```env
# Supabase Dashboard -> Connect or Settings -> API -> Project URL
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co

# Supabase Dashboard -> Connect or Settings -> API -> Publishable key
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_REPLACE_WITH_REAL_KEY
```

Recommended values:

```env
# Local: http://localhost:3000
# Production: https://your-domain.vercel.app or your custom domain
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# Server-only. Keep out of NEXT_PUBLIC_* variables.
SUPABASE_SERVICE_ROLE_KEY=PASTE_SERVER_ONLY_KEY_IF_NEEDED
```

Optional display and deployment metadata:

```env
NEXT_PUBLIC_SCHOOL_NAME=Shri Veer Patta Senior Secondary School
NEXT_PUBLIC_APP_MODE=internal-admin
```

Reference files:

- `.env.example`
- `.env.local.example`
- `lib/env.ts`
- `app/protected/settings/page.tsx`

Vercel note:

- if `NEXT_PUBLIC_SITE_URL` is missing, metadata falls back to
  `VERCEL_PROJECT_PRODUCTION_URL` and then `VERCEL_URL`
- still set `NEXT_PUBLIC_SITE_URL` yourself so Supabase email redirects use the
  exact domain you expect

## Current Database Schema Summary

`supabase/schema.sql` currently defines:

Enums:

- `staff_role`
- `class_status`
- `student_status`
- `installment_status`
- `payment_mode`
- `adjustment_type`
- `audit_action`

Tables:

- `users`
- `classes`
- `transport_routes`
- `students`
- `fee_settings`
- `school_fee_defaults`
- `student_fee_overrides`
- `installments`
- `receipts`
- `payments`
- `payment_adjustments`
- `audit_logs`

Database behavior:

- `created_at` / `updated_at` timestamps on master and due-schedule tables
- audit triggers writing row history into `audit_logs`
- RLS enabled on all exposed core tables
- authenticated read/insert/update policies on mutable admin tables
- append-only protection on `receipts`, `payments`, `payment_adjustments`, and
  `audit_logs`
- no delete policies on operational finance tables
- views `public.v_installment_balances` and `public.v_outstanding_summary` for
  due and outstanding reporting

Operational implication:

- prefer corrections and audit-safe updates over destructive delete flows
- use `payment_adjustments` for reversals/corrections instead of editing old
  payment rows
- spreadsheet import traceability should be added later when the staged import
  workflow is built

Schema and migration layout:

- `supabase/schema.sql` is the full snapshot for quick setup and review
- `supabase/migrations/*.sql` is the ordered migration history for CLI-based
  deployment
- once migration history is in use, avoid making remote schema edits directly in
  the Supabase dashboard

## Role Model

Current staff roles:

- `admin`
  policy, user access, correction workflows, staff management
- `accounts`
  fee plans, collections, reconciliation, reports
- `clerk`
  collections and dues review without policy-level control

Role source of truth:

- `lib/auth/roles.ts`

## Local Setup

1. Install Node.js 20 or newer.
2. Create `.env.local` from `.env.local.example`.
3. Paste the real Project URL and Publishable key from the Supabase dashboard.
4. Add `SUPABASE_SERVICE_ROLE_KEY` only if admin/background jobs need it.
5. Install dependencies:

```bash
npm install
```

6. Run the app:

```bash
npm run dev
```

7. Open `http://localhost:3000`.

Helpful commands:

```bash
npm run dev
npm run lint
npm run typecheck
npm run check
npm run build
```

## Supabase Setup Checklist

1. Create the Supabase project if starting from scratch.
2. Open the SQL Editor.
3. Run `supabase/schema.sql`.
4. Set the site URL in Supabase Auth.
   Local: `http://localhost:3000`
   Production: final Vercel domain
5. Add redirect URLs for:
   `/auth/login`
   `/auth/update-password`
   `/auth/confirm`
6. Create or invite the first internal staff account.
7. If bootstrap signup is used, disable open signup afterward.

## Deployment Checklist

1. Push the repo to GitHub.
2. Import the repository into Vercel.
3. Add the same environment variables in Vercel Project Settings.
4. Deploy.
5. Verify:
   `/auth/login`
   `/protected`
   password reset flow
   authenticated redirects

## Operating Rules

- Keep the product internal-only for school staff.
- Preserve audit trails on student, fee, collection, and import data.
- Avoid delete-heavy operational flows.
- Keep route contracts under `app/auth` and `app/protected` stable.
- Use `NEXT_PUBLIC_*` only for values that may be client-visible.
- Never expose `SUPABASE_SERVICE_ROLE_KEY` in browser code.
- Prefer incremental migration tooling over hard cutovers.
- Update docs when changing auth, env, routes, fee defaults, or schema intent.

## Suggested Next Builds

- Student master CSV import flow with verification
- Fee ledger generation job per session
- Receipt template and print export
- Outstanding report filters by class and date
- Role-based action restrictions backed by actual enforcement
