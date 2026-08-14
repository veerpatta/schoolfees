# Connecting an AI Assistant to Schoolfees

The Schoolfees MCP server gives an AI assistant live, **read-only** access to the
school's fee data. Connect it to Claude, ChatGPT, or anything else that speaks
MCP, and ask about students, fees, payments, defaulters and analytics in plain
language.

It cannot post a payment, edit a student, change fee setup, waive a late fee, or
send a message. Payments are posted only at the Payment Desk, by a person, after
office verification.

How the server works internally, and how to change it, is in
[`docs/modules/mcp-server.md`](modules/mcp-server.md).

## Connect

### As a staff member (recommended)

Add this URL as a custom connector. No token goes in the URL:

```text
https://schoolfees-live-mcp.raj-39e.workers.dev/mcp
```

Your client discovers the sign-in flow and sends you to a Schoolfees page. Sign in
with the same email and password you use for the office app.

- **Claude**: Settings → Connectors → Add custom connector → paste the URL →
  Connect → sign in.
- **ChatGPT**: Settings → Apps & Connectors → Advanced → Developer Mode → add a
  remote MCP server → paste the URL → authentication: OAuth.

Two things are checked at sign-in: the staff account must be active, and its role
must be listed in `SCHOOLFEES_MCP_ALLOWED_ROLES` (currently `admin`, `accountant`,
`fee_collector`).

**You see only what your role already lets you see.** Each tool declares the
permission it needs, and tools your role cannot use are not offered to you at
all. An admin gets everything; a viewer gets student lookups, defaulters and
receipts but not fee policy or collection reports. Access is attributable to a
person and revoked by deactivating their staff account.

### As unattended automation

The morning defaulter task has no human present to click through a sign-in, so it
uses a shared token:

```text
https://schoolfees-live-mcp.raj-39e.workers.dev/svc/mcp/YOUR_PRIVATE_TOKEN
https://schoolfees-live-mcp.raj-39e.workers.dev/svc/mcp   (+ Authorization: Bearer …)
```

Use the token-in-path form with `No Auth` for ChatGPT, which does not reliably
forward a custom Authorization header. Do not publish or share that full URL.

`/health` is public and returns no student or fee data.

## What you can ask

Start a new conversation by letting the assistant call `describe_capabilities` —
it returns the money vocabulary and the rules that decide which students count,
so the assistant reads every figure the way the office does.

Then, in plain language:

- *"How much is still outstanding this year?"*
- *"Show me everything about admission number 2682."*
- *"Which families in Class 8 have paid nothing yet?"*
- *"Who promised to pay and hasn't?"*
- *"Every student on transport owing more than ₹20,000."*
- *"Which students have left but still owe us money?"*
- *"Explain how Pratiksha's fee was calculated."*
- *"What did we collect last month, by payment mode?"*
- *"Draft reminder messages for the top ten defaulters."*
- *"Find receipt SVP20260808-0004."*

## The tools

**Getting oriented**

| Tool | For |
|---|---|
| `describe_capabilities` | The vocabulary, the rules, and what you can read |
| `list_sessions` | Which academic years exist; which is live, which is test |
| `get_system_health` | How current the figures are, and data-quality counts |

**Students**

| Tool | For |
|---|---|
| `search_students` | Find a student by name, SR number, class, parent or phone |
| `get_student` | Everything about one child, in sections you choose |
| `query_students` | Any list or count: filter, group and total |
| `get_student_financial_history` | Exact receipts, allocations, corrections, refunds |
| `get_family` | Siblings and the family's combined position |

**Money**

| Tool | For |
|---|---|
| `get_session_money_summary` | The headline position for the year |
| `get_dashboard_analytics` | The five live Dashboard boards |
| `get_class_due_summary` | Class, route or enrollment-status totals |
| `get_installments` | Installment-level questions and upcoming due dates |
| `get_fee_structure` | The policy: schedule, late fee, discounts, routes |
| `get_ai_analysis_context` | The whole session in one call, for broad analysis |

**Payments and receipts**

| Tool | For |
|---|---|
| `get_recent_payments` | Who paid recently |
| `search_receipts` | Find receipts by number, student, date, mode or staff |
| `get_receipt` | One receipt in full, including reversals and refunds |
| `get_collection_report` | Collection by day, month, mode or staff member |

**Follow-up and recovery**

| Tool | For |
|---|---|
| `today_fee_collection_brief` | Where collection stands right now |
| `list_defaulters_for_followup` | Who to call, ranked |
| `get_student_due_status` | One student's current dues |
| `get_recovery_queue` | Today's call list |
| `get_promise_due_list` | Promises broken or falling due today |
| `get_parent_followup_context` | What to say before ringing one family |
| `draft_recovery_plan` | The day's collection work, grouped |
| `prepare_followup_messages` | Draft reminders with UPI links (never sent) |
| `daily_recovery_digest` | The whole morning run in one call |

**Students who have left**

