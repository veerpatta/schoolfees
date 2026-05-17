# Office Lib

Shared office helpers that do not belong to one module.

Remaining files:

- `data.ts` - cross-module office readiness and overview data.
- `readiness.ts` - workflow guard helper used by 8+ modules.

These helpers support module pages without owning module-specific behavior.

Module-specific logic belongs in focused folders:

- Transactions: `lib/transactions`
- Payment Desk: `lib/payments`
- Students: `lib/students`
- Fee Setup: `lib/fees`, `lib/setup`
- Imports: `lib/import`
- Defaulters: `lib/defaulters`

Do not add payment-posting paths here.
