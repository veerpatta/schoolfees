# 🏫 VPPS Fee App Notion Refresh - Publish Plan

Updated: 22 May 2026  
Source repo: `C:\Users\janme\Documents\schoolfees`  
Status: ready to publish after Notion parent-page access is available

## What to create in Notion

Create one top-level hub page:

- `🏫 VPPS Fee App - Operating System`

Under that hub, create these child pages:

- `📌 Start Here`
- `🧭 Product & School Rules`
- `🧱 Developer Map`
- `💸 Finance Safety & Payment Rules`
- `🧑‍💼 Office Operations Guide`
- `🧪 Testing & Release Checklist`
- `🗂️ Module Guide`
- `🤖 AI Agent Instructions`

Create one tracker database under the hub:

- `📍 VPPS App Tracker`

Recommended tracker properties:

- `Name` - title
- `Area` - select: Product, Dashboard, Students, Fee Setup, Payment Desk, Transactions, Defaulters, Exports, Admin Tools, Import, Database, Testing, Operations
- `Status` - select: Live, Implemented, Needs Verification, Planned, Blocked, Historical
- `Priority` - select: P0, P1, P2, P3
- `Audience` - multi-select: Developer, Office Staff, Accounts, Admin, AI Agent
- `Last Updated` - date
- `Repo Path` - rich text
- `Notes` - rich text

Initial rows:

| Name | Area | Status | Priority | Audience | Repo Path | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Live app guardrails | Operations | Live | P0 | Developer, Admin, AI Agent | `AGENTS.md` | `2026-27` is live data; use `TEST-2026-27` for testing. |
| Payment Desk only posting | Payment Desk | Live | P0 | Developer, Accounts, AI Agent | `app/protected/payments/*` | No alternate payment posting path. |
| Individual student payments | Payment Desk | Implemented | P0 | Developer, Accounts, AI Agent | `supabase/migrations/20260521171500_disable_family_payments.sql` | Family pay-together was removed to avoid confusion. |
| Conventional discounts | Fee Setup | Implemented | P0 | Developer, Admin, AI Agent | `lib/fees/conventional-discounts.ts` | RTE, Staff Child, and 3rd Child policies are year-scoped and audited. |
| Dashboard analytics | Dashboard | Implemented | P1 | Developer, Admin, Office Staff | `app/protected/dashboard/page.tsx` | Read-only analytics and shortcuts. |
| Mobile office flow | Students | Implemented | P1 | Developer, Office Staff | `components/students/*`, `components/payments/*` | Mobile flow favors fewer taps and faster collection. |
| Import workflow | Import | Live | P1 | Developer, Admin | `lib/import/*` | Staged upload, mapping, dry-run, review, commit, audit trail. |
| UAT after finance changes | Testing | Live | P0 | Developer, AI Agent | `UAT_CHECKLIST.md` | Always verify with `TEST-2026-27`. |
| Performance indexes | Database | Implemented | P1 | Developer | `supabase/migrations/20260522120939_20260522172000_add_missing_performance_indexes.sql` | Latest migration in current history. |

## Publishing notes

If using the local Notion CLI, the parent page must be shared with the `cli` integration first. The CLI currently has no shared pages/databases, so it cannot create the hub at workspace root.

If using Codex Notion MCP, the server entry has been corrected to:

`https://mcp.notion.com/mcp`

but this session still cannot complete the MCP handshake because Notion returns `invalid_grant` during refresh.

