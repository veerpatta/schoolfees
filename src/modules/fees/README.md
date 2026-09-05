# fees

The fee engine and the policy that drives it. The most load-bearing module in the repo.

| | |
|---|---|
| Route | /protected/fee-setup · /protected/fee-structure |
| Files | 16 domain · 11 data · 5 ui |

## Owns

- Fee policy resolution, fee heads, installment schedules
- The workbook_v1 calculation engine
- Conventional discounts (RTE, Staff Child, 3rd Child)
- Dues regeneration and the config-change preview/apply pair
- Transport amounts, because transport is a fee head

## Invariants

- **Money settles the installments oldest-first at read time** (`20260905064847`). A receipt's `installment_id` is history; `settled_amount` is position. A later installment never reads paid while an earlier one is owed. `domain/pooled-settlement.ts` is the TypeScript statement of the rule for tests and health checks; the engines are the SQL.
- **Fee Setup publish previews impact first**, then writes the policy's split to every row in scope, paid or not. It leaves cancelled/waived rows, carry-forward rows, EMI-covered installments and due-date moves on paid rows alone, and reports families the new charge leaves in credit. The live engine is `data/workbook-setup-change.ts`.
- **A late fee is not a fee.** `pending_amount` never contains one. The rule is written twice — in `v_workbook_installment_balances` and `private.workbook_installment_snapshot` — and the two are edited together or not at all. The pooled-settlement block beside it carries the same rule.
- **A headless caller must pass `useAdmin: true`.** Without a session, RLS returns nothing and the generator skips every student with `CLASS_FEE_MISSING`, or resolves every RTE / Staff Child student to no discount. It fails quiet, not loud.
- Discount rules: tuition-only, at most two active policies per student per year, lowest candidate tuition wins, year-scoped and audited.

## Never

- Rewrite a historical payment row because a fee changed.
- Raise a fee amount in bulk without an impact preview somebody read.

## Layout

`domain/` is pure rules — no Supabase client, no `fetch`. `data/` does the IO.
`ui/` is this module's components and belongs to it alone: another module may
import this one's `domain/` and `data/`, never its `ui/`.
`npm run quality:architecture` holds that, and only lets the count fall.
