# defaulters

The daily follow-up list, and the contact log behind it.

| | |
|---|---|
| Route | /protected/defaulters |
| Files | 10 domain · 2 data · 17 ui |

## Owns

- The worklist and its filters
- Contact logging, promises, no-call flags, voice notes
- The WhatsApp draft a collector sends

## Invariants

- **A late fee never makes a student a defaulter.** Overdue is decided by `pending_amount`, which is fees only. A family whose only debt is a late fee is not on this list.
- Money counts `record_status = 'active' OR total_paid > 0` — a student who left owing money still owes it.

## Never

- Take a payment here. Collection happens at the Payment Desk.

## Layout

`domain/` is pure rules — no Supabase client, no `fetch`. `data/` does the IO.
`ui/` is this module's components and belongs to it alone: another module may
import this one's `domain/` and `data/`, never its `ui/`.
`npm run quality:architecture` holds that, and only lets the count fall.
