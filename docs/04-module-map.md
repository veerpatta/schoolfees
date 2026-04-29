# Module Map

## Dashboard
- Route: `/protected/dashboard`
- Components: `components/dashboard` (plus shared widgets)
- Lib: `lib/dashboard`, `lib/office`
- DB deps: workbook/student financial views + fee policy/session settings
- Tests: `tests/integration/dashboard-summary.test.ts`

## Students
- Route: `/protected/students`
- Components: `components/students`
- Lib: `lib/students`
- DB deps: `students`, `classes`, `student_fee_overrides`
- Tests: `tests/integration/student-*.test.ts`, `tests/integration/student-dues-sync.test.ts`

## Fee Setup
- Route: `/protected/fee-setup`
- Components: `components/fees`
- Lib: `lib/setup`, `lib/fees`
- DB deps: `fee_settings`, `fee_policy_configs`, `installments`
- Tests: `tests/unit/fee-rules.test.ts`, `tests/integration/setup-copy.test.ts`

## Payment Desk
- Route: `/protected/payments`
- Components: `components/payments` + payment-related fee setup clients
- Lib: `lib/payments`
- DB deps: `payments`, `receipts`, `payment_adjustments`, `preview_workbook_payment_allocation`, `post_student_payment`
- Tests: `tests/integration/payment-*.test.ts`, `tests/integration/payment-desk-workflow.test.ts`

## Transactions
- Route: `/protected/transactions`
- Components: `components/office` and transaction tables
- Lib: `lib/ledger`, `lib/reports`
- DB deps: payments/receipts/adjustments ledger surfaces
- Tests: `tests/integration/payment-workflow.test.ts`

## Defaulters
- Route: `/protected/defaulters`
- Components: `components/office` + defaulter UI
- Lib: `lib/defaulters`
- DB deps: workbook balances and student financial state views
- Tests: `tests/integration/office-readiness.test.ts`

## Exports
- Route: `/protected/exports`
- Components: `components/office`
- Lib: `lib/reports`, `lib/exports`
- DB deps: report/export projections from workbook + financial tables
- Tests: `tests/integration/reports-metadata.test.ts`

## Admin Tools
- Route: `/protected/admin-tools` (legacy `/protected/advanced` redirects)
- Components: `components/admin`
- Lib: `lib/system-sync`, `lib/config`
- DB deps: health checks over required workbook/payment DB objects
- Tests: `tests/ui/ux-audit-ui.test.ts`, `tests/integration/navigation.test.ts`

## Imports
- Route: `/protected/imports`
- Components: `components/imports`
- Lib: `lib/import`
- DB deps: `import_batches`, `import_rows`, students/class lookups
- Tests: `tests/integration/import-*.test.ts`, `tests/ui/import-page-resilience.test.tsx`

## Receipts
- Route: `/protected/receipts`
- Components: receipt route components + shared UI
- Lib: `lib/payments`, `lib/helpers`
- DB deps: `receipts`, `payments`, adjustments references
- Tests: `tests/integration/payment-workflow.test.ts`, `tests/integration/payment-preview-route.test.ts`
