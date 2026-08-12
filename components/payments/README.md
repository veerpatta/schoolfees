# Payments Components

Route served: `/protected/payments`.

Paired domain lib: `lib/payments`.

Payment Desk is the only payment-posting surface. Preserve append-only
payments/receipts, idempotency, and database locking guards.

Key files:

- `payment-entry-client.tsx`
- `payment-desk-mobile.tsx`
- `payment-desk-desktop.tsx`
- `payment-desk/payment-desk-layout.tsx`
- `confirm-receipt-sheet.tsx`
- `success-receipt-sheet.tsx`
- `duplicate-receipt-sheet.tsx`
- `mobile-payment-mode-sheet.tsx`
- `payee-summary-strip.tsx`

Guard tests:

- `tests/integration/payment-desk-workflow.test.ts`
- `tests/ui/ux-audit-ui.test.ts`

## Also in this folder

`waive-late-fee-sheet.tsx` + `waive-late-fee-trigger.tsx` — per-installment late-fee waiver.
`payment-desk-emi-banner.tsx` — shown for a student on a repayment plan.
`upi-qr-code.tsx` · `bulk/` (admin bulk entry) · `collect/` (the phone collect flow).

`payment-desk-mobile.tsx` has a **3,520-line CI budget** in
`quality/office-quality-budgets.json`. It has been raised once and must not be raised
again — split the file instead.
