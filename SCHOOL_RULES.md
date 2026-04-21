# SCHOOL_RULES.md

## Canonical School Context

School names that are acceptable in code/docs/UI copy:

- Shri Veer Patta Senior Secondary School
- Veer Patta School
- VPPS

Preferred full display name:

- `Shri Veer Patta Senior Secondary School`

## Active Operating Rules

These are the current active rules and defaults.

- app mode: internal admin app for one school
- late fee: flat Rs 1000
- installment due dates: 20 April, 20 July, 20 October, 20 January
- default installment count: 4
- accepted payment modes: Cash, UPI, Bank transfer, Cheque
- receipt prefix: `SVP`

If code, UI copy, docs, or reports disagree with this file, treat this file and
`lib/config/fee-rules.ts` as the active intent unless the user says otherwise.

## Historical SOP Status

Older SOP values may still appear in old notes, spreadsheets, or conversations.
Treat them as historical reference only, not current policy.

Historical-only values:

- due dates on the 10th
- late fee at Rs 50/day

Do not silently reintroduce those older rules into current workflows.

## Ledger And Payment Rules

These rules are critical:

- never edit historical payments directly
- use adjustment entries, reversal entries, or other explicit correction records
- preserve the original receipt trail
- keep audit logs for all meaningful financial changes
- prefer append-only financial history

Implementation guidance:

- a mistaken payment should not disappear from history
- a correction should be represented as a new auditable event
- staff should be able to understand the correction trail later

## UI And Workflow Rules

The UI should feel like an office tool, not a demo app.

Priorities:

- clear labels
- low-friction data entry
- predictable navigation
- reliable save behavior
- practical print support

Avoid:

- over-designed visual experiments
- hidden actions
- jargon-heavy workflows
- correction flows that require technical understanding

## Reliability Rules

When building or changing flows, prefer:

- safe defaults
- validation before posting
- confirmation for irreversible actions
- traceability over convenience
- readable records over compact cleverness

## Change Reminder

If school policy changes, update together:

- `lib/config/fee-rules.ts`
- related UI copy/settings
- `README.md`
- `AGENTS.md`
- `PROJECT_CONTEXT.md`
- `SCHOOL_RULES.md`
