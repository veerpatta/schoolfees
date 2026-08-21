# reports

Read-only reporting and the per-student ledger.

| | |
|---|---|
| Route | /protected/reports · /protected/ledger |
| Files | 2 domain · 2 data · 2 ui |

## Owns

- Report views and their data
- The student ledger and its print layout
- The builders behind the XLSX exports

## Invariants

- Everything here derives from Students + Fee Setup. If a report disagrees with the Payment Desk, the report is wrong.

## Never

- Write. Reports read.

## Layout

`domain/` is pure rules — no Supabase client, no `fetch`. `data/` does the IO.
`ui/` is this module's components and belongs to it alone: another module may
import this one's `domain/` and `data/`, never its `ui/`.
`npm run quality:architecture` holds that, and only lets the count fall.
