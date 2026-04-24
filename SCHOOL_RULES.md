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
- active academic session: `2026-27`
- fee engine: `workbook_v1`
- late fee: flat Rs 1000
- installment due dates: 20-04-2026, 20-07-2026, 20-10-2026, 20-01-2027
- default installment count: 4
- accepted payment modes: Cash, UPI, Bank transfer, Cheque
- receipt prefix: `SVP`
- new student academic fee: Rs 1100
- old student academic fee: Rs 500
- books are excluded from workbook-mode fee calculation for AY `2026-27`

If code, UI copy, docs, or reports disagree with this file, treat this file and
`lib/config/fee-rules.ts` as the active intent unless the user says otherwise.

## UAT And Test Data Rules

Before real student data entry, run UAT with dummy records only.

- recommended test academic session: `TEST-2026-27`
- dummy SR number pattern: `TEST-SR-001`
- dummy student name pattern: `Test Student 001`
- dummy route/class labels should be clearly marked with `TEST`
- do not use real student names, real SR numbers, real parent phone numbers, or
  real home addresses during testing
- do not post test payments against real students
- do not change the actual AY `2026-27` defaults just to test the workflow
- do not add a production reset or test-data-clear action unless it is
  explicitly requested and guarded outside production

## Editable Configuration Surfaces

What is editable in the system right now:

- workbook Fee Setup sheet fields:
  academic session label, 4-installment due dates, flat late fee, new student
  academic fee, old student academic fee, class-wise annual tuition, and
  route-wise annual transport fee
- master fee-head metadata:
  refundable flag, one-time/recurring frequency, mandatory flag, and
  workbook-calculation inclusion flag, stored inside
  `fee_policy_configs.custom_fee_heads`
- academic sessions, classes, and routes as master data

Operational rule:

- live workbook fee setup changes should be made through `/protected/fee-setup`
  so preview/apply safety, audit batches, and ledger-safe propagation all run
- `/protected/setup` is for first-time go-live preparation only; after setup is
  marked complete, it should no longer be used as a live policy editing path
- `/protected/fee-setup` is the primary daily live surface for the workbook
  fee sheet: academic year, due dates, late fee, new/old academic fee, class
  tuition, route transport fee, and final review/publish. It opens in Basic
  Mode by default; fee-head metadata and session/class/route maintenance are
  collapsed under advanced options.
  `/protected/master-data` still exists for direct admin maintenance of
  sessions, classes, and routes, but Fee Setup is the preferred daily workflow
  because preview, audit, and safe propagation stay attached there

Daily workflow boundary:

- `Dashboard` is the staff-facing first overview for fee collection, blockers,
  follow-up, and safe shortcuts
- `Students` is the staff-facing worksheet for student master records,
  class/route assignment, student-specific fee profiles, special cases, quick
  add, bulk add, and staged safe bulk update work. Student-specific fee
  overrides belong here; school-wide defaults remain in Fee Setup.
- `Payment Desk` is the only staff-facing workflow for collecting payments,
  posting through allocation, and generating append-only receipts
- `Transactions` is read-only and owns permanent receipt records, dues,
  installment tracker, defaulters, class register, and finance CSV downloads
- `Admin Tools` is the place for rare admin/configuration tools: first-time
  setup, school lists, finance controls, staff, and app settings
- `Fee Setup` is the daily live fee-editing path for workbook values

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
## AY 2026-27 Workbook Rules

For Academic Session `2026-27`, workbook-mode behavior should match the school workbook:

- annual gross = tuition + transport + academic fee + signed other adjustment
- discounts are capped to the workbook gross base
- academic fee is charged fully in installment 1
- remaining annual dues split equally across 4 installments
- odd rupees flow to installment 4
- late fee waiver is capped to current late fee and applied installment-wise in order
- parents may pay any positive whole amount up to current outstanding
- tuition override replaces class tuition for that student
- transport override replaces route default for that student
- books stay outside workbook-mode fee calculation
- fee-head metadata is Phase 1 setup metadata only and does not change AY
  `2026-27` workbook calculation unless explicitly changed later
- workbook narrative notes are secondary to editable `Fee_Setup` values and formulas
- stale workbook note conflict: one note says flat late fee Rs 3000, but editable AY `2026-27` setup and formulas use Rs 1000
- standard concession profiles are Phase 1 planned/read-only setup copy;
  approved student-specific concessions still use the existing override fields

## Ledger And Payment Rules

These rules are critical:

- never edit historical payments directly
- never edit posted receipts directly
- never mark a student paid without a posted payment and receipt allocation
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
