# Test Data Setup Guide

This guide explains how to prepare dummy data before real student data entry.
Use it for local, staging, or carefully isolated production UAT.

## Recommended Test Session

Use this academic session label:

```text
TEST-2026-27
```

Do not change the real active AY `2026-27` defaults for trial runs. The real
AY `2026-27` policy remains:

- late fee: Rs 1000
- due dates: 20-04-2026, 20-07-2026, 20-10-2026, 20-01-2027
- new student academic fee: Rs 1100
- old student academic fee: Rs 500
- Class 12 Science annual fee: Rs 38000
- books excluded from workbook-mode calculation

## Dummy Naming Rules

Never use real student names, real SR numbers, real parent phone numbers, or
real home addresses during UAT.

Use values like:

- student name: `Test Student 001`
- SR number: `TEST-SR-001`
- father phone: `9999999999`
- mother phone: `9999999999`
- route: `TEST ROUTE`
- notes: `Dummy UAT record only`

## Test Classes And Routes

If you need dedicated test master data, keep it clearly marked:

- `TEST CLASS 1`
- `TEST CLASS 12 SCIENCE`
- `TEST ROUTE`

If you use existing classes or routes, keep all students and SR numbers clearly
marked as test data so they can be identified before go-live.

## Setup Steps

1. Log in as admin.
2. Open Fee Setup.
3. Create or copy an academic session named `TEST-2026-27`.
4. Add any clearly marked test classes and routes needed for the run.
5. Enter test-only fee defaults.
6. Save Draft Review.
7. Review the impact preview.
8. Publish only when the preview is expected.
9. Open Students and create dummy students manually or through import.
10. Keep all UAT payments on dummy students only.

## Import Sample

Use `docs/samples/student-import-test-sample.csv` as a safe starting point. It
contains dummy students and dummy SR numbers only.

## After Testing

Before real go-live:

1. Export or screenshot any UAT evidence the school wants to keep.
2. Archive or clearly stop using `TEST-2026-27`.
3. Confirm no dummy students are mixed into the real AY `2026-27` working set.
4. Confirm actual AY `2026-27` values in Fee Setup.
5. Confirm staff are trained on the final workflow.

Do not mix test data with real production data. If UAT was done in a local or
staging database, reset that environment through normal database tooling only.
This repo intentionally does not add a production reset button.
