# Audit Fix — Phase 2 (P1)

**Branch:** `fix/audit-p1-workflow`
**Audit:** `BUG_AUDIT_REPORT_2026-05-28.md` findings 1.8 – 1.15 + 1.21
**Status:** Implementation complete with tests. No migrations in this phase.

## Findings closed

| # | Title | Approach | Tests |
|---|---|---|---|
| 1.21 | Observability logger | New `lib/observability/log.ts` with `logInfo` / `logWarn` / `logError`. Production strips Postgres-noisy fields (`code`, `details`, `hint`, `constraint`) and reduces `Error` instances to `{ name, message }`. `logInfo` is silent in prod by default; opt-in via `VPPS_OBSERVABILITY_VERBOSE=1`. | `tests/unit/observability-log.test.ts` |
| 1.10 | Payment Desk preview cache | Switched `app/protected/payments/preview/route.ts` from `private, max-age=60, stale-while-revalidate=120` to `private, no-store, must-revalidate`. The student-summary endpoint keeps its existing cache. | `tests/ui/payment-preview-no-store.test.ts` |
| 1.11 | Readiness fallback fails safe | `getPaymentDeskReadiness` catch now returns `canPostPayments: false` with a generic "Readiness check failed" blocking reason. Admins keep the repair affordance. | `tests/unit/payment-desk-readiness-fail-safe.test.ts` + updated `tests/integration/payment-desk-readiness.test.ts` |
| 1.12 | Surface financial-state errors | `getStudentFinancialState` and `getConventionalDiscountForStudent` now log via the new logger instead of silently swallowing errors. Local return shape preserved so call sites stay compatible. | covered by `payment-desk-readiness-fail-safe.test.ts` |
| 1.8 | Payment posting path revalidation | `submitPaymentEntryAction` now calls `revalidateAfterPaymentPosting([studentId])` alongside `revalidateSessionFinance`, so Dashboard/Transactions/Receipts/Defaulters don't render stale snapshots after a payment posts. | `tests/unit/payment-post-revalidation.test.ts` |
| 1.15 | Persist Defaulters filters | New `DefaulterFilterRehydrator` client component uses `sessionStorage` under `vpps.defaulters.filters.v1`. Rehydrates via `router.replace` when URL has zero filter params; writes back when filters are non-empty. | `tests/unit/defaulter-filter-rehydrate.test.ts` |
| 1.9 | Regeneration discount cap (test-first) | Cap now compares against `resolved.breakdown.annualTotal` (includes books + custom heads) instead of the hand-rolled fallback. Removed `splitAcrossInstallments(Math.max(baseAmount, 0), ...)` — a negative base now throws with the student label rather than silently zeroing unpaid installments. | `tests/unit/regeneration-discount-cap.test.ts` (written failing first) |
| 1.13 + 1.14 | Missing-dues banners | New shared `MissingDuesBanner` (`components/shared/missing-dues-banner.tsx`). Defaulters page renders it above the list when `data.missingDuesRows` is non-empty; Imports page renders it when the post-commit redirect carries the "dues sync needs attention" message. | `tests/unit/missing-dues-banner.test.ts` |

## Validation log

| Step | Result |
|---|---|
| `npm run typecheck` | Clean. |
| `npm run lint` (changed files only) | Clean (one pre-existing react-hooks/exhaustive-deps warning in `components/payments/payment-desk-mobile.tsx`, not introduced here). |
| `npm run test` (vitest run) | 690 passing / 1 failing. Same pre-existing failure as Phase 1 (`payment feedback includes toast…` checks for literal English strings that were i18n-migrated). |
| `npm run build` | Clean. |

## No migrations

Phase 2 introduces no SQL migrations. Nothing to apply to TEST or production from this PR.

## Testing on TEST-2026-27 (recommended order)

1. **1.10** — Post a payment for a TEST student, then within a minute check the Payment Desk preview for that student in another tab. Confirm dues update immediately (no 60s stale window).
2. **1.11** — Temporarily block `v_workbook_student_financials` (e.g. via an RLS test policy on the TEST Supabase branch) and confirm the Payment Desk renders the "Readiness check failed" blocking reason rather than a green checkmark.
3. **1.8** — Post a payment for a TEST student, navigate to Dashboard / Transactions / Defaulters in a fresh tab and confirm the new state is visible without a hard reload.
4. **1.15** — Apply Defaulters filters, navigate away to Transactions, come back via the side nav, and confirm the filters are rehydrated. Close the tab and reopen — filters should clear (sessionStorage).
5. **1.9** — On TEST, set a discount amount higher than the annual total via Fee Setup; confirm the publish preview surfaces the rejection with the student label.
6. **1.13 / 1.14** — Force a commit that leaves a student in `missing_dues` (e.g. by importing a student whose class lacks an active fee setting on TEST) and confirm the banner appears on both `/protected/imports` and `/protected/defaulters`.
7. **1.21** — Trigger a forced failure on a payments query (deny a column read) and confirm the log line is sanitised in production (no constraint names) and verbose in development.

## Hard safety rules observed

- No edits to live `2026-27` data.
- No migrations — nothing to roll back, nothing to apply to production from this PR.
- No `NEXT_PUBLIC_*` exposure of the service-role key.
- Payment posting still gated to `/protected/payments`.
- Append-only invariant preserved.
