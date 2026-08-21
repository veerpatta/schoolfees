# finance-controls

Day close, refunds, and the correction review queue.

| | |
|---|---|
| Route | /protected/finance-controls |
| Files | 3 domain · 2 data · 1 ui |

## Owns

- The read-only automatic day-close view
- Refunds, which post a `reversal` adjustment
- The pending-correction queue

## Invariants

- A refund moves money in the projection, so it must bust the `session:{label}` cache tag. It did not once, and the dashboard served stale figures until the next posting cleared them.

## Never

- Edit a posted receipt. A refund is a compensating row, not an edit.

## Layout

`domain/` is pure rules — no Supabase client, no `fetch`. `data/` does the IO.
`ui/` is this module's components and belongs to it alone: another module may
import this one's `domain/` and `data/`, never its `ui/`.
`npm run quality:architecture` holds that, and only lets the count fall.
