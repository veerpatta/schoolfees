# receipts

Receipt lookup, reprint, share, and the reversal that money corrections run through.

| | |
|---|---|
| Route | /protected/receipts · /r/[code] |
| Files | 10 domain · 2 data · 15 ui |

## Owns

- Receipt lookup and detail
- The printed and PDF documents, in English and Hindi
- Admin reversal, undo, and the public QR verification page

## Invariants

- **A reversed receipt stays visible and marked.** It is excluded from every collection figure and is never deleted or silently subtracted.
- `receipts` allows in-place updates to `reference_number`, `notes` and `received_by` only — every money column still raises. `payments`, `payment_adjustments` and `audit_logs` allow none.
- Two live layouts: `receipt-document-v3` is Ledger Calm 2.0 and the default; `layout="v2"` reproduces the earlier one for reprint parity. Both are current — neither is dead.
- `/r/[code]` is public by design and deliberately minimal: receipt number, date, amount, reversed. Widening it is the change that needs review.

## Never

- Delete a receipt.
- Reprint a reversed receipt without its reversed marking.

## Layout

`domain/` is pure rules — no Supabase client, no `fetch`. `data/` does the IO.
`ui/` is this module's components and belongs to it alone: another module may
import this one's `domain/` and `data/`, never its `ui/`.
`npm run quality:architecture` holds that, and only lets the count fall.
