# Before Real Data Checklist

Use this checklist immediately before entering actual student records for
Shri Veer Patta Senior Secondary School.

## Route And Role Checks

- [ ] `/protected` lands safely for admin, accountant, and read-only staff.
- [ ] Admin lands on Students.
- [ ] Accountant lands on Payment Desk.
- [ ] Read-only staff lands on Students.
- [ ] Read-only staff cannot save student, import, fee setup, or payment forms.
- [ ] Accountant cannot change school-wide setup/policy if permissions disallow it.

## UAT Session Checks

- [ ] Test academic session `TEST-2026-27` exists if UAT was performed.
- [ ] Test session is clearly separate from real AY `2026-27`.
- [ ] Test students use dummy names and SR numbers only.
- [ ] No real receipts or real parent payments were posted during UAT.
- [ ] Test session is archived, ignored, or isolated before real go-live.

## Fee Setup Checks

- [ ] Fee Setup can preview and publish the test setup.
- [ ] Class defaults are correct.
- [ ] Route defaults are correct.
- [ ] Installment schedule is correct.
- [ ] Flat late fee is correct.
- [ ] New/old student academic fees are correct.
- [ ] Paid or partially paid rows are not silently rewritten by setup changes.
- [ ] Final actual AY `2026-27` fee values are confirmed before production data entry.

## Students And Import Checks

- [ ] Manual Add Student works with only student name, SR number, and class.
- [ ] Student edit works for class, route, contact, record status, and notes.
- [ ] Student Fee Profile supports new/existing, overrides, discount, waiver,
      other adjustment, reason, and notes.
- [ ] Student-specific fee override changes update scoped dues safely.
- [ ] Bulk import dry-run catches invalid rows.
- [ ] Bulk import keeps row-level validation issues visible.
- [ ] Bulk update by SR number works.
- [ ] Blank optional update cells preserve existing values.

## Payment And Receipt Checks

- [ ] Payment Desk searches and selects the correct student.
- [ ] Accepted payment modes match Fee Setup.
- [ ] Receipt prefix matches Fee Setup.
- [ ] Receipt print/open works.
- [ ] Student ledger shows posted payments chronologically.
- [ ] Posted payments, receipts, adjustments, and audit logs remain append-only.

## Dues And Reports Checks

- [ ] Dues & Receipts match expected UAT numbers.
- [ ] Defaulters match expected outstanding balances.
- [ ] Outstanding report matches expected balances.
- [ ] Daily Collection report matches test receipts.
- [ ] Receipt Register export works.
- [ ] Student Ledger report works.
- [ ] Import Verification report shows staged/imported rows.

## Final Go-Live Gate

- [ ] No real data has been entered before UAT sign-off.
- [ ] No dummy data is present in the real working session.
- [ ] Staff understand the operating pattern:
      Fee Setup for defaults, Students for student records and student-specific
      overrides, Payment Desk for transactions, Dues/Reports for verification.
- [ ] Actual AY `2026-27` settings are correct.
- [ ] Initial real import file has been reviewed before upload.
