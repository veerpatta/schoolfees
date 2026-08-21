# Danger Zones

These files and records must never be touched casually.

- `src/app/protected/payments/actions.ts` - only payment-posting surface.
- `src/modules/payments/*` - posting and preview logic for Payment Desk.
- `supabase/migrations/*` - append-only schema history; never rename or reorder.
- `src/modules/fees/data/regeneration.ts` - protects paid, partial, and adjusted rows.
- `src/modules/fees/data/policy.ts` - canonical fee policy resolver.
- `src/platform/supabase/admin.ts` - service-role client; never import in `components/` or in any file reachable from the browser bundle.
- `src/platform/config/fee-rules.ts` - authoritative when docs conflict.
- `academic_sessions` row `2026-27` - live production academic session.

Use `TEST-2026-27` for ongoing verification and debugging. Do not add test
students, test payments, or experimental fee changes to `2026-27`.

## Added since this list was written

- **`src/app/protected/payments/bulk/`** — the second posting surface. It is allowed only
  because every row goes through `post_student_payment_with_adjustments`, sequentially,
  keyed by the row's staged `client_request_id` so a re-run resolves to existing receipts
  instead of double-posting. Any change that bypasses that RPC breaks Hard Rule 5.
- **`reverse_receipt_admin` + `post_corrected_payment`** — the two RPCs behind correcting a
  wrong fee entry. Both are append-only and must stay that way: reversal writes compensating
  `payment_adjustments`, the repost writes a NEW receipt. The moment either one edits a posted
  row, Hard Rule 1 is gone. `post_corrected_payment` is `service_role`-only on purpose; adding
  a `has_permission` arm would turn it into a second posting surface for staff.
- **`receipts` no longer uses the shared append-only guard.** Since `20260817113000` it has
  `private.protect_receipt_money_columns()`, which names every money column and allows exactly
  three descriptive ones (`reference_number`, `notes`, `received_by`). Adding a column to
  `receipts` means deciding which side of that line it falls on — a new money column that is
  not named in the guard is silently editable.
- **`src/app/protected/payments/waive-late-fee-actions.ts`** — the desk calls `waive_late_fee`
  *before* posting, so the posting RPC's guards never see the waiver. That was a real
  bypass for EMI students once.
- **`src/modules/repayment-plans/`** — a plan is never edited in place, and reschedule/cancel must
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
- **`recordActivity()` silently no-ops without a `userId`.** `src/modules/activity/data/events.ts` returns
  early when there is no signed-in staff member, so anything a cron, a script or an agent
  writes is invisible in the Activity feed. `audit_logs` has no TypeScript writer at all.
  A headless write path has to lay its own trail — `scripts/bulk-apply.mjs` inserts into
  `audit_logs` with a `_bulk_apply` block carrying the run id, reason and actor.
- **Nothing in `lib/` or `app/` guards the live `2026-27` session.** There is no
  `isProductionSession` check anywhere; the boundary is prose in `AGENTS.md`, `CLAUDE.md`,
  `supabase/README.md` and this file, plus `scripts/audit-test-data-in-public.mjs`, which
  only detects leakage after the fact. `scripts/bulk-apply.mjs` is the one path that refuses
  the live session in code (`--live` required). Do not assume the others do.
- **The whole app is `force-dynamic` from the root layout.** `src/app/layout.tsx` sets it, so it
  propagates to every route, and `export const revalidate` anywhere below it is dead config.
  Changing it changes the caching behaviour of every page at once.
- **`create view` silently drops `security_invoker`, and a CASCADE rebuild is where that
  bites.** `20260718090711` hardened the five Notion projections; `20260807120000` dropped
  the financial view stack with CASCADE and recreated three of them with plain
  `create view ... as`, which carries no reloptions; `20260812120000` then restored "the
  grants the cascade took with it" from the pre-hardening list, handing `anon` and
  `authenticated` back `all`. Net effect until `20260819120000`: ten RLS-less relations were
  selectable by `anon`, so the publishable key alone — which ships in the browser bundle —
  read every student's financials and, through `v_notion_student_fee_summary`, their parents'
  names, phones and dates of birth. **RLS defends a table; it defends neither a matview (which
  cannot carry it) nor a view without `security_invoker`. For those the GRANT is the whole
  control.** Any migration that rebuilds one must re-apply the option and re-derive the grants
  from the current intent, not from an older file. `select … from pg_class where relkind in
  ('v','m') and has_table_privilege('anon', oid, 'select')` answers this in one query.
- **A scan that reads migration text cannot see an `ALTER` in a DO-loop.** All seven
  `scan.sql-risk` "unpinned search_path" findings are false positives: six were pinned by the
  `20260523164957` loop, which the text scanner cannot follow, and the seventh
  (`private.derive_family_child_client_request_id`) was dropped in `20260727113603`. Confirm
  against `pg_proc.proconfig` before acting on that rule.
