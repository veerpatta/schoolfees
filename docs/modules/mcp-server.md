# MCP Server

The Schoolfees MCP server gives an AI assistant — Claude, ChatGPT, or anything
that speaks MCP — live, read-only access to the school's fee data. It runs as a
Cloudflare Worker at `schoolfees-live-mcp.raj-39e.workers.dev`.

Connection instructions for staff are in
[`docs/agent-mcp-connection.md`](../agent-mcp-connection.md). This document is
about how the server works and how to change it.

## Why it was rebuilt (v1.0.0, 2026-08-14)

The previous server reported wrong student data in three compounding ways.

**It published a fee tier under a name that promised enrollment status.** Every
per-student payload carried `studentStatus`, mapped from `student_status_label`.
That column is `New` / `Old` — the academic-fee tier — not `active` / `left`. The
column that answers "has this child left?", `record_status`, was fetched and then
dropped. Live, admission 2682 came back as `"studentStatus": "New"`.

**It had one boolean where the school has two rules.** `getFinancialRows` took
`onlyActive`, defaulting to `record_status = 'active'`. Money tools therefore
under-reported: three students who had paid part of the year and then left were
carrying ₹16,250 the ledger still held and the queue could not see. Two other
tools passed `false` and counted leavers whose dues had been cancelled. Neither
matched the office app.

**Blocks in one payload disagreed and said nothing.** `get_ai_analysis_context`
carried a `summary` built one way and a `dashboardAnalytics` block built another:
₹1,06,12,816 against ₹99,99,641 in the same response, Class 6 at ₹9,90,892
against ₹9,21,392, SKG at 36 students against 32. Whichever block a model read
first became its answer.

Alongside that, the server was two hand-copied ~2,100-line files kept in step by
a test that grepped for tool names — so a divergence in the status filter passed.

## Architecture

```
workers/schoolfees-mcp/
  wrangler.toml        Worker config, KV binding, allowed staff roles
  oauth-entry.mjs      Cloudflare entry: OAuth provider, sign-in page, routing
  worker.mjs           Auth lanes; builds a server for the caller
  src/
    server.mjs         Assembles tools, resources and prompts per identity
    scope.mjs          Which students count — the load-bearing module
    supabase.mjs       REST + RPC, paging, degradation log
    permissions.mjs    Role → permission matrix, mirrored from lib/auth/roles.ts
    freshness.mjs      Materialized-view staleness
    format.mjs         Money, pagination, projection
    toolkit.mjs        Shared input schemas, the permission gate, result envelope
    reads.mjs          Shared reads every tool family uses
    shape/             Row mappers: student, installment, receipt, plan, contact
    tools/             One module per family
    resources.mjs      MCP resources
    prompts.mjs        MCP prompts
```

There is one implementation. The local Node twin that used to live at
`scripts/schoolfees-mcp-server.mjs` was retired with this rebuild.

The Worker cannot import from `lib/**` — that code is `server-only` TypeScript
inside the Next app, and this bundle ships to Cloudflare on its own. So it reads
the same database views and RPCs the app reads, and anything duplicated (the role
matrix, the segment list) is pinned by a test against its original.

## `src/scope.mjs` — the load-bearing part

The school has two rules for who counts, and they are deliberately different.
From `20260808210000_left_students_with_payments_stay_collectable.sql`:

> a student marked left who never paid has their dues cancelled … But if any
> amount WAS collected and they then left, the rest of their dues must still be
> collected.

and, in the same migration:

> A student who has left is not on the roll, however much they owe. Headcount and
> money are different questions.

| Scope | Rule | Used for |
|---|---|---|
| `on_roll` | `record_status = 'active'` | Headcount, class lists, roster |
| `collectable` | `record_status = 'active' OR total_paid > 0` | **Every money figure** |
| `left_owing` | `record_status <> 'active' AND outstanding_amount > 0` | Recovery from leavers |
| `everyone` | no filter | Audit and data quality only |

**There is no default.** `resolveScope` throws on an unnamed scope, and
`getFinancialRows` calls it before doing anything else. A tool that forgets fails
loudly instead of quietly inheriting active-only — which is exactly how the
original bug survived.

Every scoped payload carries a `scope` block naming the rule, and where one
payload holds blocks built under different scopes it carries a `reconciliation`
block explaining the difference. Two answers that differ then explain themselves
instead of looking like a bug.

## Three columns called "status"

| Output field | Column | Values |
|---|---|---|
| `enrollment.status` | `record_status` | `active` / `inactive` / `left` / `graduated` |
| `feeTier` | `student_status_label` | `New` / `Old` — academic-fee tier only |
| `paymentStatus` | `status_label` | `PAID` / `OVERDUE` / `PARTLY PAID` / … |

`studentStatus` was removed rather than aliased. A wrong name that still resolves
keeps producing wrong answers; a missing one produces a question.

## Tools

28 tools in six families. Every one is read-only, declares the permission it
needs, and takes `limit` + `cursor`; list tools also take a `fields` projection.

**Orientation** — `describe_capabilities`, `list_sessions`, `get_system_health`

**Students** — `search_students`, `get_student`, `query_students`,
`get_student_financial_history`, `get_family`

`query_students` is the general-purpose query: all 27 filter chips from
`lib/segments/student-segments.ts` over `v_student_directory`, plus amount ranges,
grouping and totals. It exists so an unanticipated question does not need a new
tool and a redeploy.

**Money** — `get_session_money_summary`, `get_dashboard_analytics`,
`get_class_due_summary`, `get_installments`, `get_fee_structure`,
`get_ai_analysis_context`

