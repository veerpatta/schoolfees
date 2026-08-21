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

## Not listed above

Added since this index was written:

- `verify-late-fee-health.mjs` — 8 late-fee invariants (both engines agree, the split adds
  up, no chargeable installment is stuck at a zero rate). Exits 1, so it can gate a deploy.
- `measure-route-bundles.mjs` — route JS against `quality/route-bundle-baseline.json`.
  `--check` fails CI. Ceilings ratchet **down**.
- `audit-money-formatting.mjs` — fails on raw `toLocaleString('en-IN')` / `Intl` /
  hand-written `₹` outside `src/platform/helpers/currency.ts`. Run via `quality:budgets`.
- `capture-readiness-auth.mjs` — captures the Playwright auth state.
- `prev-year-dues-core.mjs` + `prev-year-dues-dry-run.mjs` — carry-forward matching, no writes.
- `verify-mcp-health.mjs` — cross-checks the deployed MCP server's totals against the
  database's own rollups and fails on any delta. Read-only. The MCP server itself lives in
  `workers/schoolfees-mcp/`; the local stdio twin that used to sit here was retired once
  both transports came to share one core.
- `bulk-apply.mjs` + `bulk-apply-operations.mjs` — the sanctioned harness for an agent to
  change many rows at once when no screen in the app can. Dry run by default; `--apply` is
  opt-in; `--session 2026-27` is refused without `--live`; fee-moving operations need
  `--allow-fee-impact`; every write lands an `audit_logs` row with a reason and an actor,
  because `recordActivity()` no-ops without a `userId`. Operations are a closed allowlist —
  adding one is a small reviewable diff in `bulk-apply-operations.mjs`.
  Read `docs/workflows/agent-bulk-operations.md` first.
  `node scripts/bulk-apply.mjs --plan <file.json> --session TEST-2026-27 [--apply]`
- `bulk-apply-payment-corrections.mjs` — the harness's second mode, for payment data that was
  entered wrong. Set the plan's `operation` to `payment-correction`; ops are `amount`,
  `student`, `date-mode`, `allocation` and `metadata`. All but the last are **reverse +
  repost** — the append-only triggers refuse a column UPDATE on `payments`/`receipts` for the
  service role too, so a correction gives the wrong receipt back and posts a right one. It
  carries the same guards plus a `from*` re-check at apply time, and asks the app to bust its
  caches afterwards, which a Node process cannot do itself. There is no UI for it on purpose.
  `node scripts/bulk-apply.mjs --plan <file.json> --session TEST-2026-27 --apply --allow-fee-impact`

## Retired scripts

`scripts/_archive/` and `scripts/_revamp/` were deleted in the feature-first
restructure. They held finished one-time work that had already run against
production, and a directory of scripts nobody may run is a directory every
reader still has to rule out.

They are not gone, only out of the way. The one worth naming is the May 2026
workbook import — it produced the data now in the live `2026-27` session, so
its normalisation rules (class names, transport routes, payment modes, date
parsing) are the answer to "why is this row shaped like this?":

```bash
git log --oneline --all -- scripts/_archive/2026-05-import/
git show <commit>:scripts/_archive/2026-05-import/vpps-import-latest-2026-05-15.mjs
```

`tests/unit/vpps-import-latest.test.ts` pinned those rules and was removed with
the script it tested; the same `git show` recovers it.
