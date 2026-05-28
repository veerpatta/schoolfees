# Audit Fix — Phase 1 (P0)

**Branch:** `fix/audit-p0-financial`
**Audit:** `BUG_AUDIT_REPORT_2026-05-28.md` findings 1.1 – 1.7
**Status:** All seven P0 findings implemented and unit/integration tested.

## Findings closed

| # | Title | Approach | Tests |
|---|---|---|---|
| 1.1 | Bulk-print confirm inverted | Rephrased the prompt to "Open all N anyway? Cancel to split into batches" and inverted the guard. Sheet-based modal swap is deferred to finding 1.16 (focus-trap remediation). | `tests/ui/transactions-bulk-print.test.ts` |
| 1.2 | Import auto-mapped Conventional Discount columns | Removed the four `conventionalPolicy*` / `conventionalFamilyGroup` entries from `studentImportFieldDefinitions`; hardened `buildImportStudentInput` to preserve existing values on update and write empty on create, ignoring any payload-derived conventional policy data. | `tests/integration/import-policy-isolation.test.ts` |
| 1.3 | Receipt-retry idempotency re-check | New migration `20260528151701_restore_receipt_idempotency_recheck.sql` recreates `post_student_payment_with_adjustments` with a `client_request_id` re-query inside the `unique_violation` handler. All other behaviour (allocation snapshot columns, upfront idempotency check, advisory lock, 12-attempt loop) is preserved. | `tests/integration/post-student-payment-idempotency.test.ts` |
| 1.4 | Soft daily-amount duplicate prompt | Added `findLikelyDailyDuplicateReceipt` catching same-student / same-date / same-amount payments regardless of mode/reference, with no 60s window. Surfaced via the existing `DuplicateReceiptSheet` with a new "Continue anyway" button that sets `acknowledgeDailyDuplicate=true` on resubmit. | `tests/integration/payment-desk-soft-duplicate.test.ts` |
| 1.5 | Late-fee waiver advisory lock | New migration `20260528151726_waive_late_fee_advisory_lock.sql` introduces `waive_late_fee` RPC that takes `pg_advisory_xact_lock` with the same salt as `post_student_payment_with_adjustments` and runs read-validate-update atomically. The Next.js action calls the RPC instead of the previous read-then-write through `upsertStudentFeeOverride`. | `tests/integration/late-fee-waiver-lock.test.ts` |
| 1.6 | Hardcoded `"2026-27"` workspace fallback | Family workspace fallback now resolves the session label via the member's own label, then the active fee policy. Throws a typed `WorkspaceContextError` if neither resolves. | `tests/unit/workspace-session-fallback.test.ts` |
| 1.7 | Defaulter export ignores filters | Added `getDefaulterExportRows(filters, sessionLabel)` helper, extended `/protected/exports/defaulters` to read filter params from the query string, and updated the Defaulters page export button to forward `classId`, `transportRouteId`, `overdue`, `minPendingAmount`, `query`. Unfiltered quick-link continues to fall back to `getOfficeWorkbookData`. | `tests/integration/defaulters-export-respects-filters.test.ts` |

## Validation log

| Step | Result |
|---|---|
| `npm run typecheck` | Clean. |
| `npm run lint` (changed files only via `npx eslint`) | Clean except for one pre-existing react-hooks/exhaustive-deps warning in `components/payments/payment-desk-mobile.tsx:1179` (not introduced by this PR). |
| `npm run test` (vitest run) | 698 passing / 1 failing. The one failure is `tests/integration/payment-desk-workflow.test.ts > payment feedback includes toast, distinct haptics, and improved skeleton markers` — it asserts on literal English strings (`"Receipt ${state.receiptNumber} posted"`) that were migrated to next-intl long before this branch. The same test fails on `main`. Not in scope for this PR; tracked for a separate cleanup. |
| `npm run build` | Clean. |

## Production migration plan

Migrations 1.3 (`20260528151701_restore_receipt_idempotency_recheck.sql`) and 1.5 (`20260528151726_waive_late_fee_advisory_lock.sql`) are **not yet applied to production**. Rollout is tracked in `docs/go-live/audit-fix-rollout.md`. The high-level sequence:

1. Apply to a Supabase TEST branch via the Supabase MCP `apply_migration` tool. Never invoke `apply_migration` against the production `project_ref`.
2. Replay the integration tests above against TEST.
3. Replay `scripts/verify-live-fee-health.mjs` (read-only) against TEST to confirm no schema/view regressions.
4. Coordinate a low-traffic window with raj@vpps.co.in.
5. Apply to production via the same migration files under version control. Capture `mcp__supabase__get_logs` output immediately after.
6. Smoke-test `/protected/payments` with a small pre-approved real receipt and a small late-fee waiver.

## Testing on TEST-2026-27 (recommended order)

1. Bulk-print invert (1.1) — visit Transactions, select > 10 receipts, click Print, confirm OK opens tabs and Cancel aborts.
2. Import lockdown (1.2) — upload an XLSX with a "Policy 1" column, walk the mapping UI, confirm no field auto-maps and the column cannot be force-mapped. Commit and confirm no `student_conventional_discount_assignments` row is created.
3. Defaulter export (1.7) — narrow filters by class + route, click "Download this view", confirm XLSX rows match on-screen totals.
4. Soft daily duplicate (1.4) — post a payment for a TEST student, then immediately post another with the same amount but a different mode + reference. Confirm the "Continue anyway" button is offered, that clicking it posts a separate receipt, and that the next collection-another flow re-shows the prompt.
5. Late-fee waiver (1.5) — after the TEST migration is applied, run two parallel waivers for the same TEST student and confirm the total waiver never exceeds the pending late fee.
6. Receipt idempotency (1.3) — after the TEST migration is applied, drive two parallel `postStudentPayment` calls with the same `client_request_id` and confirm both return the same receipt id.
7. Workspace session fallback (1.6) — create a family group with no members in a TEST session, confirm the workspace surfaces a typed error rather than guessing "2026-27".

## Hard safety rules observed

- No edits to live `2026-27` payments / receipts / payment_adjustments.
- No `apply_migration` against the production `project_ref`.
- No `NEXT_PUBLIC_*` exposure of `SUPABASE_SERVICE_ROLE_KEY`.
- Payment posting remains gated to `/protected/payments` (the late-fee waiver RPC is invoked from the Payment Desk action, not a parallel posting surface).
- Append-only invariant preserved on payments / receipts / payment_adjustments by every migration.
