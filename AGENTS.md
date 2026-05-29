# AGENTS.md

## Purpose

This repo is the internal fee-management admin app for one school:
**Shri Veer Patta Senior Secondary School (VPPS / Veer Patta School)**.

It is an internal office/accounts/admin tool.

It is **not**:

- a parent portal
- a public self-service product
- a multi-school SaaS platform

## Read First Before Product Decisions

1. `AGENTS.md`
2. `docs/product/project-context.md`
3. `docs/product/mvp-scope.md`
4. `docs/product/school-rules.md`
5. `docs/modules/import.md`
6. `docs/product/roadmap.md`
7. `PRODUCTION_OPERATIONS_CHECKLIST.md`
8. `UAT_CHECKLIST.md`

## Product Identity

Primary working goals:

- student master
- fee setup
- automated dues/installment updates
- payment posting
- append-only financial history
- receipts and print
- dashboard analytics
- defaulters follow-up
- exports for office operations
- staged import + staff RBAC

Primary product qualities:

- automation-first office workflow
- non-technical staff clarity
- reliable and auditable financial operations
- correction-safe append-only history

## Source-of-Truth Rule

**Students + Fee Setup are the source of truth.**

Dashboard, dues, pending totals, defaulters, Payment Desk projections,
Transactions, and Exports should derive from these sources without manual sync
steps for normal staff.

## Simplified Workspace Truth

Primary daily areas:

- `Dashboard`
- `Students`
- `Fee Setup`
- `Payment Desk`
- `Transactions`
- `Defaulters`
- `Exports`
- `Admin Tools`

Operational boundaries:

- `Dashboard` is read-only analytics + shortcuts
- `Students` owns student master and student-level exceptions
- `Fee Setup` is canonical live policy/default editing path
- `Payment Desk` is the only payment posting path
- `Transactions` is read-only financial record center
- `Defaulters` is top-level daily follow-up workspace
- `Exports` is top-level XLSX download center
- `Admin Tools` contains rare setup/config/troubleshooting tasks

Default role landing (5 roles; see `lib/auth/roles.ts`):

- `admin` -> `Dashboard`
- `accountant` -> `Payment Desk`
- `teacher` -> `Students`
- `fee_collector` -> `Defaulters`
- `view_only` -> `Dashboard`

## Non-Goals

Unless explicitly requested, do not steer toward:

- parent-facing capabilities
- public onboarding/payment flows
- multi-tenant abstractions
- history-rewriting payment workflows
- demo/tutorial replacement of school workflows

## Hard Safety Rules

1. Never reset real data without explicit instruction.
2. Never post test payments against real students.
3. Preserve append-only behavior for payments/receipts/adjustments/audit logs.
4. The `2026-27` session contains real school financial records. All testing
   and debugging uses `TEST-2026-27` only. Never add test students, post test
   payments, or make experimental fee changes in the live `2026-27` session.
5. Do not expose `SUPABASE_SERVICE_ROLE_KEY` in browser code.
6. Keep public signup disabled.
7. Avoid hidden alternate edit paths outside intended modules.
8. Keep staff-facing copy office-friendly and low-jargon.

## Production Status

The app is live. Real student records, fee dues, and payment receipts exist
in the `2026-27` session. Every code change that touches data logic, fee
calculations, dues preparation, or payment posting must be tested in
`TEST-2026-27` before any consideration of production impact.

Ongoing test session: `TEST-2026-27`
Live production session: `2026-27`
Live receipt prefix: `SVP`

Use `TEST-2026-27` for all ongoing testing and debugging.

## Active School Policy Defaults (AY 2026-27)

Quick reference. Canonical source: `docs/product/school-rules.md` +
`lib/config/fee-rules.ts` — change values there first.

- late fee: `₹1000`
- installment due dates: `20-04-2026`, `20-07-2026`, `20-10-2026`, `20-01-2027`
- new student academic fee: `₹1100`
- existing student academic fee: `₹500`
- class 12 science tuition default: `₹38000`
- receipt prefix: `SVP`
- books excluded from workbook-mode calculation unless changed explicitly

## Conventional Discount Policies (Current)

- RTE -> tuition = `₹0`
- Staff Child -> tuition = `50%`
- 3rd Child Policy -> tuition = `₹6000`

Rules:

- tuition-only policy impact
- max two active conventional policies per student/year
- compute candidates and apply lowest tuition
- assignment is year-scoped and audited
- family grouping supports sibling policy logic

## Technical Notes To Preserve

Implemented/fixed paths to respect:

- `/protected` role redirect should never loop to itself
- session parser supports `2026-27`, `TEST-2026-27`, `UAT-2026-27`,
  `DEMO-2026-27`
- import rows must carry `batch_id`
- payment preview and post use date-aware workbook snapshot alignment
- payment posting includes idempotency/locking protections
- `v_student_financial_state` supports pending vs credit/refund projection
- conventional discount policy tables + assignments are in schema

## Key Paths

Folder structure: see `docs/maps/folder-map.md`.
Keep this section for high-signal implementation entry points only.

- `app/protected/dashboard/page.tsx`
- `app/protected/students/*`
- `app/protected/fee-setup/*`
- `app/protected/payments/*`
- `app/protected/transactions/*`
- `app/protected/defaulters/page.tsx`
- `app/protected/exports/*`
- `app/protected/admin-tools/page.tsx`
- `lib/config/navigation.ts`
- `lib/config/fee-rules.ts`
- `lib/fees/policy.ts`
- `supabase/schema.sql`
- `supabase/migrations/*`

## Delivery Guidance

When changing behavior, prefer this order:

1. data rule
2. workflow safety
3. staff clarity
4. reporting/auditability
5. visual polish

## Validation Guidance For Agents

When requested to validate, run:

- `npm run typecheck`
- `npm run lint`
- `npm run test`
- `npm run build`

If environment constraints block a command, report exactly what blocked it and
what was run successfully.
