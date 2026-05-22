# 🧭 Product & School Rules

## Product identity

This app serves one school: **Shri Veer Patta Senior Secondary School**.

Accepted short names:

- VPPS
- Veer Patta School
- Shri Veer Patta Senior Secondary School

## What the app should optimize for

1. Correct fee and dues calculation
2. Safe payment posting
3. Clear receipts and history
4. Easy daily office workflows
5. Exports for practical school operations
6. Auditability before visual polish

## What the app should not become

- Parent-facing portal
- Online public payment app
- Multi-school SaaS
- Demo/tutorial replacement for school workflow
- Direct ledger editing tool

## Active AY 2026-27 defaults

| Rule | Current value |
| --- | --- |
| Active live session | `2026-27` |
| Permanent test session | `TEST-2026-27` |
| Fee engine | `workbook_v1` |
| Late fee | ₹1000 flat |
| Installments | 4 |
| Due dates | 20 Apr 2026, 20 Jul 2026, 20 Oct 2026, 20 Jan 2027 |
| New student academic fee | ₹1100 |
| Existing student academic fee | ₹500 |
| Class 12 science annual tuition default | ₹38000 |
| Receipt prefix | `SVP` |
| Accepted payment modes | Cash, UPI, Bank transfer, Cheque |
| Books in workbook calculation | Excluded unless explicitly changed |

## Conventional discount policies

| Policy | Tuition result |
| --- | --- |
| RTE | ₹0 |
| Staff Child | 50% tuition |
| 3rd Child Policy | ₹6000 tuition |

Rules:

- Tuition-only impact.
- Other fee heads remain unchanged unless explicitly configured later.
- Maximum two active conventional policies per student per academic year.
- If multiple policies apply, compute candidate tuition values and choose the lowest.
- Assignments are academic-year scoped and audited.
- Manual overrides are separate from conventional policies.
- Family grouping supports sibling policy logic.

## 3rd child policy behavior

Current implementation direction:

- Requires at least 3 active siblings in the family/session.
- Applies to exactly one sibling.
- Selects the youngest/smallest-class recipient using class rank and deterministic tie-breakers.
- For 4 or more siblings, still only one student receives the 3rd Child Policy.
- Refreshes affected students' dues after family/student/Fee Setup changes.

## Historical policy notes that are not active

Old notes may mention:

- due dates on the 10th
- ₹50/day late fee
- ₹3000 flat late fee

Those are not active policy for AY 2026-27 unless explicitly handling historical data.

