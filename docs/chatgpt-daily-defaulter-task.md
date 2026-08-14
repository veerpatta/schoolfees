# ChatGPT Daily Defaulter Task

This is the non-developer setup pack for the VPPS daily recovery follow-up.

The Schoolfees MCP is read-only. It can fetch live fee context and draft
messages, but it cannot send WhatsApp messages, post payments, edit students,
or change fee setup. Notion is only a read-only mirror.

## 1. Connect The Schoolfees MCP In ChatGPT

The daily task runs at 8 AM with nobody watching, so it uses the automation
lane and its service token rather than the staff OAuth lane. An OAuth sign-in
needs a person at a browser, which a scheduled run cannot provide.

Use the service-lane URL (note the `/svc/` prefix):

```text
https://schoolfees-live-mcp.raj-39e.workers.dev/svc/mcp/YOUR_PRIVATE_TOKEN
```

If you would rather connect ChatGPT as yourself for interactive use, use
`https://schoolfees-live-mcp.raj-39e.workers.dev/mcp` with authentication set
to OAuth instead. Keep the scheduled task on the service lane either way.

Steps:

1. Open ChatGPT on the web.
2. Open Settings.
3. Go to Apps & Connectors -> Advanced settings.
4. Enable Developer Mode.
5. Create a custom MCP connector from a remote MCP server.
6. Paste the token-in-path URL.
7. Set authentication to `No Auth`.
8. Save the connector.
9. Refresh/import tools.

Expected tools include:

```text
today_fee_collection_brief
list_defaulters_for_followup
get_student_due_status
get_class_due_summary
get_dashboard_analytics
get_ai_analysis_context
get_student_financial_history
get_recent_payments
prepare_followup_messages
get_recovery_queue
get_promise_due_list
get_parent_followup_context
draft_recovery_plan
daily_recovery_digest
```

Since v1.0.0 the server also publishes student search, receipt lookup, collection
reporting, fee structure and a general-purpose student query. This task does not
need them, but they will appear in the list. The full catalogue is in
[`agent-mcp-connection.md`](agent-mcp-connection.md).

One change matters to this task's output: the recovery tools now include families
who paid part of the year and then left. They were previously invisible, and they
still owe. Expect the queue to be slightly longer than before, for that reason.

If tool calls return `Unauthorized`, the connector is on the OAuth lane
(`/mcp`) with `No Auth`, or is using a stale token. Switch to the
`/svc/mcp/YOUR_PRIVATE_TOKEN` URL with `No Auth`, confirm the token matches the
current Worker secret, then refresh tools.

## 2. Agent Instruction Block

Copy this into the agent or connector-use instructions:

```text
You are the VPPS fee collection assistant for Shri Veer Patta Senior Secondary
School. Always fetch live fee and recovery data through the Schoolfees MCP
before answering any fee, pending dues, payment, defaulter, promise, callback,
or parent follow-up question.

Default to session 2026-27 unless the user explicitly asks for TEST-2026-27,
UAT-2026-27, or DEMO-2026-27.

Prefer daily_recovery_digest for the morning recovery run. Use
get_dashboard_analytics when the user asks for the live Dashboard's collection,
recovery, class, route, debt-age, or late-fee boards. Use
get_ai_analysis_context when the user asks for full-app analysis, dashboard-like
summaries, or the AI Excel export context. For follow-up questions, use
get_recovery_queue, get_promise_due_list, get_parent_followup_context,
draft_recovery_plan, prepare_followup_messages, today_fee_collection_brief,
get_student_due_status, get_class_due_summary, and get_recent_payments as
needed.

Never guess amounts from memory. Never use Notion as the source of truth for
fee dues, promises, callback dates, contact state, or next actions. Notion is a
read-only mirror only.

The tools are read-only. Draft WhatsApp/SMS messages only. Never claim a message
was sent, never claim a payment was posted, and never write or change school fee
records. If a parent pays by UPI, say that the office must verify the
screenshot/UTR and post the receipt from Payment Desk.

Respect active EMI plans. Do not ask an on-track family for the full underlying
balance. Use only the recovery amount returned by the MCP, which follows the
EMI calendar plus any uncovered overdue dues.
```

## 3. Scheduled Task Prompt

Open a normal ChatGPT chat with the Schoolfees MCP connector enabled. Do not
create this as a custom GPT task, because OpenAI's Tasks help page says GPTs are
not supported for Tasks. Tasks are supported on ChatGPT Web, iOS, Android, and
macOS, and can run one-off or recurring prompts.

Copy this prompt:

```text
Every day at 8:00 AM Asia/Kolkata, call daily_recovery_digest for session
2026-27 in hinglish.

Give me today's top recovery list: who to call/message first with pending
amount, best available phone number, promise status, reason for priority, and a
ready WhatsApp draft with the UPI payment link for each.

Group the result by:
1. Broken promises
2. Promises due today
3. Repeated no-answer
4. High exposure

Use only live Schoolfees MCP data. Do not guess amounts. Draft messages only;
do not say that any WhatsApp message was sent or any payment was received.
```

OpenAI Tasks reference:
<https://help.openai.com/en/articles/10291617-tasks-in-chatgpt>

## 4. Troubleshooting

- `Unauthorized`: use the `/svc/mcp/YOUR_PRIVATE_TOKEN` URL with `No Auth` for
  the scheduled task. The plain `/mcp` URL is the OAuth staff lane and will
  reject a `No Auth` connector.
- Token was rotated: update this connector's URL in the same sitting, or the
  8 AM run fails silently until someone notices the calls stopped.
- Tool not visible: refresh/import tools in the connector settings.
- Wrong session: ask for `sessionLabel: 2026-27`.
- Missing task support: create the task from ChatGPT Web, iOS, Android, or
  macOS. The Windows app path may not support Tasks yet.

## 5. Server-Side Fallback

If ChatGPT Tasks is unavailable, use a low-risk server-side fallback later:

- Add a Cloudflare Worker scheduled trigger for 08:00 IST.
- Call the same internal `daily_recovery_digest` logic.
- Write only to a safe read-only sink, such as an append-only digest log or a
  read-only Notion mirror page.
- Do not send WhatsApp messages.
- Do not post payments or receipts.
- Reuse existing Worker secrets.

This fallback is intentionally not enabled by default because the primary
workflow is ChatGPT Tasks plus a read-only MCP call.
