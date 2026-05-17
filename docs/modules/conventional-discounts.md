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
