# PAYMENT_DESK_GUIDE.md

> **Fees and late fee are separate lines.** Since `20260812120000` the desk shows fees owed
> and late fee owed as two figures, and posting allocates against `total_pending` — the two
> added. Allocating against fees alone would refuse to let a cashier take a late fee the
> ledger is still asking for.
>
> Also on this surface and not described below: the per-installment **late-fee waiver
> sheet** (`waive-late-fee-sheet.tsx`), the **EMI banner** for a student on a repayment plan
> (`payment-desk-emi-banner.tsx`), the **UPI QR** (`upi-qr-code.tsx`), and the admin **bulk
> entry** sub-surface at `/protected/payments/bulk` — part of this module precisely because
> every row posts through `post_student_payment_with_adjustments`.
>
> While an EMI plan is active, counter concessions are refused. Changing the deal is an
> admin rescheduling the plan, not a cashier waiving on the spot.
>
> `src/modules/payments/ui/payment-desk-mobile.tsx` carries a **3,520-line CI budget**. It has
> been raised once and must not be raised again — split the file instead.

## Purpose

Fast cashier workflow for posting student payments and generating receipts.

## Standard Steps

1. Select class.
2. Select student (combobox supports SR context).
3. Review dues/allocations.
4. Choose quick amount or enter amount.
5. Select payment mode.
6. Enter reference number if available (optional).
7. Confirm post.
8. Open/print receipt.
9. Use “Collect Another Payment” for next student.

## Payment Modes and Reference Rule

- accepted modes come from active policy
- reference number is optional for all modes
- app may show soft reminder for modes that commonly have references

## Duplicate Prevention

Current implementation includes idempotency/locking safeguards in payment
posting path to avoid accidental duplicate posts.

## If Dues Are Missing

- use built-in diagnostics/fallback prep flow
- verify student session alignment with active fee-policy session
- confirm student class/route/setup data integrity

## Pending vs Credit/Refund

When policy/student state changes after payment, projected student state can
show pending due or credit/refund direction instead of rewriting history.
