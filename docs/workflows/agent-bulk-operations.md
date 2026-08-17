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

## Correcting wrongly-entered payment data

`scripts/bulk-apply.mjs` has a second execution mode for the one thing its
column-update engine can never do: fix a payment that was entered wrong. Set the plan's
`operation` to `payment-correction` and give every row an `op`.

There is **no UI for this and none should be added** — the Payment Desk stays the only
posting surface a human can use.

| `op` | Fixes |
|---|---|
| `student-total` | A student's year-to-date collected is wrong. Give a target; the harness works out which receipts move |
| `reverse` | Receipt should not exist at all — a duplicate, or money never received. Reverses with **no replacement** |
| `amount` | Receipt entered for the wrong rupee figure |
| `student` | Receipt posted against the wrong child |
| `date-mode` | Right money, wrong payment date or payment mode |
| `allocation` | Right money on the right child, applied to the wrong installment |
| `metadata` | `reference_number` / `notes` / `received_by` only — no money moves |

```jsonc
{
  "operation": "payment-correction",
  "reason": "Import batch 2026-08-14 posted tuition against the sibling",
  "rows": [
    { "op": "reverse",  "receiptNumber": "SVP20260814-0029", "fromAmount": 2000 },
    { "op": "amount",   "receiptNumber": "SVP20260814-0033", "fromAmount": 5000, "toAmount": 3500 },
    { "op": "student",  "receiptNumber": "SVP20260814-0031",
      "fromAdmissionNo": "VPPS/2026/0411", "toAdmissionNo": "VPPS/2026/0412",
      "allocations": [{ "installmentId": "…", "amount": 4000 }] },
    { "op": "metadata", "receiptNumber": "SVP20260814-0036", "referenceNumber": "UPI-889231" }
  ]
}
```

```bash
node scripts/bulk-apply.mjs --plan corrections.json --session TEST-2026-27
node scripts/bulk-apply.mjs --plan corrections.json --session TEST-2026-27 --apply --allow-fee-impact
```

**Everything except `reverse` and `metadata` is reverse + repost.** `reverse_receipt_admin` writes
compensating `payment_adjustments`, then `post_corrected_payment` writes a fresh receipt with
the corrected data. Nothing is edited and nothing is deleted, which is exactly why every
dashboard, export, defaulter list and day-close figure recomputes itself: `pending_amount` is
derived from payments + adjustments, never stored.

Five things worth knowing before running one:

- **`--allow-fee-impact` is always required.** Every correction reverses a posted receipt.
- **`from*` fields are re-checked at apply time.** A row that has moved since the dry run is
  rejected, and one rejected row aborts the whole plan before anything is written. That is
  what makes a reviewed dry run mean something.
- **The reversal is visible to the family immediately.** The old receipt is stamped VOID and
  `/r/<receipt-number>` — the QR on their printed copy — shows it as reversed.
- **`amount` can only shrink a receipt.** Taking more money is a payment, not a correction,
  and belongs at the desk with the parent present.
- **`student-total` is the shape an office register actually has.** A register says
  "this child has paid ₹8,600, not ₹0"; it never says which receipt is wrong. Short of the
  target posts one new receipt across the installments with room, earliest due first, and
  never touches a late fee. Over the target reverses receipts — preferring a single one that
  matches the excess exactly, so a parent's other receipts stay valid — and reposts any
  overshoot into the very room those reversals freed.
- **A failed repost is reported as `REVERSED BUT NOT REPOSTED`.** The reversal is append-only
  and cannot be taken back, so that receipt is reversed with nothing in its place until
  somebody posts the replacement. It is not a tidy failure and the run does not pretend it is.

Refreshing afterwards is two separate jobs, and only one of them needs the app:

- **Matviews** are drained by the script itself, through the service role it already holds.
  No secret, always happens.
- **Next's cached pages** need `revalidateTag`, which only exists inside the deployed
  process, so the run POSTs to `/api/admin/revalidate-after-bulk` (guarded by `CRON_SECRET`).

Without `CRON_SECRET` the run says so plainly. It is a delay, not a wrong number: the
database and the matviews are already correct, and Next's own entries expire within five
minutes (`DASHBOARD_STALENESS_CEILING_SECONDS`).

Note `CRON_SECRET` is stored in Vercel as a **Sensitive** variable, which means Vercel will
not display it again to anyone — including the account owner. To use it locally you have to
rotate it to a value you choose and redeploy, so the deployed app and your `.env.local`
agree.

## What is never scriptable

**Posted `payments` and `receipts` rows cannot be updated or deleted — by anyone.**
`private.prevent_append_only_mutation()` is bound as a `before update or delete` trigger on
`public.payments` and `public.payment_adjustments`. A service-role connection raises the same
exception as a staff session. There is no flag for this and none should be added.

Corrections move money through `payment_adjustments` instead, or through
`post_student_payment_with_adjustments` / `post_corrected_payment` for a new posting. A
reversed receipt stays visible and marked, excluded from every collection figure, never
deleted.

**One narrowing, since `20260817113000`.** `receipts` now has its own guard,
`private.protect_receipt_money_columns()`, instead of the shared one. DELETE is still refused
outright, and every money column — `receipt_number`, `student_id`, `payment_date`,
`payment_mode`, `total_amount`, `created_by`, `created_at`, `client_request_id`,
`family_payment_id` — raises exactly as before. Three purely descriptive columns may now be
updated in place: `reference_number`, `notes`, `received_by`. Correcting a typo'd UPI
reference should not require voiding a parent's receipt and issuing a new number.
`payments`, `payment_adjustments` and `audit_logs` keep the shared unconditional guard, so
this narrowed one table and nothing else.

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
