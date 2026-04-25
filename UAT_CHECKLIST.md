# UAT_CHECKLIST.md

## Purpose

Quick pass/fail checklist for UAT before live usage.

## After Migration Checks

- [ ] App boots and `/protected` loads without loop.
- [ ] Role landing works (admin/dashboard, accountant/payment desk, read_only/dashboard).
- [ ] No critical errors on Dashboard, Students, Fee Setup, Payment Desk, Transactions, Defaulters, Exports.

## Dummy Data Rules

- [ ] Use `TEST-2026-27`.
- [ ] Use dummy names/SR only (`Test Student 001`, `TEST-SR-001`).
- [ ] Do not post test payments against real students.

## End-to-End Office Flow

- [ ] Add student -> dues prepared.
- [ ] Collect payment -> receipt generated.
- [ ] Receipt printable on A4.
- [ ] Entry visible in Transactions.

## Conventional Discount Tests

- [ ] RTE (tuition 0) behaves correctly.
- [ ] Staff Child (50%) behaves correctly.
- [ ] 3rd Child (6000) behaves correctly.
- [ ] Lowest tuition wins for multi-policy case.
- [ ] Max-two-active-policy rule enforced.

## Bulk Import Tests

- [ ] Bulk Add dry-run + commit works.
- [ ] Bulk Update matching and blank-cell behavior works.
- [ ] `import_batches` and `import_rows` traceability is visible.

## Defaulters + Exports Tests

- [ ] Defaulters ranking and filters are usable.
- [ ] Key exports download successfully (students, dues, payments, conventional discounts).

## Refund/Credit + Pending Behavior

- [ ] Post-change projection can show pending vs credit/refund state.
- [ ] Correction trail is explicit and auditable.

## Delete/Withdraw Rules

- [ ] No direct destructive edit path for posted payment/receipt history.
- [ ] Withdrawal/correction behavior follows explicit record model.

## Go-Live Gate

- [ ] Real AY `2026-27` policy values reconfirmed.
- [ ] Dummy data isolated/archived.
- [ ] Shared admin passwords rotated.
