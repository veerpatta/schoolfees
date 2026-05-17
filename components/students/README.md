# Students Components

Route served: `/protected/students`.

Paired domain lib: `lib/students`.

Owns student master data, student-level exceptions, class/session filters,
detail/edit flows, and bulk-entry entry points.

Keep Students separate from daily payment posting. Student changes should
trigger safe dues preparation through the established sync path.

Key files include `student-list-table.tsx`, `student-form.tsx`,
`student-filters.tsx`, `student-bulk-import-dialog.tsx`, and status/session
helper components.

Use TEST-prefixed students for workflow checks.
