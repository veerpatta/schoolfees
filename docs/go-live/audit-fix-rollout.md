# Audit Fix — Production Migration Rollout

Live tracking for the migrations introduced by the audit fix phases. Production application requires explicit approval from raj@vpps.co.in for each window.

## Pending migrations

| Phase | Migration | Source finding | Risk profile |
|---|---|---|---|
| 1 | `20260528100000_restore_receipt_idempotency_recheck.sql` | 1.3 — receipt-retry idempotency | Function-only change. Drops + recreates `post_student_payment_with_adjustments` with the same signature; adds a `client_request_id` re-query inside the `unique_violation` handler. No table or view changes. |
| 1 | `20260528100100_waive_late_fee_advisory_lock.sql` | 1.5 — late-fee waiver advisory lock | New `waive_late_fee` RPC. No schema changes; only writes to `student_fee_overrides.late_fee_waiver_amount` and `reason`. |

(Phases 2–4 will append rows here as their migrations are written.)

## Per-migration rollout checklist

For each migration:

- [ ] Apply to a Supabase TEST branch via the Supabase MCP `create_branch` then `apply_migration`. Verify with `get_logs`.
- [ ] Run the relevant integration tests on the TEST branch (see `docs/go-live/audit-fix-phase-{1,2,3,4}.md`).
- [ ] Run `scripts/verify-live-fee-health.mjs` (read-only) against TEST.
- [ ] Coordinate a low-traffic window with raj@vpps.co.in (typically before 09:00 IST when the office opens).
- [ ] Apply to production via the same migration file under version control. Capture `mcp__supabase__get_logs` output post-apply.
- [ ] Smoke-test the affected workflow on production with a small pre-approved payment / waiver.
- [ ] Record the window in this file under "Applied".

## Applied

(empty — no production migrations applied from this audit yet)

## Hard safety rules

- **Never** invoke `mcp__supabase__apply_migration` against the production `project_ref` without explicit user approval per the per-migration checklist above.
- **Never** apply migrations from this audit during office hours (≈ 09:00 – 17:00 IST) without a rollback plan in this document.
- Migrations in this audit are all additive or function-only; if a rollback is needed, the previous migration text (`20260527033430_persist_payment_allocation_snapshot.sql` for 1.3; the original `waive-late-fee-actions.ts` read-then-write for 1.5) can be redeployed.
- TEST validation must include at least one concurrent-write reproduction for 1.3 and 1.5, since both fixes target races that single-actor smoke tests will not surface.
