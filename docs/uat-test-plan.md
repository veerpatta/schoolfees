# VPPS UAT Test Plan

Use this plan before entering real student records for Shri Veer Patta Senior
Secondary School. Run the tests with dummy data only, preferably in a local or
staging database. If testing must happen in production, use the test academic
session label `TEST-2026-27` and keep every test student, route, and SR number
clearly marked as test data.

Do not post trial payments against real students. Do not edit posted payments,
receipts, payment adjustments, or audit logs directly.

## 1. Login And Role Access

1. Log in as admin.
2. Open `/protected`; confirm it lands on Students and does not loop.
3. Confirm admin can open Students, Fee Setup, Payment Desk, Dues & Receipts,
   Advanced, Settings, Staff, and Reports according to permissions.
4. Log in as accountant.
5. Open `/protected`; confirm it lands on Payment Desk.
6. Confirm accountant can post payments if allowed, but cannot change global
   setup/policy when permissions disallow it.
7. Log in as read-only staff.
8. Open `/protected`; confirm it lands on Students.
9. Confirm read-only staff can review allowed pages but cannot save edits,
   publish Fee Setup, upload imports, or post payments.

## 2. Fee Setup UAT

1. Open Fee Setup.
2. Create or copy a test academic session named `TEST-2026-27`.
3. Keep actual AY `2026-27` values unchanged.
4. Add or verify test-only classes and routes, clearly named if they are not
   already safe dummy rows.
5. Set test class tuition and route transport defaults.
6. Review installment dates, flat late fee, new-student academic fee, old-student
   academic fee, fee heads, class defaults, and route defaults.
7. Save Draft Review.
8. Read the preview summary, changed fields, affected students, and blocked rows.
9. Publish only if the preview is expected.
10. Confirm paid or partially paid rows, if any exist, are blocked for manual
    review rather than silently rewritten.

## 3. Manual Student Entry

1. Open Students.
2. Add `Test Student 001` with SR number `TEST-SR-001`.
3. Select a test class.
4. Leave optional fields blank and confirm the student can be saved.
5. Edit the student and set a test transport route.
6. Edit Student Fee Profile fields:
   - New / Existing
   - Tuition override
   - Transport override
   - Discount
   - Late fee waiver
   - Other fee / adjustment head
   - Other fee / adjustment amount
   - Special-case reason
7. Confirm the student detail page shows the Basic Details, Fee Profile, and
   Computed Fee Snapshot sections.
8. Confirm scoped dues regeneration runs only for the changed student.

## 4. Bulk Import And Update

1. Download the app import template from Students or Student Imports.
2. Also review `docs/samples/student-import-test-sample.csv`.
3. Upload a CSV/XLSX with only dummy rows.
4. Confirm column mapping includes name, class, SR number, route, new/existing,
   fee overrides, discount, late fee waiver, other adjustment, reason, and notes.
5. Run dry-run validation.
6. Confirm invalid class or route values remain reviewable with row-level issues.
7. Approve valid rows only.
8. Commit the import.
9. Upload a second file using the same SR number and changed values.
10. Confirm matching SR numbers become update rows, not duplicate errors.
11. Confirm blank optional cells in update rows leave existing values unchanged.
12. Open imported students and verify their fee profiles.

## 5. Dues And Payment Posting

1. Generate or refresh dues for the test student/session using the normal app
   workflow.
2. Open Payment Desk.
3. Search for the test student only.
4. Confirm accepted payment modes match the active policy.
5. Post a small test payment against a test student.
6. Confirm receipt number prefix and receipt details.
7. Open or print the receipt.
8. Confirm the payment appears in student ledger/history.
9. Confirm posted payment and receipt rows cannot be directly edited.

## 6. Dues, Defaulters, Reports, And Exports

1. Open Dues & Receipts.
2. Confirm installment dues match the expected test fee calculation.
3. Open the test student's master fee statement.
4. Check Defaulters and confirm the test student appears or disappears according
   to payment status.
5. Open Reports.
6. Check Outstanding, Daily Collection, Receipt Register, Student Ledger, and
   Import Verification.
7. Export CSV reports and compare totals with the expected UAT values.

## 7. Audit And Safety Checks

1. Confirm Fee Setup changes appear in recent config-change history.
2. Confirm import batches retain file name, row status, validation errors,
   operation type, and imported student links.
3. Confirm payment posting creates append-only financial records.
4. Confirm read-only users cannot save forms or post payments.
5. Confirm accountant permissions do not allow school-wide defaults/policy edits
   if that role is not meant to manage setup.
6. Confirm no real student names, real SR numbers, or real parent phone numbers
   were used during UAT.

## Exit Criteria

UAT is acceptable only when:

1. `/protected` lands safely for all roles.
2. Fee Setup preview/publish works on `TEST-2026-27`.
3. Students add/edit and fee-profile override updates work.
4. Bulk add/update by SR number works with row-level review.
5. Dues and reports match expected test amounts.
6. Payment Desk can post a test payment and produce a receipt.
7. Read-only and accountant permission boundaries behave as expected.
8. Actual AY `2026-27` defaults remain unchanged.
9. No real records are present in the test session before go-live.
