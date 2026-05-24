# Policy + Receipt-Breakdown Fix — 2026-05-24

**Owner:** Janmejay (raj@vpps.co.in)
**Session:** live AY `2026-27`
**Predecessor commit:** `ffcdb47` (initial revamp) + `d624273` (working-tree cleanup)
**Scope:** Database-only patches to surface fee policies correctly on the receipt UI. No code or schema changes.

---

## What surfaced after the initial revamp went live

Once the owner started using the app, a few receipt-rendering and policy-classification issues showed up that weren't visible during Tier 0-7 because the issues live in the workbook view layer, not in the per-installment math.

1. **DIYA JAIN** (and every other student) — receipt showed `Tuition ₹0` even though the total was correct. Reason: my Tier 2 `fee_settings` reseed populated `annual_base_amount` but not `tuition_fee_amount`; the workbook view reads from the latter.
2. **AANYA VERMA** (and 22 other newly-admitted students) — showed zero dues. Reason: their Excel rows had `Tuition Override = 0` as a placeholder default (because they were new admissions filled in at the bottom of the sheet), and the Tier 4 decoder mis-classified all 23 as RTE.
3. **All 92 discounted students** — receipt showed gross tuition with no Discount line. Reason: the workbook view derives `tuition_fee` from `fee_settings.tuition_fee_amount` (or `student_fee_overrides.custom_tuition_fee_amount`), but it doesn't consult `student_conventional_discount_assignments` at all. So RTE/Staff Child/3rd Child discounts were invisible in the per-head breakdown.
4. **All 84 New students** — receipt showed `Academic Fee ₹500` instead of ₹1,100. Reason: the view determines New vs Old from `student_fee_overrides.student_type_override` or `fee_settings.student_type_default` (defaulting to "existing"), and I had only set `students.joined_on` during Tier 3.
5. **2 transport-override students** (PRIYANSHI MEENA ₹14,000/yr, TANISH PRAJAPAT ₹2,500/yr) — receipt showed `Transport ₹0`. Reason: the override row populated `custom_transport_installment_amount` but the view reads `custom_transport_fee_amount`.
6. **Late fee on Installment 1** for all 481 students — owner decided to waive this AY's first-installment late fee as a one-time amnesty (parents weren't aware of the new ₹1,000 flat fee).
7. **3 extra discounts** that appear in the `Custom_Report` notes (`"All Clear with 1000 discount"`, `"ALL CLEAR WITH 3400 DISCOUNT"`, `"All Clear wit 3 sibling discount"`) were paid for but not captured anywhere in the dues system.

## Owner-clarified policy answers

1. **Receipt breakdown style:** Show GROSS tuition + a separate Discount line (more audit transparency).
2. **Allocation:** Normal greedy allocation — a parent who pays a multi-installment lump sum gets that amount distributed across Installment 1 first, then 2, etc. No early-payment discount.
3. **Academic fee:** New = ₹1,100, Old = ₹500. Stays in Installment 1. Overdue from Installment 1 if not paid.
4. **Overpayments:** Stay as advance credit on the receipt; will be re-applied when a transport route is added or any other charge surfaces.
5. **Late fee:** **One-time amnesty for AY 2026-27 Installment 1 only.** Installments 2-4 keep the ₹1,000 flat late fee. Future academic sessions resume the normal policy.
6. **Extra discounts** (anything beyond conventional RTE/Staff/3rd Child) — captured as student-level discounts on `student_fee_overrides.discount_amount`.

## Patches applied (database-only)

All operations wrapped in transactions. Append-only triggers (`receipts_*`, `payments_*`) re-enabled at the end.

### Patch A — `fee_settings.tuition_fee_amount` populated for all 19 live `2026-27` classes
Set `tuition_fee_amount = annual_base_amount` so the view's tuition-fee field surfaces the class default. This single fix resolved every non-discounted student's receipt breakdown showing `Tuition ₹0`.

### Patch B — 23 mis-classified RTE students restored to full tuition
Removed wrong `student_conventional_discount_assignments` rows for the 23 newly-admitted students whose Excel `Tuition Override = 0` was a placeholder. Rebuilt their installments to full class tuition + ₹1,100 academic on Installment 1.

