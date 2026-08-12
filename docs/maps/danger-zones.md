# Danger Zones

These files and records must never be touched casually.

- `app/protected/payments/actions.ts` - only payment-posting surface.
- `lib/payments/*` - posting and preview logic for Payment Desk.
- `supabase/migrations/*` - append-only schema history; never rename or reorder.
- `lib/fees/regeneration.ts` - protects paid, partial, and adjusted rows.
- `lib/fees/policy.ts` - canonical fee policy resolver.
- `lib/supabase/admin.ts` - service-role client; never import in `components/` or in any file reachable from the browser bundle.
- `lib/config/fee-rules.ts` - authoritative when docs conflict.
- `academic_sessions` row `2026-27` - live production academic session.

Use `TEST-2026-27` for ongoing verification and debugging. Do not add test
students, test payments, or experimental fee changes to `2026-27`.

## Added since this list was written

- **`app/protected/payments/bulk/`** — the second posting surface. It is allowed only
  because every row goes through `post_student_payment_with_adjustments`, sequentially,
  keyed by the row's staged `client_request_id` so a re-run resolves to existing receipts
  instead of double-posting. Any change that bypasses that RPC breaks Hard Rule 5.
- **`app/protected/payments/waive-late-fee-actions.ts`** — the desk calls `waive_late_fee`
  *before* posting, so the posting RPC's guards never see the waiver. That was a real
  bypass for EMI students once.
- **`lib/repayment-plans/`** — a plan is never edited in place, and reschedule/cancel must
  price from the live snapshot, not the matview. Rescheduling off a stale matview once
  re-committed a family who had just paid ₹4,000 to their full pre-payment balance.
- **The late-fee rule exists twice** — `v_workbook_installment_balances` and
  `private.workbook_installment_snapshot`. Editing one and not the other is not a
  hypothetical; it happened, and EMI late fees were invisible to half the app for four days.
- **`supabase/schema.sql` is a generated artifact and currently stale.** Do not hand-edit
  it, and do not treat it as the schema. `supabase/db dump` will truncate it to zero bytes
  on a machine without Docker.
- **Cached objects outlive the deploy that wrote them.** `unstable_cache` entries survive a
  deployment, so adding a field to a cached payload means old-shaped entries are still
  being served. Version the cache key and normalise on read.
- **Class ids must be confined to the active session.** A bulk-update class lookup that was
  not session-scoped repointed 372 real students into `TEST-2026-27`.
