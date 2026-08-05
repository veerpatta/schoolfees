# CONVENTIONAL_DISCOUNTS.md

## Implemented Conventional Policies

- **RTE** -> tuition `₹0`
- **Staff Child** -> tuition `50%`
- **3rd Child Policy** -> tuition `₹6000`

## Scope Rules

- applies to tuition only
- other fee heads remain unchanged unless later configured explicitly
- max two active policies per student/year
- choose lowest tuition among active policy candidates

## Assignment and Audit Rules

- assignments are per academic year
- assignment rows are auditable
- manual discount/override remains separate

## Family Grouping Support

3rd Child logic is supported by family grouping tables:

- student family groups
- student family members

### How the 3rd Child Policy is applied

- A student belongs to **one** family group, enforced by a unique index on
  `student_family_members (student_id, academic_session_label)`.
- Membership is keyed by **student**, not session: a family linked last year
  stays linked. Membership rows are read across every session, and the link
  actions backfill a row for the current session for every member.
- The policy applies once **three or more** members are active AND sitting in a
  class that belongs to the session being evaluated. It goes to the sibling in
  the lowest class; only one child per family receives it.
- Nothing is applied silently: it runs after an explicit staff action — linking
  siblings, editing a member, or saving the Fee Setup discount block — and each
  of those paths regenerates dues for the students it touched.
- Unlinking withdraws the automatic assignment from the student who left (and
  from whoever is left behind when the family drops below two). Rows flagged
  `is_manual_override` are never touched by the automation.

### Session-wide recheck

Saving the discount block in Fee Setup calls `applyThirdChildPolicyForSession()`
for every family in the session and then regenerates dues for the affected
students. That is the supported way to backfill families that predate a fix —
writing assignments directly in SQL would leave them disagreeing with the
workbook projection, which only picks up a discount when dues are regenerated.

## Import/Export Behavior

- import should avoid unsafe auto-assignment for complex sibling policy cases
- exports can include conventional discount student reports

## Financial Impact Timing

Applying/changing policy after payment can create:

- pending due increase, or
- credit/refund due state

History remains append-only; no back-edit of posted transactions.

## Examples

- RTE + Staff Child active: tuition candidate values include 0 and 50%; final is 0.
- Staff Child + 3rd Child active: compare 50% vs 6000; final is lower value.
