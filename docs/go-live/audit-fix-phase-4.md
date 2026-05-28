# Audit Fix — Phase 4 (P3 — polish)

**Branch:** `fix/audit-p3-polish`
**Audit:** `BUG_AUDIT_REPORT_2026-05-28.md` findings 1.24, 1.26, 1.28, 1.29, 1.30
**Status:** Closed. One migration ships in this phase (cleanup of the post-payment function).

## Findings closed

| # | Title | Approach | Tests |
|---|---|---|---|
| 1.24 | SQL-injection harden | UUID-validate policy IDs before concatenating into the `.not("policy_id", "in", …)` filter. Empty-list sentinel preserved. | `tests/unit/conventional-discount-uuid-guard.test.ts` |
| 1.26 | Defaulter XLSX sort | Sort `getOfficeWorkbookData`-backed defaulter export by `outstandingAmount desc` with name as tiebreaker, matching the on-screen heat order. (The audit 1.7 "Download this view" path was already sorted.) | included in `tests/unit/fee-breakdown-error-payload.test.ts` |
| 1.28 | Surface studentId on fee-breakdown error | Catch in `/protected/defaulters/fee-breakdown/route.ts` returns `studentId` + `errorCode: "FEE_BREAKDOWN_FAILED"` so the Worklist Drawer can render an actionable message. | `tests/unit/fee-breakdown-error-payload.test.ts` |
| 1.29 + 1.30 | Migration cleanups | Single migration `20260528101000_cleanup_post_payment_function.sql` recreates `post_student_payment_with_adjustments` with: per-installment `payments.notes` and `receipt_adjustments.notes` nulled (receipts.notes stays canonical) + `private.workbook_installment_snapshot` called once and cached in a temp table for the per-installment loop. Preserves audit 1.3 idempotency re-check and the per-student advisory lock. | `tests/integration/post-payment-cleanup-migration.test.ts` |

## Skipped intentionally

| # | Title | Why |
|---|---|---|
| 1.25 | Date format decision | Needs raj@vpps.co.in sign-off on canonical format (`28 May 2026` vs `28-05-2026`). Tracked as a one-question doc decision; flip the formatter once decided. |
| 1.27 | Auto-print fires before layout | Lower value than the others; either remove auto-print (UX choice for staff) or wait on `document.fonts.ready` + `requestIdleCallback`. Tracked for a follow-up. |

## Validation log

| Step | Result |
|---|---|
| `npm run typecheck` | Clean. |
| `npm run lint` (changed files) | Clean. |
| `npm run test` | 672 / 673 passing (same pre-existing test failure as earlier phases). |
| `npm run build` | Clean. |

## Migration rollout

Migration `20260528101000_cleanup_post_payment_function.sql` is **not yet applied to production**. The rollout sequence (see `docs/go-live/audit-fix-rollout.md`):

1. Apply to a Supabase TEST branch via the Supabase MCP `apply_migration`.
2. Run `tests/integration/post-payment-cleanup-migration.test.ts` against TEST.
3. Run `scripts/verify-live-fee-health.mjs` (read-only) on TEST and confirm clean.
4. Schedule low-traffic window with raj@vpps.co.in.
5. Apply to production via the same migration file; capture `mcp__supabase__get_logs` output.
6. Smoke-test `/protected/payments` with a small pre-approved real receipt.

**Migration ordering note:** This migration is intentionally compatible with Phase 1's `20260528100000_restore_receipt_idempotency_recheck.sql`. Both use `create or replace function` so whichever applies last wins. If they apply in order, this cleanup is the final function body. The cleanup also preserves audit 1.3's idempotency re-check inside its own `unique_violation` handler, so production cannot regress on 1.3 even if 1.3's migration is rolled back.

## Hard safety rules observed

- No edits to live `2026-27` data.
- One migration ships in this PR; not yet applied to production.
- No `NEXT_PUBLIC_*` exposure of the service-role key.
- Payment posting stays gated to the Payment Desk surface.
- Append-only invariant preserved.
