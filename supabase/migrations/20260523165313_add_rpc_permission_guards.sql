do $$
declare
  function_definition text;
begin
  select pg_get_functiondef('public.get_dashboard_summary(text,text)'::regprocedure)
  into function_definition;

  if function_definition is null then
    raise exception 'public.get_dashboard_summary(text,text) is missing';
  end if;

  if function_definition not like '%public.has_permission(''dashboard:view'')%' then
    function_definition := replace(
      function_definition,
      E'begin\n  -- A. KPI Calculations',
      E'begin\n  if not public.has_permission(''dashboard:view'') then\n    raise exception ''You do not have permission to view dashboard summary.'';\n  end if;\n\n  -- A. KPI Calculations'
    );

    execute function_definition;
  end if;
end;
$$;

create or replace function public.preview_workbook_payment_allocation(
  p_student_id uuid,
  p_payment_date date
)
returns table (
  installment_id uuid,
  student_id uuid,
  admission_no text,
  student_name text,
  father_name text,
  father_phone text,
  session_label text,
  class_id uuid,
  class_name text,
  class_label text,
  section text,
  stream_name text,
  installment_no smallint,
  installment_label text,
  due_date date,
  base_charge integer,
  paid_amount integer,
  adjustment_amount integer,
  applied_amount integer,
  raw_late_fee integer,
  waiver_applied integer,
  final_late_fee integer,
  total_charge integer,
  pending_amount integer,
  balance_status text,
  last_payment_date date,
  transport_route_id uuid,
  transport_route_name text,
  transport_route_code text
)
language sql
stable
security definer
set search_path = public, private, pg_temp
as $function$
  select *
  from private.workbook_installment_snapshot(p_student_id, p_payment_date, true)
  where public.has_any_permission(array[
    'payments:view',
    'payments:write',
    'ledger:view',
    'receipts:view',
    'dashboard:view',
    'finance:view'
  ])
  and pending_amount > 0
  order by due_date asc, installment_no asc;
$function$;

revoke all on function public.preview_workbook_payment_allocation(uuid, date) from public;
revoke execute on function public.preview_workbook_payment_allocation(uuid, date) from anon;
grant execute on function public.preview_workbook_payment_allocation(uuid, date) to authenticated;
grant execute on function public.preview_workbook_payment_allocation(uuid, date) to service_role;
