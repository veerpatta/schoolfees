# Bulk Operations by an AI Coding Agent

This is the sanctioned path for Claude Code — or any other coding agent — to bulk-update data
and apply schema changes in this repo. It exists because the work is real: the office
periodically needs hundreds of rows changed at once, and the alternative to a documented
procedure is an undocumented one.

The rails below are not bureaucracy. Each one is here because something already went wrong,
or because Postgres will refuse the operation anyway and it is cheaper to know that first.

## The ladder

Always take the highest rung that can do the job.

| Rung | Use when | Path |
|---|---|---|
| 1. Read-only inspection | Understanding the data before changing it | Supabase MCP `execute_sql` with a `select`, or `begin; … rollback;` |
| 2. An existing UI | The app already has a screen for this | `/protected/students/bulk-update`, `/protected/payments/bulk`, `/protected/imports` |
| 3. A script | No UI covers it, and it is data, not schema | `scripts/bulk-apply.mjs` (see below) |
| 4. A migration | The **shape** of the data must change | `npx supabase db push --linked --yes` |

Rung 2 is not a formality. Those three surfaces already carry the guards a script would have
to reinvent: RBAC, session scoping, server-side diff recomputation, chunking, idempotency
keys, dues rework and cache invalidation. `app/protected/students/bulk-update/actions.ts`
recomputes the diff from the uploaded file on apply — the client never sends a change list —
so what gets written is always what the server itself derived from current stored values.
A hand-rolled script starts with none of that.

## Read-only inspection

The Supabase MCP is fine for reads and is the fastest way to understand a data question.
It honours `begin; … rollback;`, which makes it a good way to dry-run a migration before
pushing it.

Two things it cannot do:

- **Call any RPC guarded by `public.has_permission(...)`.** That function's first condition is
  `auth.uid() is not null`, and there is no `auth.uid()` outside a staff request. Every call
  raises *"You do not have permission…"*. This is not a bug to route around — it is the
  reason the dashboard RPCs are unreachable from a script, and why bulk work goes through the
  app layer instead.
- **Apply a migration cleanly.** See below.

## Migrations

Use the CLI. It authenticates from `supabase/.temp/project-ref`, honours the filename's
timestamp, and runs the migration in a transaction:

```bash
npx supabase db push --linked --yes
```

```bash
npx supabase migration list --linked
```

Wrap anything risky in explicit `begin; … commit;` so a failure rolls the whole thing back.

**`supabase/.temp/` is gitignored CLI scratch state.** A fresh clone, a new machine or a CI
runner will not have it, and `--linked` then fails. Re-link before the first push:

```bash
npx supabase link --project-ref vgqyilgstjvgohrsiwkb
```

Three traps:

- **`mcp__supabase__apply_migration` stamps `schema_migrations.version` from the wall clock,
  not the filename.** The Supabase Preview check then fails with *"Remote migration versions
  not found in local migrations directory."* If you must use it (urgent hotfix, no CLI to
  hand), immediately call `list_migrations` and `git mv` the local file so its leading
  timestamp matches what Postgres recorded. Contents stay byte-identical.
- **`npx supabase db dump` needs Docker, and without it truncates its target file to zero
  bytes.** It destroyed `supabase/schema.sql` once. Do not point it at a tracked file on a
  machine without Docker.
- **Migrations are append-only.** Editing the SQL body of an applied migration desyncs
  production and breaks the next push. To fix a bad migration, write a new one.

After adding a migration, update the index in `supabase/migrations/README.md`.

## The scripted path

`scripts/bulk-apply.mjs` is the harness. It generalises `scripts/repair-discount-drift.mjs`,
which is the pattern that already works, and every property below is load-bearing:

```bash
node scripts/bulk-apply.mjs --plan plans/fix-transport-routes.json --session TEST-2026-27
```

```bash
node scripts/bulk-apply.mjs --plan plans/fix-transport-routes.json --session TEST-2026-27 --apply
```

