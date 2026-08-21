# activity

The audit feed: who did what, when, and to which record.

| | |
|---|---|
| Route | /protected/admin-tools/activity |
| Files | 1 data |

## Owns

- Writing `audit_logs` rows via `recordActivity()`
- Reading them back for the activity screen

## Invariants

- `recordActivity()` no-ops without a `userId`. A headless caller that wants an audit trail must pass one — this is why `scripts/bulk-apply.mjs` threads an actor through every write.

## Never

- Delete or rewrite an audit row. The trail is append-only like the money it describes.

## Layout

`domain/` is pure rules — no Supabase client, no `fetch`. `data/` does the IO.
`ui/` is this module's components and belongs to it alone: another module may
import this one's `domain/` and `data/`, never its `ui/`.
`npm run quality:architecture` holds that, and only lets the count fall.
