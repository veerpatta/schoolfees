-- Undo five waivers that the previous migration should not have written.
--
-- 20260812130000 grandfathered every installment whose final_late_fee sat above
-- its 2026-08-08 position. 338 of those were rows it had just re-rated itself,
-- and waiving those is right: the school approved correcting the rate but not
-- back-charging families who were never told they owed anything.
--
-- 5 were not. Their rate was corrected from 0 to 1000 by someone else, some
-- time after the cut-over, and they have been charging a late fee ever since.
-- Waiving them reversed a live charge that nobody asked to reverse, and it
-- pulled the school's late-fee position from Rs 12,000 down to Rs 7,000 -- the
-- wrong direction, on a change whose whole purpose is to make the late fee
-- visible and correct.
--
-- The invariant that flagged them is over-broad rather than the data being
-- wrong. What 20260808140000 promised was that THE RULE CHANGE would not raise
-- anyone's bill. A rate corrected afterwards is a different event, and it is
-- allowed to raise a bill -- that is what correcting a rate means.
-- scripts/verify-late-fee-health.mjs is narrowed to match in the same commit.
--
-- The five waivers are voided, not deleted: student_late_fee_waivers is
-- append-only and the record of the mistake stays readable.

begin;

update public.student_late_fee_waivers
set voided_at   = now(),
    void_reason = 'Written in error by migration 20260812130000. This installment''s '
                  || 'late-fee rate was corrected after the 08-08-2026 rule change, and a '
                  || 'corrected rate is not a rule change -- the charge stands.'
where source = 'grandfather'
  and voided_at is null
  and reason like 'Grandfathered: this installment''s late fee rose above%';

refresh materialized view public.v_workbook_installment_balances;
refresh materialized view public.v_workbook_student_financials;
refresh materialized view public.v_student_financial_state;

do $$
declare
  v_voided int;
  v_late_fee int;
begin
  select count(*) into v_voided
  from public.student_late_fee_waivers
  where source = 'grandfather'
    and voided_at is not null
    and reason like 'Grandfathered: this installment''s late fee rose above%';

  if v_voided <> 5 then
    raise exception 'expected to void 5 waivers, voided %', v_voided;
  end if;

  select coalesce(sum(late_fee_pending), 0) into v_late_fee
  from public.v_workbook_installment_balances
  where session_label = '2026-27';

  if v_late_fee <> 12000 then
    raise exception '2026-27 late fee pending should be back at 12000, got %', v_late_fee;
  end if;
end $$;

commit;
