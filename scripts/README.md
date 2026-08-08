# Scripts

## Active Scripts

Operational / verification scripts run by hand or via `package.json`:

- `bootstrap-staff.mjs` — server-only staff bootstrap for controlled setup
  (`npm run bootstrap:staff`).
- `check-quality-budgets.mjs` — quality-budget gate; also runs
  `audit-money-formatting.mjs` (`npm run quality:budgets`).
- `audit-money-formatting.mjs` — fails on raw currency formatting; invoked by the
  quality-budget gate.
- `audit-test-data-in-public.mjs` — guards against TEST data leaking into the
  public schema (covered by `tests/unit/migration-verification-scripts.test.ts`).
- `verify-live-fee-health.mjs` — production fee-health verification
  (`npm run verify:fee-health`).
- `verify-live-sync-health.mjs` — system sync verification.
- `verify-phase1-migrations.mjs` — migration/readiness verification.
- `verify-required-sessions.mjs` — confirms required academic sessions exist.
- `verify-workbook-parity.mjs` — workbook financial-parity diagnostic.
- `repair-discount-drift.mjs` — reports students whose ledger disagrees with
  their resolved fee policy, and (with `--apply`) re-runs the fee engine for
  them via `/api/admin/repair-discount-drift`. Read-only by default; splits the
  report into dues-going-down and dues-going-up, because the second kind must
  never be applied without review. Run migration `20260807120000` first —
  before it, the drift is the view's fault, not the ledger's.
  `node scripts/repair-discount-drift.mjs --session 2026-27 [--apply]`
- `translate-placeholders.mjs` — i18n placeholder/translation tooling
  (see `docs/i18n/dictionary-status.md`).
- `migrate-test-data-to-test-schema.ts` — one-time-per-environment TEST-data
  migration (see `docs/test-environment-isolation.md`).

## Archived (Do Not Re-Run Without Review)

Completed one-time helpers, kept for reference only:

- `scripts/_archive/2026-05-import/` — completed May 2026 VPPS import/region/apply
  helpers (`vpps-*`, `region-copy-*`, `_emit-*`, `_extract-mcp-result`,
  `_post-vpps-apply-via-edge`, `dedupe-installment-labels`).
- `scripts/_archive/design-tokens-migration/` — completed design-token migration.
- `scripts/_revamp/` — May 2026 revamp helpers; output is gitignored (real PII).
