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

## Editable Configuration Surfaces

What is editable in the system right now:

- live fee policy fields:
  academic session label, installment schedule, late fee, receipt prefix,
  accepted payment modes, and custom fee-head catalog
- school-wide defaults
- class-wise defaults
- transport route defaults
- per-student overrides
- academic sessions, classes, and routes as master data

Operational rule:

- live fee policy/default changes should be made through `/protected/fee-setup`
  so preview/apply safety, audit batches, and ledger-safe propagation all run
- `/protected/setup` is for first-time go-live preparation only; after setup is
  marked complete, it should no longer be used as a live policy editing path
- `/protected/master-data` remains the editable source for sessions, classes,
  and routes; fee heads and payment modes are visible there but edited in fee
  setup

Daily workflow boundary:

- `Start Here` is the staff-facing first worksheet for blockers and shortcuts
- `Advanced` is the place for setup, school setup lists, finance controls,
  reports, staff, and settings
- `Fee Setup` is the only live fee-editing path

## System-Wide Propagation Rules

Current policy changes should propagate to:

- fee setup displays and impact preview
- session ledger recalculation / regeneration
- dashboard policy notes
- payment entry validation and receipt prefix generation
- defaulters and outstanding reporting
- reports filters and policy notes
- settings policy notes and config-change audit log
- landing/auth policy copy where current policy is displayed

Propagation rule:

- all of those surfaces should read the active policy through the same
  canonical service, not through duplicated hardcoded values

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

Historically locked behavior:

- posted receipts keep their historical receipt number and recorded payment mode
- posted payments are never edited in place
- payment adjustments remain separate append-only correction records
- paid, partially paid, or already adjusted installment rows must not be
  silently rewritten by policy/default changes

## Recalculation / Regeneration Rules

Current live-change behavior should work like this:

- admin previews the change first
- the system shows affected students and installment rows
- apply updates only future or unpaid installment rows in scope
- paid, partially paid, or adjusted rows are blocked and logged for manual
  review instead of being mutated
- the change batch and blocked rows remain auditable

Safe admin workflow for live fee policy change:

1. update the desired values in `/protected/fee-setup`
2. review the changes first
3. review changed fields, affected students, and blocked rows
4. save the change only after review
5. follow up manually on blocked rows if the system protected paid history

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
