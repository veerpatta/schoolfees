# IMPORT_NOTES.md

## Current Status

Student spreadsheet import is implemented and used for **staged, reviewable**
bulk operations:

- Bulk Add new students
- Bulk Update existing students

It is a migration accelerator, not a replacement for staff review.

## Current Import Flow

1. choose `Bulk Add` or `Bulk Update`
2. download the matching XLSX template
3. upload CSV/XLSX
4. auto-match columns
5. run validation
6. review warnings/errors row-by-row
7. approve valid rows only
8. commit and keep full batch audit trail

## Matching Rules

Bulk Add:

- creates only new students
- duplicate SR/admission values are blocked/reviewed

Bulk Update:

- updates only existing students
- matching priority:
  1. Student ID
  2. SR/admission number
- name alone is never used as update identity

## Required/Helpful Field Behavior

- minimum add requirement remains office-friendly
- blank SR on add is allowed and auto-generates pending SR
- blank optional update fields keep existing values unchanged
- inconsistent workbook headings should be supported by mapping, not assumed

## Traceability Rules

Every import should keep:

- `import_batches` record
- row-level `import_rows` details
- file/header context
- validation outcomes
- accepted/rejected separation

Important implementation note:

- each inserted/upserted `import_rows` record must carry `batch_id`

## Dues Preparation After Import

After successful student import/update, the app should trigger dues-preparation
and finance-area revalidation for affected students/surfaces.

Operational caution:

- if imported session does not match active fee-policy session, student master
  save can succeed while dues/payment visibility waits for session alignment

## Conventional Discounts + Import Context

Current conventional discount system is implemented and auditable via dedicated
tables. Import behavior is intentionally locked down:

- The student import has **no** mapped fields for `conventionalPolicy1`,
  `conventionalPolicy2`, `conventionalFamilyGroup`, or `conventionalPolicyNotes`.
  Aliases like "Policy 1", "Family Group", or "Policy Notes" in an Excel header
  row are ignored by the auto-mapper and rejected by the manual mapping form.
- `buildImportStudentInput` always preserves the student's existing conventional
  policy assignment on update, and writes empty on create. Sheet cells cannot
  cause RTE (₹0 tuition), Staff Child (50%), or 3rd Child (₹6,000) to apply.
- Policy assignments must go through the dedicated Conventional Discount
  workflow so each application has an explicit audit-trail row.
- Export/report support may still include conventional discount student lists.

See audit finding 1.2 and `tests/integration/import-policy-isolation.test.ts`
for the regression coverage.

## Anti-Patterns (Do Not Implement)

- importing edits to posted payments/receipts
- hidden overwrite of existing student identity
- bypassing validation/preview
- deleting batch/row audit trail metadata

## Import Safety (Production)

These rules apply at all times:

- All import dry-runs and testing use TEST-2026-27.
- Never upload real student files into TEST-2026-27 (use dummy data only).
- Before committing a bulk import to the live 2026-27 session, always run
  a dry-run validation and review the anomaly queue.
- Import batches and row-level audit trails must be preserved — never
  delete import_batches or import_rows records.
- After a successful live import, the auto-prepare system fires in the
  background. Dues will appear within a minute for newly added students.
