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
- late fee: flat `₹1000` — see "Late fee" below for the rule, which changed materially
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

If docs/notes conflict, this file and `src/platform/config/fee-rules.ts` are the active
intent.

## Late fee

**A late fee is a separate charge, not part of what a family owes in fees.**

- Charged the day an installment passes its due date with fees still unsettled.
- Once charged it **stays owed** until it is paid or explicitly waived. Clearing the fees
  afterwards does not remove it.
- An installment settled in full **on or before** its due date is never charged.
- A **carry-forward (previous-year) row never accrues one** — those rows carry a rate of
  zero on purpose.
- It is **never counted in fees pending, expected fees, overdue, or defaulter status.** A
  family whose only remaining debt is a late fee is not a defaulter and their installment
  reads *paid*.
- It can be waived per installment, with a reason, by whoever has
  `payments:waive_late_fee`. A waiver is voided, never deleted, and voiding one bills that
  installment again.
- **A late fee that has already been paid cannot be waived.** Handing back collected money
  is a refund — a different act, with its own surface and audit trail.

Two engines compute this — `v_workbook_installment_balances` and
`private.workbook_installment_snapshot` — and they carry the same rule verbatim. They must
be changed together.

When the rule itself changed on 08-08-2026, the school approved the correction but **not**
back-charging families, so the increase was cancelled with `source='grandfather'` waivers
rather than billed. That is the precedent: a rule may be corrected going forward without
raising a bill that was already communicated.

## Monthly repayment plans (EMI)

A family carrying a previous-year balance can clear it over **interest-free monthly
instalments**. A plan is a layer *over* dues that already exist — it never rewrites
installments, receipts or the fee engine.

- Three scopes: previous year only, current year only, or both.
- Activation waives the late fees on the covered installments, so a family that keeps to
  the calendar pays none.
- **A missed monthly instalment charges a flat ₹1,000**, as its own real installment row.
  A plan defers late fees; it does not forgive them.
- A family paying their EMI on time **is not a defaulter**, even though the covered
  installments are months past their original dates.
- A plan is never edited in place. Rescheduling writes a replacement and supersedes the
  old one, so the schedule a parent was shown stays on file.
- While a plan is active, concessions at the counter are refused — changing the deal is an
  admin rescheduling it, not a cashier waiving on the spot.

## Previous-year dues (carry-forward)

Unpaid dues from the prior session are carried into the current one as a **dedicated
installment line**, marked `is_carry_forward`, with an early due date and **zero late fee**.
They are reported separately as "old balance" and must never be blended into this year's
collection figures. Fee Setup regeneration must leave them alone.

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

## Houses

Four, named for the rulers of Mewar:

- `Bappa Rawal`
- `Rana Kumbha`
- `Rana Pratap`
- `Rana Sanga`

`students.house` is a picker over exactly these (`HOUSE_OPTIONS` in
`src/modules/students/domain/info-fields.ts`), and the names are never translated — a house
does not become a different house in Hindi.

Allocation is not universal: 131 of the roll carried a house when it was first
imported from the Sampark export on 2026-08-20, and the rest are blank rather
than guessed at. A house has no effect on fees, dues or any figure — it is for
sports and assembly.

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

## Production Operations Rules

These apply at all times while the app is live:

- The `2026-27` session contains real student fee records and posted receipts.
  Never use it for testing, debugging, or experimental changes.
- All debugging, feature testing, and import dry-runs use `TEST-2026-27`.
- Never post test payments against real students. Test students in
  `TEST-2026-27` are named with the `TEST-` prefix on their admission numbers.
- Admin passwords must never be stored in repo files, prompts, or documents.
- Shared admin credentials should be rotated whenever a staff member leaves.
- Corrections to real posted records use the explicit adjustment/reversal
  workflow — never direct edits.
