# Fees Lib

Domain for fee policy resolution, fee heads, workbook calculation, regeneration,
conventional discounts, and config change logs.

Paired route/components: `/protected/fee-setup`, `components/fees`.

Preserve preview/apply behavior and paid-row protection. Historical payment
rows must not be rewritten by fee changes.

Use TEST-2026-27 for fee setup verification.
