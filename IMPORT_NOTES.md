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
tables. Import behavior should remain conservative:

- do not silently assign complex family policies from ambiguous sheet data
- prefer explicit assignment workflow where audit reasoning is visible
- export/report support can include conventional discount student lists

## Anti-Patterns (Do Not Implement)

- importing edits to posted payments/receipts
- hidden overwrite of existing student identity
- bypassing validation/preview
- deleting batch/row audit trail metadata

## UAT Safety

- use `TEST-2026-27` for import UAT
- use dummy names and SR values only
- do not post test payments against real students
- do not modify live AY `2026-27` data for import testing
