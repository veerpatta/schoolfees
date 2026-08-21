# FEE_SETUP_GUIDE.md

> Not described below, but part of this module: **fee heads**, the academic-fee
> distribution mode (`first_only` / `equal`), **conventional discount policy editing**
> (which triggers `applyThirdChildPolicyForSession()`), the generate screen at
> `/protected/fee-setup/generate`, and **time travel** at `/protected/fee-setup/time-travel`
> (`src/modules/fees/data/time-travel.ts`).
>
> On the late fee: it is now a **separate charge, excluded from expected fees** — see
> `docs/product/school-rules.md`. When the rule itself changed on 2026-08-08 the increase
> was grandfathered rather than billed, and `late_fee_rule_change_snapshot` records the
> pre-change position.
>
> **Regeneration must leave alone:** carry-forward rows, EMI-covered installments, and any
> paid / partial / adjusted row. Fee Setup publish previews impact before applying.

## Purpose

Configure academic-year fee defaults safely with preview/publish controls.

## What You Configure

- academic session label
- class tuition defaults
- transport annual defaults
- installment due dates
- flat late fee
- new/existing academic fee

## Standard Flow

1. Open Fee Setup.
2. Select/confirm session.
3. Update fee values.
4. Run **Preview Changes**.
5. Review impact summary and protected rows.
6. **Publish Fee Setup**.

## Conventional Discounts in Fee Setup Context

Conventional discount policy definitions are year-scoped and should align with
school rules. Student-level assignment and family grouping should remain
auditable.

## Impact Rules

- unpaid/future rows update in scope
- paid/partial/adjusted rows are protected
- protected rows stay visible for manual review decisions

## Post-Publish Financial Meaning

If fees are changed after some payments are already posted, history is not
rewritten. Net impact appears as pending amount or credit/refund state.
