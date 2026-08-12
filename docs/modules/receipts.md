# Receipts

Lookup, reprint, share and reversal state for posted receipts.

> **This file previously documented a `NEXT_PUBLIC_RECEIPT_LAYOUT_V2` flag and a V1-vs-V2
> rollout.** That flag no longer exists anywhere in the codebase — a repo-wide search
> returns nothing. V3 is the layout; the older documents survive only for reprinting old
> receipts.

## Where it lives

| | |
|---|---|
| Routes | `/protected/receipts`, `/protected/receipts/[receiptId]` |
| Handlers | `/protected/receipts/search`, `/protected/receipts/[receiptId]/detail` |
| Public | `/r/[code]` — parent-facing verification page, no login |
| Components | `components/receipts/` |
| Lib | `lib/receipts/` |

`components/receipts/` holds three documents — `receipt-document-v3.tsx` (current),
`receipt-document-v2.tsx` and `receipt-document.tsx` (kept so an old receipt reprints as it
was issued) — plus the preview sheet, print/share actions, the undo action and the reversed
badge.

Parent-facing documents are **bilingual English + Hindi**, from
`messages/receipts-bilingual.json`.

## Reversal is visible, never silent

A receipt is append-only. It is never edited and never deleted. What changes is the
adjustments recorded against it:

- `v_receipt_reversal_totals` sums the reversal adjustments per receipt.
- A receipt whose reversals reach its total is **fully reversed**: it renders with a VOID
  stamp and a reversed badge, and it is excluded from every collection figure — dashboard,
  subtotals, EMI "collected this month", the student's "Paid".
- It stays visible on purpose. A number that quietly disappears is harder to trust than one
  that is shown and marked.

**Admin undo** (`undo_recent_payment`) is available for 10 minutes after posting. It
inserts full-amount reversal adjustments tagged `payment_undo:<receipt_id>` and touches
neither `payments` nor `receipts`. It refuses a receipt that already has adjustments or an
open refund request, and its reversals stay in the correction-review queue deliberately.

## Stamps

`components/ui/stamp.tsx` is the one stamp component — variants `paid`, `year-cleared`,
`void`, `draft`, `advance`, `closed-as-discount`. It replaced six hand-rolled copies.

It is theme-aware on screen but **forced to dark ink for print**, so a stamp survives a
photocopy. Stamps are decorative to screen readers; the fact they convey is always also in
the surrounding text.

## Family reprint

`/protected/students/family/[familyGroupId]/receipts` reprints for a confirmed family
group. Note that a receipt still belongs to **one student** — family payments as a posting
shape were removed in `20260521171500`. Individual posting is the only shape.

## Related

- `docs/modules/payment-desk.md` — where receipts are created
- `docs/maps/database-map.md` — `receipts`, `payment_adjustments`, `v_receipt_reversal_totals`
