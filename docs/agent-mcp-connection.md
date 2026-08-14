# Schoolfees MCP Agent Connection

This MCP server gives a ChatGPT agent live, read-only fee collection context
from the schoolfees backend.

It is designed for the internal VPPS office workflow:

- current fee collection brief
- defaulter follow-up list
- daily recovery queue
- promise-due and broken-promise follow-up
- parent recovery context for a specific student
- daily recovery plan draft
- daily recovery digest for the morning follow-up task
- student due lookup
- exact student receipt, allocation, adjustment, refund, and repayment-plan history
- class-wise due summary
- the five live dashboard boards (collection trend, debt age, recovery, classes,
  routes, and the separate late-fee ledger)
- whole-app AI analysis context matching the Excel export bundle
- recent receipts
- draft follow-up messages

It does not post payments, edit students, change fee setup, send WhatsApp
messages, or rewrite financial history.

Notion is only a read-only mirror for synced fee summaries. Do not use Notion as
the source for promises, callback dates, contact status, next action, or payment
decisions. The source of truth for recovery work is the Schoolfees app plus the
read-only MCP tools.

## Local Run

Use `TEST-2026-27` while testing:

```powershell
npm run mcp:schoolfees
```

Health check:

```powershell
Invoke-RestMethod http://127.0.0.1:4317/health
```

MCP endpoint:

```text
http://127.0.0.1:4317/mcp
```

## Two Connection Lanes

The Worker has two separate doors. Pick by who is on the other side.

| Lane | Path | Who it is for | How it authenticates |
| --- | --- | --- | --- |
| Staff | `/mcp` | A person using Claude or ChatGPT | OAuth. Each staff member signs in with their own Schoolfees email and password. |
| Automation | `/svc/mcp` | The morning defaulter task, Codex | Shared service token. No browser sign-in, so an unattended 8 AM run cannot stall on a login screen. |

`/health` is public and returns no student or fee data.

Why two: OAuth gives per-person access that can be revoked by deactivating a
staff account, which a single shared token can never do. But OAuth assumes a
human is present to click through a sign-in, which is wrong for a scheduled
task. So humans use OAuth and machines use a service token.

### Staff Lane (OAuth)

Add the plain base URL as a custom connector. No token in the URL:

```text
https://schoolfees-live-mcp.raj-39e.workers.dev/mcp
```

The client discovers the OAuth endpoints, registers itself, and sends the user
to a Schoolfees sign-in page. Sign in with the same email and password used for
the office app.

Access rules enforced at sign-in:

- the staff account must be active (`app_metadata.is_active` is not `false`)
- the role must be listed in the `SCHOOLFEES_MCP_ALLOWED_ROLES` Worker variable
  (currently `admin,accountant`)

The signed-in person's id, email, name, and role travel with every tool call,
so MCP access is attributable to a person instead of an anonymous token.

In Claude: Settings -> Connectors -> Add custom connector -> paste the URL ->
Connect -> sign in.

In ChatGPT: Settings -> Apps & Connectors -> Advanced settings -> Developer
Mode -> add a remote MCP server -> paste the URL -> set authentication to
OAuth.

OpenAI's Apps SDK docs describe connecting remote MCP servers in ChatGPT
Developer Mode:
<https://developers.openai.com/apps-sdk/deploy/connect-chatgpt>.

### Automation Lane (Service Token)

For the scheduled defaulter task and any other unattended client, use the
service path with the token either in the path or as a bearer header:

```text
https://schoolfees-live-mcp.raj-39e.workers.dev/svc/mcp/YOUR_PRIVATE_TOKEN
https://schoolfees-live-mcp.raj-39e.workers.dev/svc/mcp   (+ Authorization: Bearer ...)
```

Use the token-in-path form with `No Auth` for ChatGPT, which does not reliably
forward custom Authorization headers. Do not publish or share that full URL.

## Agent Instructions

Add this to your agent instructions:

```text
You are the VPPS fee collection assistant. Use the Schoolfees MCP tools for all
student due amounts, defaulter lists, recent payments, class summaries, and
follow-up drafts. Do not guess fee amounts from memory. Always fetch live data
before answering fee collection questions. Use get_dashboard_analytics for the
same five-board rollups as the live Dashboard. Use get_ai_analysis_context when
asked for full-app analysis, operational summaries, or the AI Excel export
context. Use get_student_financial_history for exact receipt amounts, allocation
history, corrections, refunds, or repayment-plan standing. For recovery work,
prefer daily_recovery_digest for the morning run,
and use get_recovery_queue, get_promise_due_list, get_parent_followup_context,
draft_recovery_plan, and prepare_followup_messages for follow-up questions.
Notion is read-only reference only; do not treat Notion as the source for
promises or next actions. Draft messages only; do not claim that any message was
sent or any payment was posted.
```

## Live Session Switch

The live Worker default is:

```text
SCHOOLFEES_MCP_DEFAULT_SESSION=2026-27
```

For local testing, use:

```text
SCHOOLFEES_MCP_DEFAULT_SESSION=TEST-2026-27
```

