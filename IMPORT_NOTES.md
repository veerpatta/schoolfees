# IMPORT_NOTES.md

## Status

Student spreadsheet import is implemented as a staged Student workflow for
bulk add and bulk update work. It supports ongoing office cleanup, but manual
student entry and review still take priority over blind automation.

Current import flow:

1. choose Bulk Add New Students or Bulk Update Existing Students
2. download the matching XLSX template
3. upload CSV/XLSX
4. let the app auto-match spreadsheet columns
5. run validation
6. review only rows needing correction or warnings
7. import valid students
8. keep the full batch/row trail for later review

Bulk Add requires only Student name and Class. SR no is recommended but blank
SR numbers are allowed and become unique `PENDING-SR-0001` style temporary
numbers. Bulk Update should start from the downloaded existing-students export.
Update matching uses Student ID first and SR/admission no second; name alone is
never used for automatic update.

## Planned Import Use Case

Future import work should help office staff bring student and fee-related data
from existing spreadsheets/workbooks into the app in staged, reviewable batches.

## Expected Student Import Fields

Current student import mapping accounts for:

- student ID (bulk update export only)
- student name
- class
- SR no
- DOB
- father name
- mother name
- father phone
- mother phone
- transport route
- student status (`New` / `Old`)
- tuition override
- transport override
- discount
- late fee waiver
- other fee / adjustment head
- other fee / adjustment amount
- record status
- notes

These inputs may arrive with inconsistent column names or mixed formatting.
Build the importer to support column mapping and validation instead of assuming
perfect spreadsheets.

## Import Design Rules

The implemented importer now:

- create an `import_batches` trail
- create per-row traceability in `import_rows`
- keep source filename, detected headers, and row counts
- support preview before posting
- show row-level validation failures clearly
- separate accepted rows from rejected rows
- preserve enough raw context to troubleshoot later
- avoid silent overwrite behavior

## Matching And Identity Guidance

Preferred student identity anchor:

- SR number should be treated as the strongest matching field when available

Supporting fields for review/matching:

- student name
- class
- DOB
- parent names
- phone numbers

If a row is ambiguous, prefer review/hold behavior over automatic merging.
Additional workbook import rules:

- normalize workbook class aliases such as `1st`, `2nd`, `XI Science`, `XII Commerce`, `JKG`, and `SKG`
- preserve raw source values when a class or route does not match master data
- allow signed other adjustment amounts
- map workbook `Old` to canonical stored value `existing`

## Fee Override Guidance

The current importer supports optional fee overrides.

Practical expectation:

- treat overrides as explicit exceptions
- keep a trace back to the source batch/row
- do not bury overrides inside opaque notes when a structured field can exist

## Safe Import Workflow

Current save behavior:

- existing students are never overwritten
- add mode creates new student records only; duplicate SR/admission numbers are
  blocked
- update mode updates existing student records only and matches by Student ID
  first, then SR/admission number
- new rows with blank SR/admission numbers get temporary pending SR numbers
- duplicate SR/admission numbers inside the same file are held for review
- blank optional cells in update rows leave existing values unchanged
- only approved valid rows are saved
- imports create/update student master records and optional student fee profiles only
- payment history is outside import scope and remains append-only

## Import Anti-Patterns

Avoid these behaviors:

- directly mutating historical payment rows through import
- silent replacement of existing student identity data
- skipping preview/validation
- deleting source-trace metadata
- assuming old spreadsheet rules are still current policy

## Policy Reminder

Old spreadsheet conventions may reflect historical SOP, including:

- due dates on the 10th
- Rs 50/day late fee

Those are historical reference only. Current import logic should align with the
active rules in `SCHOOL_RULES.md` unless a user explicitly asks for historical
data interpretation.

