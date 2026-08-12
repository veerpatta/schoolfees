-- 385 installments could never charge a late fee, and nothing said so.
--
-- ===========================================================================
-- What was wrong
-- ===========================================================================
--
-- A late fee is derived, not stored. Both engines gate on
--
--     when coalesce(late_fee_flat_amount, 0) <= 0 then 0
--
-- reading installments.late_fee_flat_amount -- a value the generator stamps
-- once at creation (lib/fees/generator.ts) and which nothing re-stamps
-- afterwards. That guard exists for carry-forward rows, which carry 0 on
-- purpose (CARRY_FORWARD_LATE_FEE_FLAT_AMOUNT) and must never accrue.
--
-- In the live 2026-27 session it was also silently swallowing ordinary rows:
--
--     late_fee_flat_amount = 0     385 rows   all created 2026-05-24
--     late_fee_flat_amount = 1000  1647 rows  created 2026-05-24 .. 2026-08-08
--
-- Same session, same classes, and every one of those classes has
-- fee_settings.late_fee_flat_amount = 1000. None of the 385 has a per-student
-- custom rate. They are not a policy decision, they are a stale batch: 338 of
-- them are already past their due date and accruing nothing at all.
--
-- Because the engines read a snapshot column rather than resolving the policy,
-- there was no way to see this from the app and no check that would fail.
--
-- ===========================================================================
-- What this does
-- ===========================================================================
--
-- 1. Re-stamps every non-carry-forward installment in a workbook session whose
--    rate is 0, from the fee setting its own ledger row already points at.
--
-- 2. Grandfathers the increase for anything already past its due date, exactly
--    as 20260808140000 did for the rule unification. The school approved the
--    rule but not back-charging families, and 338 rows becoming overdue
--    retroactively would bill about Rs 1.5 lakh to people who were never told
--    they owed it. The 47 rows not yet due are left alone: they will accrue
--    normally on 20-10-2026 and 20-01-2027 like everybody else.
--
-- 3. Repairs 5 rows that had already drifted the other way. Their rate was
--    changed from 0 to 1000 at some point after the 2026-08-08 cut-over, which
--    quietly created Rs 5,000 of late fee for 5 families that
--    late_fee_rule_change_snapshot says should still be 0. Same treatment: the
--    charge stands, the increase is waived, and the waiver is visible and
--    voidable rather than being a number nobody can explain.
--
-- Net effect on what families owe today: nothing. Net effect on the engine:
-- it is now correct, so the October and January due dates behave the same for
-- every student instead of for 81% of them.
--
-- Every waiver written here is a normal row in student_late_fee_waivers with
-- source='grandfather'. Voiding one bills that installment. That is the
-- intended way to collect this money if the school later decides to.

begin;

-- ---------------------------------------------------------------------------
-- 1. Capture the target set before touching it
-- ---------------------------------------------------------------------------
-- Captured first so step 3 can tell "was stuck at zero and I just fixed it"
-- from "was already charging". Replay is a no-op: after the update there is
-- nothing left at a zero rate, so this table comes back empty.

create temporary table _lf_restamped on commit drop as
select
  i.id                                as installment_id,
  i.student_id,
  c.session_label,
  i.due_date,
  fs.late_fee_flat_amount             as resolved_rate,
  (i.due_date < current_date)         as was_past_due
from public.installments i
join public.classes c on c.id = i.class_id
join public.fee_policy_configs fp
  on fp.academic_session_label = c.session_label
 and fp.calculation_model = 'workbook_v1'
join public.fee_settings fs on fs.id = i.fee_setting_id
left join public.student_fee_overrides o on o.id = i.student_fee_override_id
where coalesce(i.is_carry_forward, false) = false
  and i.status <> 'cancelled'
  and coalesce(i.late_fee_flat_amount, 0) <= 0
  and coalesce(fs.late_fee_flat_amount, 0) > 0
  -- A per-student rate of 0 is a real decision and stays a real decision.
  and o.custom_late_fee_flat_amount is null;

-- ---------------------------------------------------------------------------
-- 2. Re-stamp
-- ---------------------------------------------------------------------------

