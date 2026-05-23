do $$
declare
  function_definition text;
begin
  select pg_get_functiondef('public.get_dashboard_summary(text,text)'::regprocedure)
  into function_definition;

  if function_definition is null then
    raise exception 'public.get_dashboard_summary(text,text) is missing';
  end if;

  function_definition := replace(
    function_definition,
    'v_students_missing_installments json;',
    'v_students_missing_installments jsonb;'
  );

  execute function_definition;
end;
$$;
