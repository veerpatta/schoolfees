# Import Components

Route served: `/protected/imports`.

Paired domain lib: `lib/import`.

Owns staged student import review: upload, mapping, dry run, anomaly review,
and explicit commit of valid rows.

Do not commit rows on dialog close. Imports must preserve batch and row
traceability and route finance refresh through the existing sync path.

Key files include `student-import-workflow.tsx`, `batch-upload-card.tsx`,
`column-mapping-card.tsx`, `anomaly-queue.tsx`, and `import-commit-card.tsx`.
