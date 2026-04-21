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

- student master
- fee settings
- collection entry
- receipts
- dashboard
- defaulters/outstanding views
- later spreadsheet import

## Current Repo Structure

Main routes and modules in the repo today:

- `app/page.tsx`
  school-branded internal app landing page
- `app/auth/*`
  login, signup/bootstrap, password reset, auth confirmation, error screens
- `app/protected/page.tsx`
  main dashboard
- `app/protected/students/page.tsx`
  student master area
- `app/protected/imports/page.tsx`
  import/migration area
- `app/protected/fee-structure/page.tsx`
  fee settings area
- `app/protected/collections/page.tsx`
  collection desk area
- `app/protected/reports/page.tsx`
  reports area
- `app/protected/settings/page.tsx`
  environment and policy/settings area
- `components/admin/*`
  dashboard shell, cards, nav, and page headers
- `lib/config/*`
  school defaults, fee rules, navigation
- `lib/auth/roles.ts`
  role model
- `supabase/schema.sql`
  schema, audit triggers, RLS, reporting view
- `supabase/schema/*`
  reserved for future split schema/reference files
- `supabase/migrations/*`
  ordered SQL migration history for Supabase CLI workflows

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
- use `lib/supabase/session.ts` as the placeholder entry point for future
  role-aware session checks
- keep internal staff access invite-oriented when possible
- never expose `SUPABASE_SERVICE_ROLE_KEY` in browser code

Current local public Supabase project context:

- project ref: `lsdrvovwybzspcvbdcir`
- `NEXT_PUBLIC_SUPABASE_URL=https://lsdrvovwybzspcvbdcir.supabase.co`

Current site URL behavior:

- prefer explicit `NEXT_PUBLIC_SITE_URL`
- fall back to `VERCEL_PROJECT_PRODUCTION_URL`
- then fall back to `VERCEL_URL`
- use browser origin during client-side local flows when needed

## Current Domain Model

Important current tables:

- `students`
- `fee_structures`
- `fee_ledgers`
- `fee_collections`
- `import_batches`
- `audit_log`

Important current enums:

- `staff_role`
- `student_status`
- `record_source`
- `ledger_status`
- `payment_mode`
- `import_batch_status`
- `audit_action`

Important current database behavior:

- audit triggers capture inserts, updates, and deletes
- `set_updated_at()` keeps operational timestamps fresh
- `v_outstanding_summary` supports outstanding reporting
- no delete policies exist for core operational tables

## Product And Data Constraints

Future agents should assume:

- the app is internal-admin first
- history matters more than convenience edits
- simple UI is preferred over a clever UI
- records should be easy to verify later
- imports should be traceable and staged

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
- generic tutorial replacements for current branded pages
