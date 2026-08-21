# Students Lib

Domain for student master data, validation, workspace loading, dues sync, and
delete/archive policy.

Paired route/components: `/protected/students`, `components/students`.

Students plus Fee Setup are source of truth for downstream dues and reports.

Keep updates session-aware and route finance refresh through the established
sync helpers. Never use name-only matching for bulk updates.
