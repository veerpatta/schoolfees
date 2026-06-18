# ChatGPT Daily Defaulter Task

This is the non-developer setup pack for the VPPS daily recovery follow-up.

The Schoolfees MCP is read-only. It can fetch live fee context and draft
messages, but it cannot send WhatsApp messages, post payments, edit students,
or change fee setup. Notion is only a read-only mirror.

## 1. Connect The Schoolfees MCP In ChatGPT

Use the always-on Worker MCP URL:

```text
https://schoolfees-live-mcp.raj-39e.workers.dev/mcp/YOUR_PRIVATE_TOKEN
```

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
get_ai_analysis_context
get_recent_payments
prepare_followup_messages
get_recovery_queue
get_promise_due_list
get_parent_followup_context
draft_recovery_plan
daily_recovery_digest
```

If tool calls return `Unauthorized`, the connector is on the plain `/mcp` URL or
has an auth setting. Switch to the token-in-path URL and `No Auth`, then refresh
tools.

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

- `Unauthorized`: use the token-in-path URL and `No Auth`; do not use the plain
  `/mcp` URL in ChatGPT.
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