All tools still accept an explicit `sessionLabel`, including `2026-27`,
`TEST-2026-27`, `UAT-2026-27`, and `DEMO-2026-27`.

## Tool Surface

```text
today_fee_collection_brief
list_defaulters_for_followup
get_student_due_status
get_student_financial_history
get_class_due_summary
get_dashboard_analytics
get_ai_analysis_context
get_recent_payments
prepare_followup_messages
get_recovery_queue
get_promise_due_list
get_parent_followup_context
draft_recovery_plan
daily_recovery_digest
```

Every tool is read-only. The draft-message tools include UPI intent link text
for office convenience, but they do not send WhatsApp messages and do not post
payments. Payment posting remains only in the Schoolfees Payment Desk after
office verification.

The MCP mirrors the webapp's money buckets: `never_paid`, `partly_paid`, and
`year_clear` are derived from prepared charges, cash paid, discount close-outs,
and current outstanding money rather than the timing-oriented status label.
Fees pending and late fee pending are separate in every student, installment,
class, summary, and dashboard payload. A late-fee-only family is never placed in
the defaulter queue. Students charged a custom transport amount are labelled as
custom transport even when no route is assigned.

Recovery tools are repayment-plan aware. They use the active EMI calendar and
the dues outside that plan; an on-track family is not chased for the full
underlying balance. Draft UPI links for an EMI family carry only the amount due
or needed to catch up. Financial history includes active, superseded, and
cancelled plan records so rescheduling never erases the earlier agreement.

## Service Token

The automation lane is guarded by a single Worker secret:

```text
SCHOOLFEES_MCP_TOKEN=a-long-random-value
```

Rotate it with:

```powershell
npx wrangler secret put SCHOOLFEES_MCP_TOKEN --config workers/schoolfees-mcp/wrangler.toml
```

Rotating it breaks every automation client using the old value, so update them
in the same sitting:

- the ChatGPT connector URL for the daily defaulter task
- the `SCHOOLFEES_WORKER_MCP_TOKEN` environment variable used by `.mcp.json`

It does not affect the OAuth staff lane, which does not use this token at all.

Two deliberate behaviours:

- **Fails closed.** If `SCHOOLFEES_MCP_TOKEN` is missing, the service lane
  refuses everything. An unset token must never mean "let everyone in", because
  the Worker reads Supabase with the service role key and bypasses RLS.
- **No unauthenticated method exemptions.** `initialize`, `ping`, and
  `tools/list` all require the token. An earlier version exempted them, which
  meant a misconfigured connector looked healthy, listed every tool, and only
  failed when someone asked for real data. It now fails at connect time.

## Always-On Cloudflare Worker

The permanent remote MCP server lives in `workers/schoolfees-mcp`.

Deploy it from this repo:

```powershell
npm run mcp:schoolfees:worker:deploy
```

Entry point: `workers/schoolfees-mcp/oauth-entry.mjs`. It wraps the MCP handler
in `@cloudflare/workers-oauth-provider`, serves the staff sign-in page, and
routes the service lane. The tools themselves stay in `worker.mjs`.

Required Cloudflare Worker secrets:

```text
NEXT_PUBLIC_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_PUBLISHABLE_KEY
SCHOOLFEES_MCP_TOKEN
```

`SUPABASE_PUBLISHABLE_KEY` is used only to verify staff sign-ins against
Supabase Auth on the OAuth lane.

Required bindings in `wrangler.toml`:

```text
OAUTH_KV                       KV namespace for OAuth clients, grants, tokens
SCHOOLFEES_MCP_ALLOWED_ROLES   comma-separated staff roles allowed to sign in
```

The Worker exposes:

```text
https://YOUR-WORKER.workers.dev/health
https://YOUR-WORKER.workers.dev/mcp                        staff lane, OAuth
https://YOUR-WORKER.workers.dev/authorize                  staff sign-in page
https://YOUR-WORKER.workers.dev/token
https://YOUR-WORKER.workers.dev/register
https://YOUR-WORKER.workers.dev/.well-known/oauth-authorization-server
https://YOUR-WORKER.workers.dev/.well-known/oauth-protected-resource
https://YOUR-WORKER.workers.dev/svc/mcp                    automation, bearer
https://YOUR-WORKER.workers.dev/svc/mcp/YOUR_PRIVATE_TOKEN automation, no-auth
```

## Troubleshooting

`Unauthorized` or a re-authorization prompt on the staff lane: the OAuth grant
was revoked or the account no longer passes the active/role check. Reconnect the
connector and sign in again.

`Unauthorized` on the automation lane: the client is using the old `/mcp/TOKEN`
path (now the OAuth lane) or a stale token. Move it to `/svc/mcp/TOKEN` and
confirm the token matches the current Worker secret.

Sign-in page says the role is not allowed: add the role to
`SCHOOLFEES_MCP_ALLOWED_ROLES` in `wrangler.toml` and redeploy, or use an
admin/accountant account.

Tools not visible: refresh or re-import tools in the connector settings.
