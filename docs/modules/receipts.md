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

### Three ways a receipt gets reversed

All three write the same compensating `payment_adjustments` rows, so every board, export and
day-close figure nets them without knowing which one ran. They differ only in who may run
them, when, and what they refuse.

| | Window | Permission | Notes tag | Refuses |
|---|---|---|---|---|
| `undo_recent_payment` | 10 minutes from `created_at` | `payments:adjust` | `payment_undo:` | any prior adjustment, any open refund |
| `reverse_receipt_admin` | none | `payments:reverse_any` | `admin_reversal:` | an open refund; an already-fully-reversed receipt |
| `process_refund_with_adjustment` | none | `finance:write` | `refund_request:` | over-refunding past the remaining headroom |

**Undo** is a mis-click walked back while the parent is still at the counter. It inserts
full-amount reversals and touches neither `payments` nor `receipts`.

**Admin reversal** is the wrong-fee-entry path: a receipt typed against the wrong child, for
the wrong amount, or twice, found a week later. No cash moved, so the refund workflow would
be recording an event that never happened. It reverses the **remaining headroom** on each
payment row rather than the gross amount, so a receipt already carrying a partial refund
reverses cleanly to zero. It requires a reason, and the UI asks the operator to type the
receipt number — the realistic mistake here is reversing the row above the one you meant.

Both leave their rows in the Finance Controls correction-review queue on purpose; only
`refund_request:` rows are filtered out of it.

**What a reversal does not undo.** `receipt_adjustments` — a Payment Desk quick discount or
late-fee waiver — is append-only with no negative-delta path, so those lines survive. The
RPC returns `concession_amount` and the dialog says so rather than implying a cleaner
reversal than actually happened. A waived late fee is billed again through
`void_late_fee_waiver`, separately.

The two staff paths are never offered together: the receipt page decides on the server which
one applies, so a receipt eleven minutes old shows the admin reversal and nothing else.

**Bulk corrections** live outside the app entirely — `scripts/bulk-apply.mjs` in
`payment-correction` mode, reverse + repost, CLI only. See
`docs/workflows/agent-bulk-operations.md`.

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