| Tool | For |
|---|---|
| `get_left_student_recovery` | Leavers who still owe — not on the defaulter list |
| `get_prev_year_dues` | Last year's carry-forward balances |

### Reference material

The server also publishes reference documents your client can pin into the
conversation, so definitions do not cost a tool call:

```text
schoolfees://glossary/money        what every money field means
schoolfees://rules/student-scope   which students count, and when
schoolfees://rules/school          AY 2026-27 policy, late fee, discounts
schoolfees://rules/answering       the rules for a correct answer
schoolfees://data-model            the views behind every figure, and their traps
```

And ready-made prompts for the recurring jobs: `morning_recovery_run`,
`student_360`, `class_review`, `reconcile_money`, `explain_this_number`,
`left_students_still_owing`.

## How to read the answers

Four things the school's numbers mean, which the server states in every payload
but which are worth knowing yourself.

**Fees and late fees are separate.** They are never added together and called
"pending". A family whose only remaining debt is a late fee is **not** a
defaulter. If you want the one number a cashier could collect today, that is
`totalCollectableAmount`.

**Headcount and money count different people.** Headcount is students on the
roll. Money includes students who left owing, because that money is still
collectable — a leaver who never paid had their dues cancelled and carries
nothing, but one who paid part of the year still owes the rest. Every response
carries a `scope` block saying which rule it used. If two figures differ, compare
their scopes before assuming one is wrong.

**Enrollment status is not the fee tier.** `enrollment.status` is
`active`/`inactive`/`left`/`graduated`. `feeTier` is `New`/`Old` and only decides
which academic fee applies.

**Check how fresh a figure is.** The financial views are rebuilt just off the
payment path, so a figure read seconds after a payment can be up to about two
minutes behind the counter. Every money answer carries
`provenance.dataFreshness`.

## Instructions for a custom assistant

If you are configuring a GPT or a Claude Project, this is a good system prompt:

```text
You are the VPPS fee assistant. Use the Schoolfees MCP tools for every question
about students, fees, payments, defaulters and collection. Never quote a fee
amount from memory — always fetch live data.

Call describe_capabilities at the start of a conversation to load the money
vocabulary and the student-scope rules.

Quote fees pending and late fee pending as two separate figures, or quote
totalCollectableAmount and say that it includes both. A family whose only debt is
a late fee is not a defaulter.

Headcount counts students on the roll; money includes students who left owing.
Each response says which rule it used. Where two numbers differ, read their scope
blocks and explain the difference rather than picking one.

For the morning collection run use daily_recovery_digest. For one student use
get_student. For any list or count the named tools do not cover, use
query_students.

Never suggest calling a family flagged no-call. Never say a message was sent or a
payment was posted — this server cannot do either. Drafts are for a person to
review and send.
```

## Sessions

`2026-27` is the live session with the school's real records. `TEST-2026-27` is
for testing. Every tool accepts an explicit `sessionLabel` and defaults to the
live one; `list_sessions` flags which is which.

## Troubleshooting

**"Unauthorized" or a repeated sign-in prompt on the staff lane** — the grant was
revoked, or the account is now inactive or has a role that is no longer allowed.
Reconnect and sign in again.

**"Unauthorized" on the automation lane** — the client is on the old `/mcp/TOKEN`
path (that is now the OAuth lane) or the token is stale. Move it to
`/svc/mcp/TOKEN` and confirm the token matches the current Worker secret.

**A tool you expected is missing** — tools are filtered by your staff role. Ask
an admin whether your role covers it.

**Sign-in says your role is not allowed** — add the role to
`SCHOOLFEES_MCP_ALLOWED_ROLES` in `workers/schoolfees-mcp/wrangler.toml` and
redeploy, or use an account that already has one.

**Tools not visible at all** — refresh or re-import tools in the connector
settings.

## Operations

Deploy:

```bash
npm run mcp:schoolfees:worker:deploy
```

Check the deployment agrees with the database:

```bash
npm run verify:mcp-health -- --session 2026-27
```

Rotate the automation token:

```bash
npx wrangler secret put SCHOOLFEES_MCP_TOKEN --config workers/schoolfees-mcp/wrangler.toml
```

Rotating breaks every automation client on the old value, so update them in the
same sitting: the ChatGPT connector URL for the daily defaulter task, and the
`SCHOOLFEES_WORKER_MCP_TOKEN` used by `.mcp.json`. The staff OAuth lane does not
use this token and is unaffected.

Two deliberate behaviours on the automation lane: it **fails closed** — a missing
`SCHOOLFEES_MCP_TOKEN` denies everything, because the Worker reads Supabase with
the service-role key — and there are **no unauthenticated method exemptions**, so
a misconfigured connector fails at connect time rather than looking healthy until
the first real question.

Notion remains a read-only mirror of synced fee summaries. Never treat it as the
source for promises, callback dates, contact status or payment decisions; the
source of truth is the Schoolfees app and these tools.
