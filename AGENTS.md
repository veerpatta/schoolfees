# AGENTS.md

## Purpose

This repo is the internal fee management admin app for one school:
Shri Veer Patta Senior Secondary School.

Common school names used in conversation or docs:

- Shri Veer Patta Senior Secondary School
- Veer Patta School
- VPPS

This is an internal office/accounts tool. It is not a parent portal and it is
not a multi-school SaaS product.

## Read These First

When starting work, read these root docs before making product decisions:

1. `AGENTS.md`
2. `PROJECT_CONTEXT.md`
3. `MVP_SCOPE.md`
4. `SCHOOL_RULES.md`
5. `IMPORT_NOTES.md`

Use them together:

- `AGENTS.md` for fast repo and workflow guidance
- `PROJECT_CONTEXT.md` for current architecture and real file locations
- `MVP_SCOPE.md` for what belongs in the product now
- `SCHOOL_RULES.md` for fee and audit rules
- `IMPORT_NOTES.md` for later spreadsheet migration work

## Product Identity

Primary goals:

- student master
- fee settings
- payment entry
- append-only ledger behavior
- printable receipts
- dashboard
- defaulters reporting
- staged spreadsheet import (live)

Primary product qualities:

- simple office-friendly UI
- reliable workflows over fancy visuals
- clear auditability
- gradual migration from workbook-based work

## Non-Goals

Unless a user explicitly asks otherwise, do not steer the app toward:

- parent-facing features
- public self-service flows
- generic SaaS multi-tenant architecture
- tutorial/demo pages
- complex abstractions with weak operational value

## Current Repo Snapshot

This file reflects the repo state on April 21, 2026.

**Fully Implemented Core:**
- branded landing page at `app/page.tsx`
- auth flow under `app/auth` and bootstrap gated by `NEXT_PUBLIC_ENABLE_BOOTSTRAP_SIGNUP`
- protected admin workspace under `app/protected`
- real-time Dashboard, Defaulters, and Ledger modules
- Student Master with add/edit/view detail workflows
- Student Spreadsheet Import: CSV/XLSX upload, column mapping, dry-run validation, duplicate detection, batch tracking, valid-row-only save
- Fee Setup: school-wide defaults, per-class settings, per-student overrides
- idempotent Session Ledger Generation workflow for creating student installments safely
- Payment Entry: append-only posting via RPC, receipt generation
- Ledger: chronological per-student history with linked adjustment entries
- Receipts: printable per-receipt view
- Reports: on-page filterable tables for Outstanding, Daily Collection, Receipt Register, Student Ledger, and Import Verification; working CSV export at `/protected/reports/export`
- Deployment Settings Validator showing env checks and policy notes
- append-only behavior enforced by RPCs and DB triggers on receipts, payments, payment_adjustments, and audit_logs
- 6 tracked migrations covering schema, RBAC alignment, and import workflow
- Role-Based Access Control (RBAC): `public.staff_role` enum and RLS policies enforce `admin`, `accountant`, and `read_only_staff` strictly at the database layer

**Incomplete / Proceed with Caution:**
- **PDF receipts**: printable HTML view exists but no server-side PDF generation.
- **Advanced report export — PDF**: CSV export is working; PDF is not implemented.
- **Testing**: `tests/` directory and `vitest.config.ts` exist but no test files are written yet.

Do not replace the existing school-branded landing page with generic tutorial
content or Supabase sample code unless the user explicitly requests that.

## Key Real Paths

- landing page: `app/page.tsx`
- auth routes: `app/auth/*`
- protected dashboard: `app/protected/page.tsx`
- students list: `app/protected/students/page.tsx`
- student add: `app/protected/students/new/page.tsx`
- student detail/edit: `app/protected/students/[studentId]/page.tsx`
- imports: `app/protected/imports/page.tsx`
- fee settings (alias): `app/protected/fee-structure/page.tsx`
- fee setup: `app/protected/fee-setup/page.tsx`
- fee generation: `app/protected/fee-setup/generate/page.tsx`
- payment entry: `app/protected/payments/page.tsx`
- collections (alias to payments): `app/protected/collections/page.tsx`
- ledger: `app/protected/ledger/page.tsx`
- receipts: `app/protected/receipts/page.tsx`
- defaulters: `app/protected/defaulters/page.tsx`
- reports: `app/protected/reports/page.tsx`
- reports CSV export: `app/protected/reports/export/route.ts`
- settings: `app/protected/settings/page.tsx`
- admin shell/components: `components/admin/*`
- fee rules: `lib/config/fee-rules.ts`
- school profile: `lib/config/school.ts`
- navigation: `lib/config/navigation.ts`
- roles + permissions: `lib/auth/roles.ts`
- session/permission helpers: `lib/supabase/session.ts`
- env helpers: `lib/env.ts`
- schema: `supabase/schema.sql`
- schema notes: `supabase/schema/*`
- migrations: `supabase/migrations/*`

