# VPPS UAT Test Plan

Use this plan before entering real student records for Shri Veer Patta Senior
Secondary School.

## UAT Safety First

- prefer local/staging UAT
- if production UAT is unavoidable, isolate with `TEST-2026-27`
- use dummy records only (`Test Student 001`, `TEST-SR-001`, etc.)
- do not post test payments against real students
- do not rewrite posted payment/receipt history

## 1) Login, Role Landing, and Navigation

1. Login as admin -> `/protected` should land on `Dashboard`.
2. Login as accountant -> `/protected` should land on `Payment Desk`.
3. Login as read-only staff -> `/protected` should land on `Dashboard`.
4. Verify no `/protected` self-redirect loop.
5. Verify top-level daily nav includes Dashboard, Students, Fee Setup,
   Payment Desk, Transactions, Defaulters, Exports.

## 2) Fee Setup Publish Flow

1. Open `Fee Setup`.
2. Use `TEST-2026-27` for test policy updates.
3. Set installment dates, late fee, class tuition, route fees, and
   new/existing academic fee.
4. Run preview and review impacted + protected rows.
5. Publish only after preview matches expectation.
6. Confirm paid/partial/adjusted rows are protected, not rewritten.

## 3) Student Master + Dues Preparation

1. Add `Test Student 001` with `TEST-SR-001`.
2. Verify add/edit flow and session-aware class options.
3. Change route and confirm dues prep refresh behavior.
4. Verify student fee overrides are reflected in dues preparation.

## 4) Conventional Discount Policy Tests

For session `TEST-2026-27`, validate:

1. RTE assignment sets tuition candidate to ₹0.
2. Staff Child assignment applies 50% tuition candidate.
3. 3rd Child policy applies ₹6000 tuition candidate.
4. Multiple policy candidates choose lowest tuition.
5. More than two active conventional policies for a student/year is blocked.
6. Post-payment policy assignment can surface pending or credit/refund impact.

## 5) Bulk Import (Add + Update)

1. Download template and upload dummy add file.
2. Validate mapping + dry run.
3. Approve valid rows and commit.
4. Upload update file for same dummy records.
5. Verify update matching by Student ID then SR/admission.
6. Confirm blank optional update cells preserve existing values.
7. Confirm import audit trail exists by batch and row.

## 6) Payment Desk + Receipt Flow

1. Open Payment Desk.
2. Select class first, then student.
3. Verify due rows load (or guided fallback if missing).
4. Post test payment with reference number optional.
5. Confirm receipt success + print/open options.
6. Use “Collect Another Payment” flow.
7. Confirm duplicate post prevention/idempotency behavior.
8. Verify posted rows appear in Transactions and remain immutable.

## 7) Defaulters + Exports

1. Open Defaulters and verify rank/order changes with due/overdue changes.
2. Apply class/route/min due/days filters.
3. Open Exports and download key XLSX files:
   - all students
   - class-wise dues
   - defaulters
   - receipt register
   - conventional discount students
   - refund/credit due report (if configured)

## 8) Print and Record Checks

1. Print receipt on A4.
2. Verify school branding/logo area and signature block.
3. Confirm return links to Transactions/context work where available.

## Exit Criteria

UAT passes when:

- role landing + protected routing behave correctly
- Students + Fee Setup changes propagate to daily modules
- payment + receipt flow is stable and append-only
- conventional discounts behave as policy-defined
- defaulters + exports produce expected office outputs
- no real student/payment data was used during UAT
