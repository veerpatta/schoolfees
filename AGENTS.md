# AGENTS.md

## Project Identity

This project is an internal fee management app for one school:
Shri Veer Patta Senior Secondary School.

It is not a parent portal.

Primary goals:

- simplicity for office/accounts staff
- auditability of fee records
- gradual migration from workbook-based workflow

## Current Documented State

This file reflects the repo state as documented on April 21, 2026.

Current implementation already includes:

- branded landing page at `app/page.tsx`
- auth flow under `app/auth`
- protected internal admin workspace under `app/protected`
- Supabase SSR client wiring under `utils/supabase` and `lib/supabase`
- Next.js `proxy.ts` for session refresh and protected-route redirects
- starter database schema in `supabase/schema.sql`
- settings page with env checklist and role model

Do not overwrite the landing page with generic tutorial content, sample
`todos` code, or a boilerplate Supabase demo. Preserve the school-specific
internal-admin UX unless the user explicitly requests a redesign.

## Tech And Architecture

- Framework: Next.js App Router
- Language: TypeScript
- Styling: Tailwind CSS + shadcn/ui primitives
- Auth/DB: Supabase
- Deployment: Vercel
- Canonical Supabase helper location: `utils/supabase`
- Stable app import paths: `lib/supabase/*`

Current package versions worth preserving context for:

- `next`: `16.2.4`
- `react`: `19.2.5`
- `react-dom`: `19.2.5`
- `@supabase/supabase-js`: `2.104.0`
- `@supabase/ssr`: `0.10.2`

## Current Public Environment Context

The local workspace is currently configured against this Supabase project:

- Project ref: `lsdrvovwybzspcvbdcir`
- `NEXT_PUBLIC_SUPABASE_URL=https://lsdrvovwybzspcvbdcir.supabase.co`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_-4FNHET8cCZIOgzLp-PBGQ_2va4MTWm`

These are client-visible values and are safe to appear in browser code.

Server-only rules:

- `SUPABASE_SERVICE_ROLE_KEY` must stay server-only
- never move service keys into `NEXT_PUBLIC_*`
- if env variables change, update:
  - `.env.example`
  - `.env.local.example`
  - `README.md`
  - `app/protected/settings/page.tsx`
  - this file when the operational context changes

## Domain Defaults (Do Not Change Without Approval)

- Late fee: flat Rs 1000
- Installment due dates: 20 April, 20 July, 20 October, 20 January
- Default installment count: 4
- Class 12 Science annual fee default: Rs 38000
- Accepted payment modes: Cash, UPI, Bank transfer, Cheque
- Receipt prefix: `SVP`
- App mode: `internal-admin`
- School display name default: `Shri Veer Patta Senior Secondary School`

## Current App Structure Notes

- Landing page: `app/page.tsx`
- Auth screens: `app/auth`
- Internal workspace: `app/protected`
- Workbook migration page: `app/protected/imports`
- Student master page: `app/protected/students`
- Fee structure page: `app/protected/fee-structure`
- Collection desk page: `app/protected/collections`
- Reports page: `app/protected/reports`
- Settings page: `app/protected/settings`
- Shared admin shell/components: `components/admin`
- School and fee defaults: `lib/config`
- Role model: `lib/auth/roles.ts`
- Navigation model: `lib/config/navigation.ts`
- Supabase schema: `supabase/schema.sql`
- Proxy entry point: `proxy.ts`

## Current Supabase Wiring

Canonical helpers:

- `utils/supabase/client.ts`
  browser client via `createBrowserClient`
- `utils/supabase/server.ts`
  server client via `createServerClient`
- `utils/supabase/middleware.ts`
  session refresh and auth redirect behavior

Stable re-export layer:

- `lib/supabase/client.ts`
- `lib/supabase/server.ts`
- `lib/supabase/proxy.ts`

Server-only admin access:

- `lib/supabase/admin.ts`
  requires `SUPABASE_SERVICE_ROLE_KEY`

Auth/session expectations:

- keep `proxy.ts` active for cookie refresh
- use `supabase.auth.getClaims()` for server-side auth checks
- keep protected pages behind internal staff authentication
- prefer invite-oriented staff access
- if bootstrap signup is temporarily used, disable open signup afterward

If you change Supabase auth/session wiring, update:

- `utils/supabase/*`
- `lib/supabase/*`
- `proxy.ts`
- `README.md`
- this file

## Current Database And Audit Context

The schema currently includes these enum types:

- `staff_role`
- `student_status`
- `record_source`
- `ledger_status`
- `payment_mode`
- `import_batch_status`
- `audit_action`

The schema currently includes these tables:

- `staff_profiles`
- `import_batches`
- `students`
- `fee_structures`
- `fee_ledgers`
- `fee_collections`
- `audit_log`

The schema also includes:

- `set_updated_at()` trigger function
- `capture_audit_event()` trigger function
- `public.v_outstanding_summary` view

Security/data posture:

- RLS is enabled on all core exposed tables
- authenticated users currently have read/insert/update policies
- no delete policies are present for core operational tables
- audit triggers are attached to core tables
- operational records should favor correction flows over deletes

## Data And Audit Expectations

- Preserve `created_at` / `updated_at` on student, fee, collection, and import data.
- Keep `created_by` / `updated_by` usage intact where present.
- Keep workbook import batches traceable to source files and row counts.
- Avoid introducing delete-heavy workflows for ledgers or collections.
- If a correction flow is added, keep it audit-safe and reversible where practical.

## Role And Access Model

Current roles:

- `admin`
  policy, user access, correction workflow, staff management
- `accounts`
  fee plans, collections, reconciliation, reports
- `clerk`
  collections and dues review without policy access

If role behavior changes, update:

- `lib/auth/roles.ts`
- relevant UI copy under `app/protected/settings`
- `README.md`
- this file

## Working Rules For Future Agents

1. Keep this an internal admin app.
2. Prioritize clear workflows over complex abstractions.
3. Preserve audit fields and history whenever adding data writes.
4. Avoid breaking existing route contracts under `app/auth` and `app/protected`.
5. Keep env handling secure:
   `NEXT_PUBLIC_*` values can be client-visible.
   Service keys must stay server-only.
6. Prefer incremental migration features such as import, reconcile, and verify over hard cutover.
7. Do not replace branded school pages with generic framework or tutorial samples.
8. Keep README and this file aligned with real repo behavior when architecture or operating rules change.
9. Prefer stable import paths from `lib/supabase/*` in app code unless there is a deliberate reason to use `utils/supabase/*` directly.

## Change Control Requirements

Any fee-rule change must be reflected in:

- `lib/config/fee-rules.ts`
- relevant settings page UI
- `README.md`
- `AGENTS.md`

Any env/setup change must be reflected in:

- `.env.example`
- `.env.local.example`
- `app/protected/settings/page.tsx`
- `README.md`
- `AGENTS.md` if the operational context changes

Any schema intent change should be reflected in:

- `supabase/schema.sql`
- relevant UI or workflow pages
- `README.md`
- `AGENTS.md` when future agents need the context

## Suggested Next Builds

- Student master import from workbook CSV
- Fee ledger generation job per session
- Receipt template + print export
- Outstanding report filters by class/date
- Role-based action restrictions
