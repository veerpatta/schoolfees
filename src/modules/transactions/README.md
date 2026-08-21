# transactions

The read-only financial record centre.

| | |
|---|---|
| Route | /protected/transactions |
| Files | 2 domain · 1 data · 3 ui |

## Owns

- Transaction listing, day summaries and filters
- The transaction export

## Invariants

- A reversed receipt appears here, marked, and counts toward no total.

## Never

- Write. This is the record, not the till.

## Layout

`domain/` is pure rules — no Supabase client, no `fetch`. `data/` does the IO.
`ui/` is this module's components and belongs to it alone: another module may
import this one's `domain/` and `data/`, never its `ui/`.
`npm run quality:architecture` holds that, and only lets the count fall.
