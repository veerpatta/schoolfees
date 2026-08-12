# Students Components

Route served: `/protected/students`.

Paired domain lib: `lib/students`.

Owns student master data, student-level exceptions, class/session filters,
detail/edit flows, and bulk-entry entry points.

Keep Students separate from daily payment posting. Student changes should
trigger safe dues preparation through the established sync path.

Key files include `student-list-table.tsx`, `student-form.tsx` (1,400-line CI budget),
`student-bulk-import-dialog.tsx`, `segment-filter-groups.tsx`, `active-filter-summary.tsx`
and `student-repayment-plan-card.tsx`. There is no `student-filters.tsx` — filtering moved
into the segment chips.

Detail: `docs/modules/students.md`.

Use TEST-prefixed students for workflow checks.
