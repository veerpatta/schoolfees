# SCHOOL_RULES.md

## Canonical School Identity

Accepted names in docs/UI:

- Shri Veer Patta Senior Secondary School
- Veer Patta School
- VPPS

Preferred full display name:

- `Shri Veer Patta Senior Secondary School`

## App Posture

- internal admin/accounts office app
- one school only
- not a parent portal
- not a multi-school SaaS

## Active AY 2026-27 Fee Policy Defaults

- active academic session: `2026-27`
- fee engine: `workbook_v1`
- late fee: flat `₹1000`
- installment due dates:
  - `20-04-2026`
  - `20-07-2026`
  - `20-10-2026`
  - `20-01-2027`
- default installment count: `4`
- new student academic fee: `₹1100`
- existing/old student academic fee: `₹500`
- class 12 science annual tuition default: `₹38000`
- receipt prefix: `SVP`
- accepted payment modes: Cash, UPI, Bank transfer, Cheque
- books excluded from workbook-mode fee calculation unless changed explicitly

If docs/notes conflict, this file and `lib/config/fee-rules.ts` are the active
intent.

## Conventional Discount Policies (Current)

Supported policy outcomes for tuition:

- `RTE` -> tuition becomes `₹0`
- `Staff Child` -> tuition becomes `50%`
- `3rd Child Policy` -> tuition becomes `₹6000`

Rules:

- policy effects apply to tuition only
- other fee heads remain unchanged unless explicitly configured later
- max two active conventional policies per student per academic year
- when multiple policies apply, evaluate candidate tuition values and keep the
  lowest
- assignments are academic-year scoped and auditable
- family/sibling grouping supports 3rd-child logic
- manual discount/override remains separate from conventional policies

## Transport Rules

- route-wise annual transport defaults come from active fee setup
- student-level transport override can replace route default for that student
- class/route changes should trigger scoped dues refresh behavior

## Refund / Credit Behavior

- post-payment policy/student changes may create pending or credit/refund state
- pending vs credit/refund projection is surfaced through current financial
  state views/workflows
- corrections should be auditable and explicit

## Payment And Receipt Permanence

These are non-negotiable safety rules:

- never directly edit/delete posted payments
- never directly edit/delete posted receipts
- keep payment adjustments as separate append-only records
- preserve receipt chronology and audit logs
- use adjustment/refund/credit/withdraw style correction workflows instead of
  rewriting history

## Recalculation / Publish Safety

Fee Setup publish and regeneration behavior should:

1. preview impact first
2. apply changes to unpaid/future rows in scope
3. protect paid/partial/adjusted rows from silent rewrite
4. keep review trail for protected rows and change batches

## Historical SOP (Not Active)

These may exist in old spreadsheets/notes but are **not current policy**:

- due dates on 10th
- late fee `₹50/day`
- stale note showing flat late fee `₹3000`

Current policy values above take precedence unless explicitly handling
historical sessions.

## UAT Safety Rules

- do not reset/overwrite real `2026-27` data for testing
- use `TEST-2026-27` for UAT wherever possible
- use dummy records only (e.g., `Test Student 001`, `TEST-SR-001`)
- do not post test payments against real students
- rotate shared admin passwords after UAT
- do not store passwords in repo/docs/prompts
