# Module Map

Folder structure: see `docs/maps/folder-map.md`.
Keep this file focused on module ownership, routes, data dependencies, and tests.

## Dashboard
- Route: `/protected/dashboard`
- Components: `components/dashboard` — `boards.tsx`, `tiles.tsx`, `money-band.tsx`, `view-switcher.tsx`
- Lib: `lib/dashboard` — `analytics.ts` (the boards + the analytics fetch), `data.ts`, `summary.ts`
- DB deps: `get_dashboard_summary`, `get_dashboard_fee_split`, `get_dashboard_analytics`
- Tests: `tests/integration/dashboard-summary.test.ts`, `tests/ui/dashboard-boards.test.tsx`
- Detail: `docs/modules/dashboard.md`

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
- Components: `components/transactions`
- Lib: `lib/ledger`, `lib/reports`, `lib/transactions`
- DB deps: payments/receipts/adjustments ledger surfaces
- Tests: `tests/integration/payment-workflow.test.ts`

## Defaulters
- Route: `/protected/defaulters`
- Components: `components/defaulters`
- Lib: `lib/defaulters` (active roll) + `lib/recovery` (students who left still owing)
- DB deps: workbook balances and student financial state views
- Tests: `tests/integration/office-readiness.test.ts`

## Exports
- Route: `/protected/exports`
- Components: rendered from `app/protected/exports/page.tsx`; no dedicated component folder
- Lib: `lib/reports` (there is no `lib/exports`)
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

---

## Modules this file does not yet cover

Added since it was written; each follows the same three-layer shape
(`app/protected/<module>` + `components/<module>` + `lib/<module>`):

| Module | Route | Lib |
|---|---|---|
| Finance Controls | `/protected/finance-controls` | `lib/finance-controls` |
| Reports | `/protected/reports` | `lib/reports` |
| Ledger | `/protected/ledger` | `lib/ledger` |
| Master Data | `/protected/master-data` | `lib/master-data` |
| Staff | `/protected/staff` | `lib/staff-management` |
| Settings | `/protected/settings` (+ `/glossary`) | `lib/config`, `lib/money` |
| EMI plans | surfaces on Student / Payment Desk / Defaulters | `lib/repayment-plans` |
| Previous-year dues | `/protected/admin-tools/prev-year-dues` | `lib/prev-year-dues` |
| Promotion runs | `/protected/admin-tools/promotion` | `lib/promotion` |
| Recovery desk | `/protected/admin-tools/recovery` | `lib/recovery` |
| Activity feed | `/protected/admin-tools/activity` | `lib/activity` |
| WhatsApp templates | `/protected/admin-tools/whatsapp-templates` | `lib/whatsapp-templates` |
| Bulk payment entry | `/protected/payments/bulk` | `lib/payments/bulk` |

Segments (`lib/segments`) is not a module — it is a shared filter vocabulary used by
Students and Transactions, and it deliberately lives outside `lib/students` because that
folder is `server-only` and the chips render in the browser.