## Tech Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn/ui primitives
- Supabase auth + database
- Vercel deployment target

Canonical Supabase helpers live in `utils/supabase`.
App code should usually import from `lib/supabase/*`.

## Operating Rules For Agents

1. Keep this app internal-admin first.
2. Favor clear, dependable office workflows over flashy design.
3. Preserve auditability on student, fee, collection, and import data.
4. Never treat historical payments as editable facts.
5. Use adjustment or reversal-style entries instead of rewriting history.
6. Keep correction flows explicit and traceable.
7. Avoid delete-heavy workflows for operational records.
8. Keep route contracts under `app/auth` and `app/protected` stable.
9. Keep `SUPABASE_SERVICE_ROLE_KEY` server-only.
10. Preserve school-specific branding and terminology.
11. Keep `NEXT_PUBLIC_ENABLE_BOOTSTRAP_SIGNUP` off outside first-admin bootstrap.

Important nuance:

- The current schema allows updates on master and due-schedule tables.
- Do not interpret that as permission to build history-rewriting UI.
- Payments, receipts, and payment adjustments should stay append-only at the
  workflow and data-model level.

## Active School Rules

Current active fee-policy defaults:

- late fee: flat Rs 1000
- installment due dates: 20 April, 20 July, 20 October, 20 January
- default installment count: 4
- accepted payment modes: Cash, UPI, Bank transfer, Cheque
- receipt prefix: `SVP`
- app mode: `internal-admin`

Historical SOP values that may appear in old notes or workbooks but are not
active rules:

- due dates on the 10th
- late fee at Rs 50 per day

If old workbook data or staff notes conflict with current policy, current
policy wins unless the user explicitly asks for historical-rule handling.

## Current Data And Audit Context

Current core tables in `supabase/schema.sql`:

- `users`
- `classes`
- `transport_routes`
- `students`
- `import_batches`
- `import_rows`
- `fee_settings`
- `school_fee_defaults`
- `student_fee_overrides`
- `installments`
- `receipts`
- `payments`
- `payment_adjustments`
- `audit_logs`

Current operational posture:

- RLS is enabled on core tables
- audit triggers exist on core tables
- spreadsheet imports are staged and traceable by batch and row
- payments, receipts, and payment adjustments are append-only
- no delete policies exist for core operational tables
- `public.v_outstanding_summary` exists for reporting
- `public.v_installment_balances` exists for installment due tracking

Preserve:

- `created_at` / `updated_at`
- `created_by` / `updated_by`
- auditable correction history
- future import batch traceability when import workflows are added

## Change Control

If fee rules change, update together:

- `lib/config/fee-rules.ts`
- relevant UI under `app/protected/settings`
- `README.md`
- `AGENTS.md`
- `SCHOOL_RULES.md`

If env or auth wiring changes, update together:

- `.env.example`
- `.env.local.example`
- `app/protected/settings/page.tsx`
- `app/auth/sign-up/page.tsx`
- `components/login-form.tsx`
- `utils/supabase/*`
- `lib/supabase/*`
- `lib/env.ts`
- `proxy.ts`
- `README.md`
- `PROJECT_CONTEXT.md`
- `AGENTS.md`

If schema intent changes, update together:

- `supabase/schema.sql`
- affected UI/workflows
- `README.md`
- `PROJECT_CONTEXT.md`
- `AGENTS.md`

## Delivery Guidance

Prefer this order when adding product features:

1. make the data rule explicit
2. make the workflow safe
3. make the UI clear
4. make the reporting auditable
5. add polish only after the workflow is reliable

When in doubt, choose the option that reduces staff confusion and preserves an
audit trail.
