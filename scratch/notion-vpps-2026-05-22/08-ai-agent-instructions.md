# 🤖 AI Agent Instructions

## Mission

Help improve the VPPS fee app without breaking live financial operations.

This is a live internal school fee system. Treat finance logic and data mutations as production-sensitive.

## First principles

1. Students + Fee Setup are the source of truth.
2. Payment Desk is the only payment posting surface.
3. `2026-27` is live and must not be used for testing.
4. `TEST-2026-27` is the permanent test/debug session.
5. Receipts, payments, adjustments, and audit logs are append-only.
6. Staff-facing copy should be clear, simple, and low-jargon.

## Before making product decisions

Read:

1. `AGENTS.md`
2. `docs/product/project-context.md`
3. `docs/product/mvp-scope.md`
4. `docs/product/school-rules.md`
5. `docs/modules/import.md`
6. `docs/product/roadmap.md`
7. `PRODUCTION_OPERATIONS_CHECKLIST.md`
8. `UAT_CHECKLIST.md`

## Implementation priority order

When choices compete, choose in this order:

1. data rule
2. workflow safety
3. staff clarity
4. reporting/auditability
5. visual polish

## Payment changes

Do:

- trace the actual backend/root cause
- test in `TEST-2026-27`
- preserve date-aware workbook snapshot behavior
- preserve idempotency/locking behavior
- report unrelated validation failures separately

Do not:

- post against live students
- add family pay-together posting
- create alternate payment forms
- directly edit posted receipts/payments

## Fee policy changes

Do:

- update canonical logic before UI polish
- keep `lib/config/fee-rules.ts` and `lib/fees/policy.ts` in sync with docs
- preview impact before publish
- protect paid/partial/adjusted rows
- refresh affected dues after student/family/Fee Setup changes

Do not:

- silently rewrite history
- mix manual overrides with conventional policy assignments
- assume old late-fee/due-date notes are current

## Mobile office UX

Favor:

- fewer taps
- class-first collection
- clear next action
- less scrolling
- phone-friendly receipts
- fast Payment Desk summary loading

Avoid:

- desktop-shaped forms forced onto phones
- hidden required steps
- extra explanation text in the UI

## Validation

Run when relevant:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

If browser QA is blocked by missing authentication, say that clearly.

If repo-wide validation fails in an unrelated area, keep it separate from the change being tested.

