# 🧪 Testing & Release Checklist

## Always use the test session

Use `TEST-2026-27` for:

- payment testing
- Fee Setup testing
- student add/edit testing
- import dry-runs
- finance-facing debugging

Never use live `2026-27` records for experiments.

## Standard validation commands

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

## Payment Desk / Fee Setup UAT

- Select a class.
- Choose a `TEST-` student.
- Confirm dues load without full-class posting.
- Preview a payment.
- Confirm amount, student, installment, and mode.
- Post one small test payment.
- Verify receipt matches confirmation.
- Try refresh/back/re-submit and confirm duplicate posting is blocked.
- Check Transactions shows read-only history.
- Change a test Fee Setup/default.
- Preview impact.
- Confirm paid rows are protected.
- Confirm Dashboard, Defaulters, and Exports reflect the test session after sync.

## Student workflow UAT

- Add a test student.
- Confirm pending SR behavior when SR is blank.
- Update class/route/session details.
- Confirm dues preparation runs.
- Confirm student detail shows fee breakdown.
- Confirm conventional discount block appears when assignment exists.

## Import UAT

- Use dummy data only.
- Use the correct Bulk Add or Bulk Update template.
- Confirm validation catches duplicates and missing required data.
- Confirm valid rows can be approved separately from invalid rows.
- Confirm `import_batches` and `import_rows` are preserved.
- Confirm dues preparation runs after commit.

## Release reporting language

Use these labels:

- ✅ Implemented in current branch
- 🟡 Pending browser/production verification
- 🔵 Planned next
- 🔴 Blocked
- ⚪ Historical / no longer active

