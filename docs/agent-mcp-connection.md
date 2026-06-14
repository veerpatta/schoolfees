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
- class-wise due summary
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

## Connect To ChatGPT Developer Mode

Use the always-on Worker endpoint for ChatGPT. The plain `/mcp` endpoint accepts
bearer-token clients, but ChatGPT custom MCP connectors do not reliably forward
custom Authorization headers. For ChatGPT, use the token-in-path endpoint and
set auth to `No Auth`:

```text
https://schoolfees-live-mcp.raj-39e.workers.dev/mcp/YOUR_PRIVATE_TOKEN
```

In ChatGPT:

1. Open Settings.
2. Go to Apps & Connectors -> Advanced settings and enable Developer Mode.
3. Create a custom MCP connector from a remote MCP server.
4. Paste the token-in-path MCP URL above.
5. Set authentication to `No Auth`.
6. Save, then refresh/import tools.

OpenAI's Apps SDK docs describe connecting remote MCP servers in ChatGPT
Developer Mode:
<https://developers.openai.com/apps-sdk/deploy/connect-chatgpt>.

## Agent Instructions

Add this to your agent instructions:

```text
You are the VPPS fee collection assistant. Use the Schoolfees MCP tools for all
student due amounts, defaulter lists, recent payments, class summaries, and
follow-up drafts. Do not guess fee amounts from memory. Always fetch live data
before answering fee collection questions. For recovery work, prefer
daily_recovery_digest for the morning run, and use get_recovery_queue,
get_promise_due_list, get_parent_followup_context, draft_recovery_plan, and
prepare_followup_messages for follow-up questions. Notion is read-only
reference only; do not treat Notion as the source for promises or next actions.
Draft messages only; do not claim that any message was sent or any payment was
posted.
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
get_class_due_summary
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

## Optional Bearer Token

For a private deployment or tunnel, set:

```text
SCHOOLFEES_MCP_TOKEN=change-this-long-random-value
```

The client must then send:

```text
Authorization: Bearer change-this-long-random-value
```

Leave this blank only for local testing or when your MCP client cannot send a
custom Authorization header.

## Always-On Cloudflare Worker

The permanent remote MCP server lives in `workers/schoolfees-mcp`.

Deploy it from this repo:

```powershell
npm run mcp:schoolfees:worker:deploy
```

Required Cloudflare Worker secrets:

```text
NEXT_PUBLIC_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SCHOOLFEES_MCP_TOKEN
```

The Worker exposes:

```text
https://YOUR-WORKER.workers.dev/health
https://YOUR-WORKER.workers.dev/mcp
https://YOUR-WORKER.workers.dev/mcp/YOUR_PRIVATE_TOKEN
```

For Codex and normal MCP clients, use the `/mcp` URL and configure the client
to send `SCHOOLFEES_MCP_TOKEN` as a bearer token.

For ChatGPT Custom MCP, use the private `/mcp/YOUR_PRIVATE_TOKEN` URL with
`No Auth`. Do not publish or share that full URL.

If a tool call returns `Unauthorized`, the connector is probably using the plain
`/mcp` URL or an auth setting. Switch to the token-in-path URL and `No Auth`,
then refresh tools.
