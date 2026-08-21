# imports

The staged student import: upload, map, dry run, review, commit only what is valid.

| | |
|---|---|
| Route | /protected/imports |
| Files | 9 domain · 3 data · 9 ui |

## Owns

- Column mapping and validation
- The row-by-row review queue and duplicate audit
- Batch commit

## Invariants

- Every `import_rows` record carries a `batch_id`. Batch and row traceability survive the commit.
- Only valid rows commit. A partially-good file imports its good half and leaves the rest in the queue.

## Never

- Apply a conventional discount silently from import data. Discounts go through the explicit assignment workflow.

## Layout

`domain/` is pure rules — no Supabase client, no `fetch`. `data/` does the IO.
`ui/` is this module's components and belongs to it alone: another module may
import this one's `domain/` and `data/`, never its `ui/`.
`npm run quality:architecture` holds that, and only lets the count fall.
