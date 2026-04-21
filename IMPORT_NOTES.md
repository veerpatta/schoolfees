# IMPORT_NOTES.md

## Status

Spreadsheet import is planned later. It is important, but it should come after
the core manual workflows are dependable.

Treat import as a migration aid, not the product center of gravity.

## Planned Import Use Case

Future import work should help office staff bring student and fee-related data
from existing spreadsheets/workbooks into the app in staged, reviewable batches.

## Expected Student Import Fields

At minimum, future import mapping should account for:

- student name
- class
- SR no
- DOB
- father name
- mother name
- phones
- transport route
- fee overrides
- status

These inputs may arrive with inconsistent column names or mixed formatting.
Build the importer to support column mapping and validation instead of assuming
perfect spreadsheets.

## Import Design Rules

When import is built, it should:

- create an `import_batches` trail
- keep source filename and row counts
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

## Fee Override Guidance

Import may later need to support fee overrides.

Practical expectation:

- treat overrides as explicit exceptions
- keep a trace back to the source batch/row
- do not bury overrides inside opaque notes when a structured field can exist

## Safe Import Workflow

Recommended flow:

1. upload spreadsheet
2. map columns
3. validate rows
4. preview results
5. confirm posting
6. create batch audit trail
7. surface accepted/rejected counts

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
