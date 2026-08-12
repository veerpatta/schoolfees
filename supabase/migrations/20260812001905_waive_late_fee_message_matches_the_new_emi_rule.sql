-- The refusal message was written when converting to EMI forgave every late fee
-- permanently, so the only way to change the deal was to reschedule. Now a
-- missed EMI charges a flat Rs1,000 that an admin is expected to waive
-- routinely once the family pays. Rescheduling is the wrong instruction.
--
-- The guard itself is unchanged: an admin (fees:repayment_plan) waives freely;
-- the counter cannot, because altering an agreed plan is an admin decision.
do $$
declare
  v_src text;
  v_new text;
  v_old constant text :=
    'This student is on an EMI plan. Late fees cannot be waived at the counter — an admin must reschedule the plan.';
  v_new_msg constant text :=
    'This student is on an EMI plan. Only an admin can waive late fees for them.';
begin
  select pg_get_functiondef('public.waive_late_fee(uuid,integer,text,text,uuid,uuid)'::regprocedure)
    into v_src;

  if position(v_new_msg in v_src) > 0 then
    return;
  end if;

  if position(v_old in v_src) = 0 then
    raise exception 'waive_late_fee: refusal message anchor not found';
  end if;

  v_new := replace(v_src, v_old, v_new_msg);
  execute v_new;
end $$;
