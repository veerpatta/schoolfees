-- Let the reason-code columns hold the reasons the code actually emits.
--
-- Both CHECK constraints were written before the codes they now have to carry,
-- and neither was widened when the code grew. A CHECK violation fails the whole
-- INSERT, so in each case the failure lands on the exact workflow the newer
-- code was added to serve:
--
--   * `config_change_blocked_installments` never allowed 'in_repayment_plan'.
--     classifyInstallmentLock has emitted it since the repayment-plan work
--     (lib/fees/generator.ts), and lib/fees/workbook-setup-change.ts inserts
--     the blocked rows unfiltered. So a Fee Setup publish touching ANY
--     EMI-covered installment fails outright — and an EMI plan is precisely the
--     case where a family has asked for the bill to be handled carefully.
--
--   * `ledger_regeneration_rows` never allowed 'discount_reduces_unpaid'.
--     lib/fees/regeneration.ts emits it for the rows where a discount lands on
--     an unpaid balance, which is the whole point of that code path.
--
-- 'charge_rise_on_unsettled' is the new counterpart: a HIGHER charge written to
-- an installment that carries money but is not settled. Safe for the same
-- reason a reduction is — the receipt keeps saying what it said, only the
-- remaining balance moves.
--
-- Data-safe: every existing row already satisfies the wider list, so this only
-- ever admits values that were previously rejected.

begin;

alter table public.config_change_blocked_installments
  drop constraint if exists config_change_blocked_installments_reason_code_check;

alter table public.config_change_blocked_installments
  add constraint config_change_blocked_installments_reason_code_check
  check (
    reason_code = any (
      array['fully_paid', 'partially_paid', 'adjustment_posted', 'in_repayment_plan']
    )
  );

alter table public.ledger_regeneration_rows
  drop constraint if exists ledger_regeneration_rows_reason_code_check;

alter table public.ledger_regeneration_rows
  add constraint ledger_regeneration_rows_reason_code_check
  check (
    reason_code = any (
      array[
        'missing_installment',
        'already_in_sync',
        'fully_paid',
        'partially_paid',
        'adjustment_posted',
        'existing_waived',
        'existing_cancelled',
        'extra_installment',
        'missing_settings',
        'discount_reduces_unpaid',
        'charge_rise_on_unsettled'
      ]
    )
  );

commit;