### Patch C — `student_fee_overrides` rows inserted for all 92 conventionally-discounted students
For each RTE / Staff Child / 3rd Child student, inserted a row with:
- `custom_annual_base_amount = annual_base_amount` (no-op, satisfies legacy check constraint)
- `discount_amount = annual_tuition − resulting_tuition_after_discount`
- `student_type_override = 'new'` for those who are also New students

This is what makes the receipt show `Tuition ₹19,000 / Discount ₹19,000 / Net ₹0` for an RTE Class 3 student (instead of a single `Tuition ₹0` line that hides the value waived).

### Patch D — `student_type_override = 'new'` set for the remaining 84 New students
For New students who didn't already get an override row in Patch C, inserted one with `student_type_override='new'` so the view returns `academic_fee = 1100` on their receipts.

### Patch E — 2 transport-override students got `custom_transport_fee_amount` populated
PRIYANSHI MEENA and TANISH PRAJAPAT. Set `custom_transport_fee_amount = custom_transport_installment_amount × 4` on their existing override rows. View now surfaces transport correctly.

### Patch F — Installment 1 late fee amnesty for all 481 students
`update installments set late_fee_flat_amount = 0 where session = '2026-27' and installment_no = 1`. Result: 481 / 481 Installment 1 rows now have ₹0 late fee. Installments 2-4 keep ₹1,000.

### Patch G — 3 extra Custom_Report discounts captured
| Student | Class | Note from Custom_Report | Captured as |
|---|---|---|---|
| **PRIYANSH SONI** (SR 2449) | Class 4 | "ALL CLEAR WITH 3400 DISCOUNT" | New override row `discount_amount = 3,400`. Installments reduced by ₹850/inst. |
| **HITVIKA TAILOR** (SR 2331) | JKG | "All Clear with 1000 discount" | Existing RTE override `discount_amount` raised 17,000 → 18,000. Installments reduced. Transport reduced ₹250×3 across Inst 2-4 (Inst 2-4 had ₹0 base after RTE so couldn't absorb the cut). |
| **ANANYA LAKHARA** (SR 2480) | Class 3 | "All Clear wit 3 sibling discount" | New `student_conventional_discount_assignments` row for `third_child` (tuition ₹19,000 → ₹6,000) + override with `discount_amount = 14,000` (13,000 from policy + 1,000 extra). Installments rebuilt. She is now `All Clear` at ₹12,500 paid. |

## Final live `2026-27` state after all patches

| Metric | Value |
|---|---|
| Students | 481 |
| Installments | 1,924 |
| Active conventional discounts | 70 (46 RTE + 16 Staff Child + 8 3rd Child) |
| Active `student_fee_overrides` rows | 156 |
| Gross annual dues across all students | ₹1,26,65,900 |
| Total discount surfaced | ₹11,74,650 |
| Net annual dues | ₹1,14,91,250 |
| Collected so far | ₹11,51,350 |
| Outstanding | ₹1,03,67,450 |
| Installment 1 late fee waived | 481 / 481 |
| Append-only triggers (receipts/payments/payment_adj/receipt_adj) | All ENABLED |

## Things the owner should still do manually in the app

1. **Fix 30 PENDING SR placeholders** when real SR numbers are available (`PENDING-2026-NNNN` and `PENDING-2026-DUPE-NNNN` and `PENDING-2026-NEW-NNNN`).
2. **Confirm 2 transport overrides** — PRIYANSHI MEENA's ₹14,000 looks high (matches Bhakroda route fare); TANISH PRAJAPAT's ₹2,500 is unusual. If wrong, deactivate the relevant `student_fee_overrides` row via the Students module (don't delete — append-only).
3. **Decide on the ₹2,000 advance credit on PRIYANSH SONI** — it sits as overpayment on his receipt. If he's also supposed to pay a books/activity fee that's not in the system yet, that's where the ₹2,000 lands. Otherwise, can be refunded.
4. **Chase the 85 students with no parent phone** before late-fee window opens on Inst 2 (due 20-Jul-2026).

## TEST-2026-27 untouched

Same fingerprint as pre-revamp:

| Metric | Value |
|---|---|
| Classes | 19 |
| Students | 79 |
| Installments | 316 |
| Receipts | 18 |
| Payments | 24 |
| Discounts | 24 |
| Import batches | 7 |
| Payments sum | ₹1,06,750 |
