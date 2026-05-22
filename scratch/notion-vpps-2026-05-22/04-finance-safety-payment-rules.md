# 💸 Finance Safety & Payment Rules

## Core principle

Financial history is append-only. Corrections must be explicit and auditable.

## Live/test boundary

| Session | Meaning | Rule |
| --- | --- | --- |
| `2026-27` | Live production school records | Do not test here |
| `TEST-2026-27` | Permanent test/debug session | Use for UAT and debugging |
| `UAT-2026-27`, `DEMO-2026-27` | Supported parser labels | Use only when intentionally configured |

## Payment Desk boundary

Payment Desk is the only place where payments are posted.

Do not add:

- hidden alternate posting paths
- family pay-together payment posting
- direct payment table edits from UI
- routes that bypass preview/posting safeguards

## Current payment model

- Payments are individual-student only.
- Family/sibling discovery can exist in Students.
- Family grouping supports policy logic.
- Payment posting remains one student at a time.

## Posting safeguards

The payment path includes:

- class-first and student selection flow
- payment-date-aware workbook snapshot alignment
- preview before post
- idempotency protections
- locking protections
- receipt generation
- append-only transaction history

## Receipt rules

- Receipt prefix: `SVP`
- Receipt records are permanent.
- Reprints read from existing records.
- Do not edit/delete posted receipts.

## Fee change after payment

Fee Setup changes should:

1. preview impact first
2. apply to unpaid/future rows in scope
3. protect paid, partial, and adjusted rows
4. keep protected rows visible for review

If policy/student state changes after payment, the app should show pending or credit/refund projection instead of rewriting history.

## Common safe debugging path

1. Reproduce in `TEST-2026-27`.
2. Use a `TEST-` prefixed admission/SR student.
3. Check Payment Desk preview.
4. Confirm post behavior only with test data.
5. Verify Transactions is read-only.
6. Verify Dashboard, Defaulters, and Exports reflect the test session after sync.

