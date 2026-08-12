-- preview_ and create_student_repayment_plan each validate the scope against a
-- hardcoded pair. Teach both the third value. Patched rather than restated:
-- create_ is ~200 lines and only this one list changes. Fails loudly if the
-- text ever moves.
do $$
declare
  v_fn text;
  v_src text;
  v_new text;
  v_old_list constant text := '(''old_balance_only'', ''old_and_current'')';
  v_new_list constant text := '(''old_balance_only'', ''current_year_only'', ''old_and_current'')';
begin
  foreach v_fn in array array[
    'public.preview_student_repayment_plan(uuid,text,text,integer,date)',
    'public.create_student_repayment_plan(uuid,text,text,integer,date,text,integer,uuid,uuid,date[])'
  ]
  loop
    select pg_get_functiondef(v_fn::regprocedure) into v_src;

    if position(v_new_list in v_src) > 0 then
      continue;  -- already patched; replay is a no-op
    end if;

    if position(v_old_list in v_src) = 0 then
      raise exception '% : scope validation list not found', v_fn;
    end if;

    v_new := replace(v_src, v_old_list, v_new_list);
    execute v_new;
  end loop;
end $$;

-- Prove it took, rather than trusting the replace.
do $$
begin
  if position('current_year_only' in
       pg_get_functiondef('public.create_student_repayment_plan(uuid,text,text,integer,date,text,integer,uuid,uuid,date[])'::regprocedure)) = 0
     or position('current_year_only' in
       pg_get_functiondef('public.preview_student_repayment_plan(uuid,text,text,integer,date)'::regprocedure)) = 0
  then
    raise exception 'scope patch did not apply to both functions';
  end if;
end $$;
