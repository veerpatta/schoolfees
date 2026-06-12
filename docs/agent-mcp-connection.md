# Schoolfees MCP Agent Connection

This MCP server gives a ChatGPT agent live, read-only fee collection context
from the schoolfees backend.

It is designed for the internal VPPS office workflow:

- current fee collection brief
- defaulter follow-up list
- student due lookup
- class-wise due summary
- recent receipts
- draft follow-up messages

It does not post payments, edit students, change fee setup, send WhatsApp
messages, or rewrite financial history.

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

For local testing, expose the local endpoint through an HTTPS tunnel:

```powershell
ngrok http 4317
```

Then connect the HTTPS URL with `/mcp` appended:

```text
https://YOUR-TUNNEL-DOMAIN.ngrok-free.app/mcp
```

In ChatGPT:

1. Open Settings.
2. Enable Developer Mode under Apps/Connectors advanced settings.
3. Create an app/connector from a remote MCP server.
4. Paste the HTTPS MCP URL.
5. Refresh the app metadata after tool changes.

OpenAI's Apps SDK and MCP guidance use a remote MCP server to expose tools to
ChatGPT. ChatGPT Developer Mode supports remote MCP servers over Streamable HTTP
or SSE.

## Agent Instructions

Add this to your agent instructions:

```text
You are the VPPS fee collection assistant. Use the Schoolfees MCP tools for all
student due amounts, defaulter lists, recent payments, class summaries, and
follow-up drafts. Do not guess fee amounts from memory. Always fetch live data
before answering fee collection questions. Draft messages only; do not claim
that any message was sent or any payment was posted.
```

## Live Session Switch

The default is intentionally test-safe:

```text
SCHOOLFEES_MCP_DEFAULT_SESSION=TEST-2026-27
```

When you are ready to use live office collection data, set:

```text
SCHOOLFEES_MCP_DEFAULT_SESSION=2026-27
```

The MCP still allows the agent to pass an explicit `sessionLabel` per tool call.

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
