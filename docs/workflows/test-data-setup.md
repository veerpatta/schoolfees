# Test Data Setup Guide

Maintain dummy data safely while the app is live.

## Use a Dedicated Test Session

Recommended label:

```text
TEST-2026-27
```

Also supported by parser (if needed):

- `UAT-2026-27`
- `DEMO-2026-27`

The live `2026-27` session contains real school financial records. Never
modify it for testing.

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

Never use real student names, real SR numbers, or real family contact details
in TEST-2026-27.

## Recommended Test Session Maintenance Sequence

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

## Ongoing Test Data Rules (Production)

The app is live. TEST-2026-27 is the permanent isolated test session.

- All debugging and feature testing happens in TEST-2026-27.
- Test student admission numbers are prefixed with TEST-.
- Never use real student names, real SR numbers, or real phone numbers
  in TEST-2026-27.
- Test payments post only against TEST- students.
- The live 2026-27 session must not be modified for testing purposes.
