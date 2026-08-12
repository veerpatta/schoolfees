-- `installments.amount_due` is a GENERATED column
-- (base_amount + transport_amount - discount_amount); it cannot be assigned.
-- With all three components 0 it generates 0 anyway, which is what the backing
-- row needs.
do $$
declare
  v_src text;
  v_new text;
begin
  select pg_get_functiondef('public.sync_repayment_plan_late_fees(text,boolean,date)'::regprocedure)
    into v_src;

  if position('discount_amount, amount_due,' in v_src) = 0 then
    return;  -- already fixed
  end if;

  v_new := replace(
    v_src,
    'due_date, base_amount, transport_amount, discount_amount, amount_due,',
    'due_date, base_amount, transport_amount, discount_amount,'
  );
  v_new := replace(
    v_new,
    E'        v_emi.due_date, 0, 0, 0, 0,\n',
    E'        v_emi.due_date, 0, 0, 0,\n'
  );

  if v_new = v_src then
    raise exception 'amount_due fix: anchors not found';
  end if;

  execute v_new;
end $$;

do $$
begin
  if position('amount_due' in pg_get_functiondef(
       'public.sync_repayment_plan_late_fees(text,boolean,date)'::regprocedure)) > 0
  then
    raise exception 'amount_due still assigned in the insert';
  end if;
end $$;
