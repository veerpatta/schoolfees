# 🧱 Developer Map

## Stack

- Next.js App Router
- React 19
- TypeScript
- Supabase Auth + Postgres + RLS
- Tailwind CSS
- Vitest
- XLSX exports with `xlsx`

## High-signal repo paths

| Area | Paths |
| --- | --- |
| Dashboard | `app/protected/dashboard/page.tsx`, `lib/dashboard/*` |
| Students | `app/protected/students/*`, `components/students/*`, `lib/students/*` |
| Fee Setup | `app/protected/fee-setup/*`, `components/fees/*`, `lib/fees/*`, `lib/setup/*` |
| Payment Desk | `app/protected/payments/*`, `components/payments/*`, `lib/payments/*` |
| Transactions | `app/protected/transactions/*`, `lib/transactions/*`, `lib/ledger/*`, `lib/reports/*` |
| Defaulters | `app/protected/defaulters/page.tsx`, `lib/defaulters/*` |
| Exports | `app/protected/exports/*`, `lib/reports/*` |
| Admin Tools | `app/protected/admin-tools/*`, `lib/system-sync/*` |
| Import | `app/protected/imports/*`, `components/imports/*`, `lib/import/*` |
| Navigation | `lib/config/navigation.ts` |
| School rules | `lib/config/fee-rules.ts`, `lib/fees/policy.ts` |
| Database | `supabase/schema.sql`, `supabase/migrations/*` |

## Key database objects

Tables:

- `students`
- `classes`
- `transport_routes`
- `fee_settings`
- `fee_policy_configs`
- `installments`
- `payments`
- `receipts`
- `payment_adjustments`
- `refund_requests`
- `student_fee_overrides`
- `conventional_discount_policies`
- `student_conventional_discount_assignments`
- `student_family_groups`
- `student_family_members`
- `import_batches`
- `import_rows`

Views:

- `v_workbook_student_financials`
- `v_workbook_installment_balances`
- `v_student_financial_state`

Functions:

- `preview_workbook_payment_allocation`
- `post_student_payment`
- `private.workbook_installment_snapshot`

## Current route shape

Primary routes:

- `/protected/dashboard`
- `/protected/students`
- `/protected/students/families`
- `/protected/fee-setup`
- `/protected/payments`
- `/protected/transactions`
- `/protected/defaulters`
- `/protected/exports`
- `/protected/admin-tools`

Legacy aliases may exist for compatibility, but new user-facing work should use the simplified workspace names.

## Latest repo direction from commit history

Recent branch history includes:

- performance indexes for query efficiency
- clearer dashboard overdue labels
- overdue installment status handling
- cache-safe student financial data loading
- payment RPC security-definer update
- restored individual student payment RPC
- family pay-together removal
- automatic 3rd-child policy logic

## Validation commands

Run these before production-impacting changes:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

If a command is blocked by environment or unrelated failures, report exactly what passed, what failed, and whether the failure touches the changed area.

