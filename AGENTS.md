# AGENTS.md

## Project Intent

This project is an internal fee management app for one school:
Shri Veer Patta Senior Secondary School.

It is not a parent portal.

Primary goals:
- Simplicity for office/accounts staff
- Auditability of fee records
- Gradual migration from workbook-based workflow

## Tech and Architecture

- Framework: Next.js App Router
- Language: TypeScript
- Styling: Tailwind CSS + shadcn/ui primitives
- Auth/DB: Supabase
- Deployment: Vercel

## Domain Defaults (Do Not Change Without Approval)

- Late fee: flat Rs 1000
- Installment due dates: 20 April, 20 July, 20 October, 20 January
- Class 12 Science annual fee default: Rs 38000

## Working Rules for Future Agents

1. Keep this an internal admin app.
2. Prioritize clear workflows over complex abstractions.
3. Preserve audit fields and history whenever adding data writes.
4. Avoid breaking existing route contracts under app/auth and app/protected.
5. Keep env handling secure:
   - `NEXT_PUBLIC_*` values can be client-visible
   - service keys must stay server-only
6. Prefer incremental migration features (import, reconcile, verify) over hard cutover.
7. Any fee-rule change must be reflected in:
   - `lib/config/fee-rules.ts`
   - relevant settings page UI
   - README section for active defaults

## Current App Structure Notes

- Landing page at `app/page.tsx`
- Auth screens under `app/auth`
- Internal workspace under `app/protected`
- Workbook migration page at `app/protected/imports`
- Shared admin shell/components under `components/admin`
- School and fee defaults under `lib/config`
- Supabase schema at `supabase/schema.sql`

## Auth Posture

- Keep this invite-oriented for internal staff.
- Prefer creating or inviting staff users from Supabase Auth.
- If bootstrap signup is used for the first admin, disable open signup afterward.

## Data and Audit Expectations

- Student, fee, collection, and import tables should preserve `created_at` / `updated_at`.
- Prefer correction flows and audit-safe history over delete-heavy logic.
- Keep workbook import batches traceable to source files and row counts.

## Suggested Next Builds

- Student master import from workbook CSV
- Fee ledger generation job per session
- Receipt template + print export
- Outstanding report filters by class/date
- Role-based action restrictions
