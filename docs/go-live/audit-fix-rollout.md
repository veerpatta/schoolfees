# Audit Fix — Production Migration Rollout

Live tracking for the migrations introduced by the audit fix phases. Production application requires explicit approval from raj@vpps.co.in for each window.

## Migrations

| Phase | Migration | Source finding | Risk profile |
|---|---|---|---|
| 1 | `20260528151701_restore_receipt_idempotency_recheck.sql` | 1.3 — receipt-retry idempotency | Function-only change. Drops + recreates `post_student_payment_with_adjustments` with the same signature; adds a `client_request_id` re-query inside the `unique_violation` handler. No table or view changes. |
| 1 | `20260528151726_waive_late_fee_advisory_lock.sql` | 1.5 — late-fee waiver advisory lock | New `waive_late_fee` RPC. No schema changes; only writes to `student_fee_overrides.late_fee_waiver_amount` and `reason`. |
| 4 | `20260528151933_cleanup_post_payment_function.sql` | 1.29 + 1.30 — post-payment cleanup | Function-only change. Recreates `post_student_payment_with_adjustments` with: per-installment notes nulled (audit 1.29) + workbook snapshot cached in a temp table (audit 1.30). Compatible with Phase 1's audit-1.3 migration via `create or replace`. |

## Per-migration rollout checklist

For each migration:

- [ ] Apply to a Supabase TEST branch via the Supabase MCP `create_branch` then `apply_migration`. Verify with `get_logs`.
- [ ] Run the relevant integration tests on the TEST branch (see `docs/go-live/audit-fix-phase-{1,4}.md`).
- [ ] Run `scripts/verify-live-fee-health.mjs` (read-only) against TEST.
- [ ] Coordinate a low-traffic window with raj@vpps.co.in (typically before 09:00 IST when the office opens).
- [ ] Apply to production via the same migration file under version control. Capture `mcp__supabase__get_logs` output post-apply.
- [ ] Smoke-test the affected workflow on production with a small pre-approved payment / waiver.
- [ ] Record the window in this file under "Applied".

## Applied

| Date (IST) | Migration | Notes |
|---|---|---|
| 2026-05-28 | `restore_receipt_idempotency_recheck` | Applied via Supabase MCP `apply_migration`. Zero Postgres ERROR/FATAL in logs immediately after. |
| 2026-05-28 | `waive_late_fee_advisory_lock` | Applied via Supabase MCP. Note: the Phase 1 action invokes this via `createClient` (user JWT) per the hotfix — service-role JWT would fail the in-RPC `has_permission` check because `auth.uid()` is null. |
| 2026-05-28 | `cleanup_post_payment_function` | Applied via Supabase MCP. Post-apply `pg_get_functiondef('post_student_payment_with_adjustments'::regproc)` matches the migration file byte-for-byte. Audit 1.3 idempotency re-check still present inside the `unique_violation` handler. |

## Recommended application order

1. Phase 1's `20260528151701_restore_receipt_idempotency_recheck.sql` (closes the idempotency race).
2. Phase 1's `20260528151726_waive_late_fee_advisory_lock.sql` (introduces the new RPC; only affects waiver workflow).
3. Phase 4's `20260528151933_cleanup_post_payment_function.sql` (note-stamp cleanup + snapshot caching; supersedes Phase 1's #1 if applied last).

If only the final state matters, applying #3 alone is sufficient — it carries audit 1.3 inside its own handler. Applying #1 then #3 is the safest path because it lets you verify the idempotency change in isolation first.

## Hard safety rules

- **Never** invoke `mcp__supabase__apply_migration` against the production `project_ref` without explicit user approval per the per-migration checklist above.
- **Never** apply migrations from this audit during office hours (≈ 09:00 – 17:00 IST) without a rollback plan in this document.
- Migrations in this audit are all additive or function-only; if a rollback is needed, the previous migration text (`20260527033430_persist_payment_allocation_snapshot.sql` for 1.3; the original `waive-late-fee-actions.ts` read-then-write for 1.5) can be redeployed.
- TEST validation must include at least one concurrent-write reproduction for 1.3 and 1.5, since both fixes target races that single-actor smoke tests will not surface.