- **Dry run is the default, at every layer.** `--apply` is opt-in on the script; where a route
  is involved, `dryRun` defaults to true there too, independently. Two defaults, not one.
- **The diff is printed before anything is written**, one row per change, old value beside
  new. If you cannot read the diff, do not pass `--apply`.
- **`--session 2026-27` is refused unless `--live` is also passed.** Until now that boundary
  was prose in five different files and nothing in the code. It is now a check.
- **Every headless change writes an audit row.** `recordActivity()` in
  `lib/activity/events.ts` returns early when `userId` is falsy, so an agent's writes are
  invisible in the Activity feed unless something else records them. The harness writes to
  `audit_logs` with a system actor so the change is attributable afterwards.
- **The fee engine is called with `useAdmin: true`.** A headless caller has no session, so the
  cookie-based Supabase client returns *nothing* under RLS. Miss the flag and the generator
  silently skips every student with `CLASS_FEE_MISSING`, or resolves every RTE / Staff Child /
  3rd Child student to no discount at all. It fails quiet, not loud.
- **Money movement busts the cache tag.** Anything that changes a financial figure must call
  `revalidateSessionFinance` and drain the matview refresh, or the dashboard serves stale
  numbers until the next posting happens to clear it. Refunds shipped without this once.
- **Work is chunked.** A 531-row commit died at the platform's 300-second ceiling with no
  resume. Routes cap at `maxDuration = 60`; the harness batches accordingly.
- **Re-measure after applying.** The script re-runs its own detection query and reports what
  is left. A repair that cannot verify itself is not a repair.

### Splitting a change set by direction of harm

Where a change can go two ways, report the two halves separately and let the operator gate
the harmful one. `repair-discount-drift.mjs` is the reference: dues going **down** is a
discount that never landed and is safe to apply in bulk; dues going **up** raises what a
family owes and is never a silent operation, so `--only-decreases` exists to withhold it.

Copy that instinct. "How many rows change" is the wrong headline. "How many families end up
owing more" is the right one.

## What is never scriptable

**Posted `payments` and `receipts` rows cannot be updated or deleted — by anyone.**
`private.prevent_append_only_mutation()` is bound as a `before update or delete` trigger on
`public.payments`, `public.receipts` and `public.payment_adjustments`. A service-role
connection raises the same exception as a staff session. There is no flag for this and none
should be added.

Corrections move money through `payment_adjustments` instead, or through
`post_student_payment_with_adjustments` for a new posting. A reversed receipt stays visible
and marked, excluded from every collection figure, never deleted.

Also out of bounds for a script:

- `installments.amount_due` is a generated column and cannot be assigned.
- The late-fee rule is duplicated verbatim in `v_workbook_installment_balances` and
  `private.workbook_installment_snapshot`. **Edit them together.** A migration that patched
  only the function hid EMI late fees from the dashboard, defaulters and every export for
  four days while the Payment Desk still showed them.
- Name-only matching for bulk updates. Match on `admission_no`, or on an id.
- Class lookups that are not session-scoped. An unscoped one repointed 372 real students into
  `TEST-2026-27`.

## Before you run anything

1. `node scripts/audit-test-data-in-public.mjs` — confirm the starting state is clean.
2. Run the plan against `TEST-2026-27` first, even when the target is live. The test session
   has the same 19 classes and the same fee policy shape.
3. Dry run. Read the diff.
4. Apply.
5. Re-run the detection query, and `node scripts/verify-late-fee-health.mjs --session <label>`
   if anything touched fees.
6. `node scripts/audit-test-data-in-public.mjs` again — confirm nothing leaked.

## Related

- `scripts/repair-discount-drift.mjs` — the worked example this harness generalises.
- `docs/workflows/test-data-setup.md` — the `TEST-2026-27` discipline.
- `docs/maps/danger-zones.md` — what not to touch casually.
- `supabase/README.md` — the hard rules for the database itself.
- `AGENTS.md` / `CLAUDE.md` — the Hard Safety Rules these procedures implement.
