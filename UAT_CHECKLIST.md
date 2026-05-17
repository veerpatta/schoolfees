# UAT_CHECKLIST.md

## Purpose

Ongoing verification checklist for TEST-2026-27 after fee setup, payment desk,
student, import, or finance-facing changes.

This is not the historical pre-go-live plan. For that record, see
`docs/history/uat-test-plan.md`.

## Always Use TEST-2026-27

- Use only test students with TEST-prefixed admission/SR values.
- Never post test payments against real 2026-27 students.
- Do not change live 2026-27 fee defaults while testing.
- Keep receipt and payment behavior append-only during every check.

## Verify After Payment Desk Or Fee Setup Changes

- Select a class, choose a TEST student, and confirm dues load without full-class posting.
- Preview a payment and confirm the amount, student, installment, and mode are accurate.
- Post one small TEST payment and verify the saved receipt matches the confirmation.
- Try refresh/back/re-submit after success and confirm duplicate posting is blocked.
- Check Transactions shows the receipt as read-only financial history.
- Change a TEST fee setup/default, preview impact, and confirm paid rows are not rewritten.
- Confirm Dashboard, Defaulters, and Exports reflect the TEST session totals after sync.
- Run the standard validation commands before considering production impact.
