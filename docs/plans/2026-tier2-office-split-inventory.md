# Tier 2 Office Split Inventory

Inventory date: 2026-05-17

Scope for this commit: inventory only. No source files, imports, tests, or route
contracts have been moved or edited.

## Path-Coupled Tests Reviewed

- `tests/ui/ux-audit-ui.test.ts`
- `tests/integration/payment-desk-workflow.test.ts`
- `tests/integration/reports-metadata.test.ts`
- `tests/integration/office-readiness.test.ts`

Additional path-coupled tests found during inventory:

- `tests/integration/office-workbook.test.ts`
- `tests/integration/transactions-page-resilience.test.ts`
- `tests/unit/cache-safety-audit.test.ts`
- `tests/unit/performance-guardrails.test.ts`
- `tests/unit/source-of-truth-audit.test.ts`
- `tests/ui/import-page-resilience.test.tsx`
- `tests/ui/office-ui-system.test.ts`

## Component Inventory

| Current file | Proposed destination | Decision note |
| --- | --- | --- |
| `components/office/README.md` | `components/office/README.md` | Keep and rewrite after split as a short shared-widget boundary note. |
| `components/office/auto-submit-form.tsx` | `components/office/auto-submit-form.tsx` | Shared filter form helper used by Students, Transactions, Defaulters, Ledger, and Reports. |
| `components/office/office-ui.tsx` | `components/office/office-ui.tsx` | Shared office primitives used by Students, Payment Desk, Transactions, Defaulters, Exports, Imports, Fee Setup, Admin Tools, and Setup. |

Current finding: there are no transaction-only, defaulter-only, or export-only
UI files left under `components/office/`. Defaulters already has
`components/defaulters/defaulter-filters.tsx`.

## Library Inventory

| Current file | Proposed destination | Decision note |
| --- | --- | --- |
| `lib/office/README.md` | `lib/office/README.md` | Keep and update after confirmed moves to define shared-only office helpers. |
| `lib/office/data.ts` | `lib/office/data.ts` | Keep shared. Builds cross-module office/home readiness data from dashboard, fee setup, transactions, imports, and ledger regeneration sources. |
| `lib/office/dues.ts` | `lib/transactions/dues.ts` | Proposed move. Despite legacy "office dues" naming, this backs the `/protected/transactions` workbook views and exports. |
| `lib/office/readiness.ts` | `lib/office/readiness.ts` | Keep shared. Used across Students, Payment Desk, Transactions, Reports, Fee Setup, Imports, and tests. |
| `lib/office/workbook.ts` | `lib/transactions/workbook.ts` | Proposed move. Owns transaction workbook view metadata, aliases, hrefs, and export hrefs. |
| `lib/ledger/data.ts` | `lib/ledger/data.ts` | Recommend keep for now. It still owns legacy ledger read/correction behavior, including payment adjustment helpers, and should not be merged casually. |
| `lib/ledger/types.ts` | `lib/ledger/types.ts` | Recommend keep with `lib/ledger/data.ts` unless ledger is explicitly folded into Transactions in the next pass. |
| `lib/reports/data.ts` | `lib/reports/data.ts` | Recommend keep for now. It is a cross-module report/export engine spanning outstanding, daily collection, student ledger, receipt register, and import verification. |
| `lib/reports/types.ts` | `lib/reports/types.ts` | Recommend keep with `lib/reports/data.ts`; `tests/integration/reports-metadata.test.ts` validates this metadata. |
| `lib/defaulters/data.ts` | `lib/defaulters/data.ts` | Already module-aligned; keep. |
| `lib/defaulters/types.ts` | `lib/defaulters/types.ts` | Already module-aligned; keep. |

## Importers By Current File

### `components/office/auto-submit-form.tsx`

- `components/defaulters/defaulter-filters.tsx`
- `components/ledger/ledger-client.tsx`
- `components/students/student-filters.tsx`
- `app/protected/transactions/page.tsx`
- `app/protected/reports/page.tsx`

Proposed action: no import updates if this stays shared.

### `components/office/office-ui.tsx`