**Transactions** — `get_recent_payments`, `search_receipts`, `get_receipt`,
`get_collection_report`

**Recovery** — `today_fee_collection_brief`, `list_defaulters_for_followup`,
`get_student_due_status`, `get_recovery_queue`, `get_promise_due_list`,
`get_parent_followup_context`, `draft_recovery_plan`,
`prepare_followup_messages`, `daily_recovery_digest`

**Left students** — `get_left_student_recovery`, `get_prev_year_dues`

All 14 original tool names are preserved, because the school's morning ChatGPT
task calls them by name.

### Resources and prompts

Definitions are resources, not tool calls: `schoolfees://glossary/money`,
`schoolfees://rules/student-scope`, `schoolfees://rules/school`,
`schoolfees://rules/answering`, `schoolfees://data-model`. A client pins them once
and reads every number correctly afterwards.

Six prompts cover the recurring workflows — `morning_recovery_run`,
`student_360`, `class_review`, `reconcile_money`, `explain_this_number`,
`left_students_still_owing`.

## Access control

Each tool declares `requires: [...]` and is registered only if the caller holds
one of those permissions. A tool a caller cannot use is not in their
`tools/list`, so an assistant never proposes a call that will be refused.

- **Staff lane** (`/mcp`, OAuth): the signed-in person's role from
  `app_metadata.staff_role` decides their tool list. `SCHOOLFEES_MCP_ALLOWED_ROLES`
  in `wrangler.toml` decides who may sign in at all.
- **Automation lane** (`/svc/mcp`, shared token): full read reach, stamped
  `identity: { kind: "service" }`.

Both lanes read Supabase with the service-role key, so the gate is the tool list,
not RLS. `src/permissions.mjs` mirrors `lib/auth/roles.ts` and
`tests/unit/mcp-permissions.test.ts` fails if the copy drifts.

## Data freshness

`v_workbook_student_financials` and `v_workbook_installment_balances` are
materialized views, rebuilt off the payment path by the payment action and a
two-minute cron. A read taken right after a posting can predate it. Every money
payload therefore carries:

```json
"provenance": {
  "dataFreshness": { "lastRefreshedAt": "...", "refreshPending": false, "staleSeconds": 43 }
}
```

read from `workbook_materialized_view_refresh_queue`. The old server stamped
`asOfDate: today` regardless, which made a stale figure indistinguishable from a
current one.

## Adding a tool

1. Pick the family module under `src/tools/`.
2. Call `defineTool(server, ctx, { … })` with `name`, `title`, a `description`
   written for the model deciding whether to call it, `inputSchema`, the
   `requires` permissions, and `money: true` if it returns any figure.
3. Name a scope explicitly on every read. There is no default and no way to
   inherit one.
4. Keep fees and late fees in separate fields, always.
5. Add the tool to the catalogue in `docs/agent-mcp-connection.md`.

## Testing

```bash
npx vitest run tests/unit/mcp-scope.test.ts \
                tests/unit/mcp-permissions.test.ts \
                tests/unit/schoolfees-worker-digest.test.ts
```

- `mcp-scope` — each rule's predicate, and the refusal to guess when no scope is
  named.
- `mcp-permissions` — the mirrored role matrix equals `lib/auth/roles.ts`.
- `schoolfees-worker-digest` — drives the real transport against a mocked
  Supabase. Its fixture deliberately mixes an active payer, a student who left
  after paying, and a student who left having paid nothing. The old fixture had a
  single active row, which is why nothing caught the wrong population for months.

Against the live deployment:

```bash
npm run verify:mcp-health -- --session 2026-27
```

This does not test the server against itself. It asks the MCP for a figure,
computes the same figure straight from Postgres, and fails on any difference —
including the named regression guard that `enrollment.status` comes from the
enrollment column and `studentStatus` has not come back.

## Deploying

```bash
npm run mcp:schoolfees:worker:deploy
```

Required Worker secrets: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`SUPABASE_PUBLISHABLE_KEY` (staff sign-in only), `SCHOOLFEES_MCP_TOKEN`.

`NEXT_PUBLIC_SITE_URL` is a **var in `wrangler.toml`**, not an optional secret.
It was unset for months, and the only symptom was `verifyUrl` returning `null` on
every receipt this server handed back — nothing anywhere said why. `/health` now
reports it under `config`.

### Documents and assets

`get_receipt_pdf` needs `SCHOOLFEES_DOC_TOKEN`, matching the value set in Vercel:

```bash
wrangler secret put SCHOOLFEES_DOC_TOKEN --config workers/schoolfees-mcp/wrangler.toml
```

The Worker cannot render a PDF — `@react-pdf` is Node-only and reads fonts off
disk — so it calls `POST /api/service/documents` on the web app, which renders
and returns the bytes. Deploy order is therefore fixed: **the app first, the
Worker second**, since the endpoint must exist before anything calls it. A
`protocol` field makes a stale Worker fail with a clear message rather than a
novel one.

Not `CRON_SECRET`: two existing routes accept that in a query string, so it lands
in logs, and it also unlocks a write endpoint.

`/health` reports `config.documentBridge`, so a missing secret is visible without
calling a tool. The document tools stay registered when it is missing and fail
loudly at call time — a tool that disappears because a secret was forgotten looks
exactly like one that was never built.

Photographs and voice notes come straight from Supabase Storage with the
service-role key, which bypasses storage RLS. **No tool accepts a bucket or a
path.** A caller names a student; the path is read from the database. A generic
`read_storage_object(bucket, path)` would be an arbitrary-file-read primitive.
