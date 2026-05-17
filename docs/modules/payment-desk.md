# PAYMENT_DESK_GUIDE.md

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
