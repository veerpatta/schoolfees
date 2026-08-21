# Import Lib

Domain for staged import parsing, validation, preview, commit support, and row
traceability.

Paired route/components: `/protected/imports`, `components/imports`.

Every import row must carry `batch_id`. Commit only reviewed valid rows, and
keep update matching keyed by Student ID first, then SR number.

Use TEST-2026-27 for import debugging.