update public.installments i
set late_fee_flat_amount = r.resolved_rate,
    updated_at = now()
from _lf_restamped r
where i.id = r.installment_id;

refresh materialized view public.v_workbook_installment_balances;

-- ---------------------------------------------------------------------------
-- 3. Grandfather the rows that were already overdue
-- ---------------------------------------------------------------------------
-- final_late_fee is read back from the refreshed matview rather than assumed to
-- be the flat rate: a row that was settled in full on or before its due date
-- accrues nothing even now, and must not be handed a waiver for a fee it never
-- got.

insert into public.student_late_fee_waivers (
  student_id, installment_id, session_label, amount, reason, source, waived_by
)
select
  b.student_id,
  b.installment_id,
  b.session_label,
  b.final_late_fee,
  'Grandfathered: this installment had no late-fee rate set when it went past '
    || 'its due date, so it never charged one. The rate has been corrected to '
    || 'match the class fee setting, and the school approved the correction but '
    || 'not back-charging families. Void this waiver to bill it.',
  'grandfather',
  null
from _lf_restamped r
join public.v_workbook_installment_balances b on b.installment_id = r.installment_id
where r.was_past_due
  and b.final_late_fee > 0;

-- ---------------------------------------------------------------------------
-- 4. Repair the rows that drifted above their 2026-08-08 position
-- ---------------------------------------------------------------------------
-- Excludes anything step 3 just handled. Anything with no snapshot row was
-- created after the cut-over and is charging legitimately -- it is left alone.

insert into public.student_late_fee_waivers (
  student_id, installment_id, session_label, amount, reason, source, waived_by
)
select
  b.student_id,
  b.installment_id,
  b.session_label,
  b.final_late_fee - s.final_late_fee,
  'Grandfathered: this installment''s late fee rose above what it was when the '
    || 'rule was unified on 08-08-2026, without anyone deciding to charge more. '
    || 'The increase is waived. Void this waiver to bill it.',
  'grandfather',
  null
from public.v_workbook_installment_balances b
join public.late_fee_rule_change_snapshot s on s.installment_id = b.installment_id
where b.final_late_fee > s.final_late_fee
  and not exists (select 1 from _lf_restamped r where r.installment_id = b.installment_id);

refresh materialized view public.v_workbook_installment_balances;
refresh materialized view public.v_workbook_student_financials;
refresh materialized view public.v_student_financial_state;

-- ---------------------------------------------------------------------------
-- 5. Assertions
-- ---------------------------------------------------------------------------

do $$
declare
  v_zero_rate   int;
  v_moved       int;
  v_over_waived int;
begin
  select count(*) into v_zero_rate
  from public.installments i
  join public.classes c on c.id = i.class_id
  join public.fee_policy_configs fp
    on fp.academic_session_label = c.session_label
   and fp.calculation_model = 'workbook_v1'
  left join public.student_fee_overrides o on o.id = i.student_fee_override_id
  where coalesce(i.is_carry_forward, false) = false
    and i.status <> 'cancelled'
    and coalesce(i.late_fee_flat_amount, 0) <= 0
    and o.custom_late_fee_flat_amount is null;

  if v_zero_rate > 0 then
    raise exception 'late-fee rate backfill: % chargeable installment(s) still at a zero rate', v_zero_rate;
  end if;

  -- The guarantee, same as 20260808140000: nobody's bill went up.
  select count(*) into v_moved
  from public.v_workbook_installment_balances b
  join public.late_fee_rule_change_snapshot s on s.installment_id = b.installment_id
  where b.final_late_fee > s.final_late_fee;

  if v_moved > 0 then
    raise exception 'late-fee rate backfill: % installment(s) now owe more than before', v_moved;
  end if;

  select count(*) into v_over_waived
  from public.v_workbook_installment_balances
  where waiver_applied > raw_late_fee or final_late_fee < 0;

  if v_over_waived > 0 then
    raise exception 'late-fee rate backfill: % installment(s) over-waived', v_over_waived;
  end if;
end $$;

commit;