- `app/protected/admin-tools/page.tsx`
- `app/protected/admin-tools/session-health/page.tsx`
- `app/protected/defaulters/page.tsx`
- `app/protected/exports/page.tsx`
- `app/protected/fee-setup/generate/page.tsx`
- `app/protected/imports/page.tsx`
- `app/protected/payments/page.tsx`
- `app/protected/reports/page.tsx`
- `app/protected/students/[studentId]/page.tsx`
- `app/protected/students/new/page.tsx`
- `app/protected/students/page.tsx`
- `app/protected/transactions/page.tsx`
- `components/payments/payment-desk-mobile.tsx`
- `components/setup/setup-wizard-client.tsx`
- `components/students/student-form.tsx`
- `tests/ui/import-page-resilience.test.tsx`
- `tests/ui/office-ui-system.test.ts`

Proposed action: no import updates if this stays shared.

### `lib/office/data.ts`

- `app/protected/fee-setup/generate/page.tsx`
- `tests/unit/performance-guardrails.test.ts`

Proposed action: no import updates if this stays shared.

### `lib/office/dues.ts`

- `app/protected/transactions/page.tsx`
- `app/protected/transactions/export/route.ts`
- `app/protected/exports/[exportType]/route.ts`
- `tests/integration/transactions-page-resilience.test.ts`
- `tests/unit/performance-guardrails.test.ts`
- `tests/unit/source-of-truth-audit.test.ts`

If moved to `lib/transactions/dues.ts`, update all import strings, mocks,
`importActual` calls, and `readFileSync(join(process.cwd(), "..."))` path
strings in the same commit.

### `lib/office/readiness.ts`

- `app/protected/fee-setup/generate/page.tsx`
- `app/protected/payments/page.tsx`
- `app/protected/reports/page.tsx`
- `app/protected/students/new/page.tsx`
- `app/protected/transactions/page.tsx`
- `lib/import/readiness.ts`
- `tests/integration/office-readiness.test.ts`
- `tests/integration/transactions-page-resilience.test.ts`

Proposed action: no import updates if this stays shared.

### `lib/office/workbook.ts`

- `app/protected/transactions/page.tsx`
- `app/protected/transactions/export/route.ts`
- `app/protected/exports/[exportType]/route.ts`
- `lib/office/dues.ts`
- `tests/integration/office-workbook.test.ts`

If moved to `lib/transactions/workbook.ts`, update all import strings and test
imports in the same commit. If `lib/office/dues.ts` also moves, update that
internal import after the move.

### `lib/ledger/data.ts`

- `app/protected/ledger/actions.ts`
- `app/protected/ledger/page.tsx`
- `lib/students/workspace.ts`

Recommended action: keep `lib/ledger/` in this tier unless the human confirms
it should become `lib/transactions/ledger-data.ts`.

### `lib/ledger/types.ts`

- `app/protected/ledger/actions.ts`
- `components/ledger/ledger-client.tsx`
- `lib/ledger/data.ts`

Recommended action: keep with `lib/ledger/data.ts`.

### `lib/reports/data.ts`

- `app/protected/reports/export/route.ts`
- `app/protected/reports/ledger/[studentId]/print/page.tsx`
- `app/protected/reports/page.tsx`
- `app/protected/transactions/export/route.ts`
- `lib/office/dues.ts`
- `tests/unit/source-of-truth-audit.test.ts`

Recommended action: keep `lib/reports/` in this tier because report keys span
Transactions, Defaulters, Imports, and Exports.

### `lib/reports/types.ts`

- `app/protected/reports/page.tsx`
- `lib/office/dues.ts`
- `lib/reports/data.ts`
- `tests/integration/reports-metadata.test.ts`

Recommended action: keep with `lib/reports/data.ts`.

### `lib/defaulters/data.ts`

- `app/protected/defaulters/page.tsx`
- `tests/unit/cache-safety-audit.test.ts`
- `tests/unit/source-of-truth-audit.test.ts`

Proposed action: no move; already aligned to Defaulters.

### `lib/defaulters/types.ts`

- `app/protected/defaulters/page.tsx`
- `components/defaulters/defaulter-filters.tsx`
- `lib/defaulters/data.ts`

Proposed action: no move; already aligned to Defaulters.

## Confirmation Needed

Please confirm the proposed destination decisions before any file moves:

1. Keep both files in `components/office/` as shared widgets.
2. Move `lib/office/dues.ts` to `lib/transactions/dues.ts`.
3. Move `lib/office/workbook.ts` to `lib/transactions/workbook.ts`.
4. Keep `lib/office/data.ts` and `lib/office/readiness.ts` shared.
5. Keep `lib/ledger/` and `lib/reports/` unchanged in this tier unless you want
   those folded into Transactions or Exports now.
6. Keep `lib/defaulters/` unchanged because it is already module-aligned.
