-- One row shape for the whole ledger: transport lives in base_amount.
--
-- Workbook mode folds tuition + transport + academic into `base_amount` and
-- writes `transport_amount = 0` (lib/fees/generator.ts, since the 20260423093000
-- cut-over). Rows written before that kept transport in its own column and were
-- never converted, so the same table carried two shapes at once — 509 rows
-- across 149 students in 2026-27 holding Rs 9,38,875, and 358 students holding
-- Rs 0 for exactly the same thing.
--
-- No money is wrong either way. `amount_due` is GENERATED ALWAYS AS
-- ((base_amount + transport_amount) - discount_amount), so which of the two
-- columns holds the transport cannot change what a family owes. What it does
-- change is what a reader sees: `sum(transport_amount)` returns a number that
-- looks like transport income, is neither the whole of it nor zero, and would
-- be believed. That is the failure this closes.
--
-- Every affected student would have converted silently on their next
-- regeneration anyway. Doing it in one pass means the column has a single
-- meaning from now on rather than converging student by student over a year.
--
-- Verified on live before writing: the identical statement inside a rolled-back
-- transaction moved 520 rows' `base_amount` and changed ZERO rows' `amount_due`,
-- with the school-wide total identical at 15,697,150 either side.
--
-- Not enforced with a CHECK. The legacy (non-workbook) branch of the generator
-- still exists and would legitimately write a non-zero `transport_amount` for a
-- session on `calculation_model = 'standard'`. All three sessions are
-- `workbook_v1` today, so `scripts/verify-ledger-policy-health.mjs` asserts it
-- as an invariant for workbook sessions instead — which fails loudly without
-- breaking a model the code still supports.

begin;

update public.installments
set base_amount = base_amount + transport_amount,
    transport_amount = 0
where transport_amount > 0;

commit;
