# Payments Components

Route served: `/protected/payments`.

Paired domain lib: `lib/payments`.

Payment Desk is the only payment-posting surface. Preserve append-only
payments/receipts, idempotency, and database locking guards.

Key files:

- `payment-entry-client.tsx`
- `payment-desk-mobile.tsx`
- `payment-desk-desktop.tsx`
- `confirm-receipt-sheet.tsx`
- `success-receipt-sheet.tsx`
- `duplicate-receipt-sheet.tsx`
- `mobile-payment-mode-sheet.tsx`
- `payee-summary-strip.tsx`

Guard tests:

- `tests/integration/payment-desk-workflow.test.ts`
- `tests/ui/ux-audit-ui.test.ts`
