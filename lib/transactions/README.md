# Transactions Lib

Module: Transactions
Route: `/protected/transactions`

These files back workbook-style dues views and the transactions/exports download routes.

Files:
- `workbook.ts` - view metadata, aliases, hrefs, and export hrefs.
- `dues.ts` - read-only workbook data loader for Transactions views.

Shared libs used alongside:
- `lib/ledger`
- `lib/reports`
- `lib/office`

Tests: `tests/integration/transactions-page-resilience.test.ts`, `tests/integration/office-workbook.test.ts`.

Safety: read-only financial surface; no payment posting here.
