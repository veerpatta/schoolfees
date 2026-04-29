# Test Data Setup Guide

Prepare dummy data safely before real go-live usage.

## Use a Dedicated Test Session

Recommended label:

```text
TEST-2026-27
```

Also supported by parser (if needed):

- `UAT-2026-27`
- `DEMO-2026-27`

Do not repurpose live AY `2026-27` data for tests.

## Keep Live AY 2026-27 Baseline Intact

Current live policy intent:

- late fee: `₹1000`
- due dates: `20-04-2026`, `20-07-2026`, `20-10-2026`, `20-01-2027`
- new student academic fee: `₹1100`
- existing student academic fee: `₹500`
- class 12 science tuition: `₹38000`
- receipt prefix: `SVP`

## Dummy Data Naming Rules

Use clearly fake values:

- `Test Student 001`
- `Test Student 002`
- `TEST-SR-001`
- `TEST-SR-002`
- `9999999999` placeholder phones

Never use real student names, real SRs, or real family contact details in UAT.

## Recommended UAT Sequence

1. Configure `TEST-2026-27` in Fee Setup.
2. Add dummy classes/routes if required (prefix with `TEST`).
3. Add dummy students manually and via import.
4. Validate dues preparation.
5. Post test payments only for dummy students.
6. Validate receipt printing, defaulters, exports.

## Conventional Discount Test Set

Include at least one dummy student for each policy:

- RTE
- Staff Child
- 3rd Child

And one combined-policy case to verify “lowest tuition wins”.

## After UAT Before Live Use

1. Export/save UAT evidence.
2. Stop using test session for live operations.
3. Confirm no dummy records in live AY workflow.
4. Rotate shared admin passwords.
5. Ensure no secrets/passwords were saved in repo/docs/prompts.
