# Receipts module

## Layout flag — `NEXT_PUBLIC_RECEIPT_LAYOUT_V2`

The receipt document ships in two layouts. The active layout is decided at
build time by the `NEXT_PUBLIC_RECEIPT_LAYOUT_V2` env variable:

| Env value         | Layout |
| ----------------- | ------ |
| unset / falsy     | **V1** — the long-standing receipt with totals strip, conventional discount block, installments table, fee breakup, footer signature. Production default. |
| `1` / `true` / `on` / `yes` | **V2** — the simplified P1.3 layout. Default ON in `TEST-2026-27`. |

### V2 hierarchy

1. **School header** — logo + school name + receipt number + date.
2. **Student strip** — name / SR / class / father / phone in one compact row.
3. **Installment table** — one row per installment paid today. Columns:
   *Installment*, *Pending Before*, *Paid*, *Balance After*.
4. **Totals footer** — *Total Paid Today*, *Balance Due After*, *Amount in Words*.
5. **Signature line** — official receipt + keep-for-records statements + authorised signature.
6. **Collapsed Fee detail** — conventional discount block + full fee breakup. Renders on A4 prints, hidden on 80mm thermal via `@media print` CSS.

### Office staff guidance

- Receipt numbers and amounts are unchanged. Parent-facing values reconcile against the prior format.
- The 80mm thermal print path is unchanged in width and font sizing — existing printers do not need reconfiguration.
- On A4 batch prints (Family Reprint page), the expanded *Fee detail* section appears between the totals footer and the signature line.

### Flipping the flag in production

After UAT review against `TEST-2026-27`, the flag can flip on in production
by setting `NEXT_PUBLIC_RECEIPT_LAYOUT_V2=1` in Vercel project env and
re-deploying. Roll back by removing the env var.
