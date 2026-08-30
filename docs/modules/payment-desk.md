# PAYMENT_DESK_GUIDE.md

> **Fees and late fee are separate lines.** Since `20260812120000` the desk shows fees owed
> and late fee owed as two figures, and posting allocates against `total_pending` — the two
> added. Allocating against fees alone would refuse to let a cashier take a late fee the
> ledger is still asking for.
>
> Also on this surface and not described below: the **EMI banner** for a student on a repayment plan
> (`payment-desk-emi-banner.tsx`), the **UPI QR** (`upi-qr-code.tsx`), and the admin **bulk
> entry** sub-surface at `/protected/payments/bulk` — part of this module precisely because
> every row posts through `post_student_payment_with_adjustments`.
>
> While an EMI plan is active, counter concessions are refused. Changing the deal is an
> admin rescheduling the plan, not a cashier waiving on the spot.
>
> `src/modules/payments/ui/payment-desk-mobile.tsx` carries a **3,520-line CI budget**. It has
> been raised once and must not be raised again — split the file instead.

## The late-fee waiver sheet

`src/modules/payments/ui/waive-late-fee-sheet.tsx` is the only place a late fee is
forgiven with an amount and a reason. It is mounted from the student page (all three of
its surfaces — see `docs/modules/students.md`), never from the desk itself. What the desk
has is a different, narrower thing: an all-or-nothing **tick** during collection, which
takes the whole pending late fee and writes a canned reason.

The sheet collects a target installment, an amount and a reason of at least four
characters, and posts to `waiveLateFeeAction`, which calls the `waive_late_fee` RPC. Three
things about it are load-bearing:

- **It must go through the user-JWT client** (`createClient()`), never the service-role
  admin client. The RPC's first guard is `has_permission(...)`, which reads `auth.uid()` —
  null under a service-role JWT, so every waiver would be refused.
- **`clientRequestId` is minted per sheet-open, not per submit.** The RPC is idempotent on
  it, so a double-tap replays instead of stacking a second waiver.
- **Forgiving a late fee the family has already paid needs `fees:write`** and is offered
  only against a named installment. It gives money back rather than cancelling a debt;
  `docs/product/school-rules.md` has the rule and where the rupees go.

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
