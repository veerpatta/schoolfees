# UAT_CHECKLIST.md

## Purpose

Ongoing verification checklist for TEST-2026-27 after fee setup, payment desk,
student, import, or finance-facing changes.

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

## Added since this list was written

Run these on `TEST-2026-27` too:

- **Late fee is separate** — a student whose fees are clear but who owes a late fee reads
  *Paid*, is absent from Defaulters, and still shows the late fee on its own line. The
  Payment Desk lets you collect it.
- **Waive and void** — waive a late fee with a reason; void the waiver and confirm the
  charge comes back.
- **EMI plan** — create one, confirm the covered installments stop chasing, miss a monthly
  instalment and confirm the ₹1,000 charge appears as its own row. Reschedule and confirm
  the old plan is superseded, not edited.
- **Refund and undo** — process a refund and confirm the dashboard, students "Paid" and
  the sidebar's "Day so far" all move. Undo a payment within 10 minutes.
- **Dashboard boards** — switch all five; the page must not jump, and counts must not
  render with a ₹.
- **Bulk payment entry** — upload, review, commit; re-run the same file and confirm it
  resolves to the existing receipts rather than double-posting.
- **Previous-year dues** — dry-run an import and check the matched count before applying.
- **Segments** — pick two chips in one family (OR) and one in another (AND); the header
  count must match the rows.
