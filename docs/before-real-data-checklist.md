# Before Real Data Checklist

Run this immediately before entering real student records.

## 1) Access + Routing

- [ ] `/protected` lands by role (admin Dashboard, accountant Payment Desk, read_only Dashboard).
- [ ] No `/protected` redirect loop.
- [ ] Read-only staff cannot save fee/student/payment changes.

## 2) Session + UAT Hygiene

- [ ] `TEST-2026-27` (or other test session) is isolated from real workflow.
- [ ] No dummy students mixed into live 2026-27 operations.
- [ ] No test payments were posted against real students.

## 3) Fee Setup Verification

- [ ] AY `2026-27` is confirmed as active real session.
- [ ] Late fee is `₹1000`.
- [ ] Due dates are 20-Apr, 20-Jul, 20-Oct, 20-Jan.
- [ ] New student academic fee is `₹1100`.
- [ ] Existing student academic fee is `₹500`.
- [ ] Class 12 science tuition default is `₹38000`.
- [ ] Receipt prefix is `SVP`.

## 4) Students + Dues Automation

- [ ] Add/edit student triggers expected dues preparation behavior.
- [ ] Route and fee-exception changes propagate safely.
- [ ] Conventional discount assignment behavior is validated.

## 5) Payment + Receipt Safety

- [ ] Payment Desk posting works with current payment modes.
- [ ] Reference number remains optional for all payment modes.
- [ ] Receipt open/print works.
- [ ] Posted payment/receipt rows remain append-only.

## 6) Daily Operations Surfaces

- [ ] Dashboard totals are sane.
- [ ] Defaulters ranking/filter behavior is usable for follow-up.
- [ ] Exports produce required office XLSX files.
- [ ] Transactions records and filters are readable and stable.

## 7) Security + Operational Hygiene

- [ ] Shared admin passwords rotated after UAT.
- [ ] No passwords/secrets stored in repo docs/prompts.
- [ ] Staff know the daily flow: Students + Fee Setup -> auto updates -> Payment Desk -> Transactions/Defaulters/Exports.
