-- Make workbook financial projections session-scoped.
--
-- The working session selector can point to TEST-2026-27 while the live fee
-- policy remains 2026-27. Workbook views must therefore read the fee setup for
-- each student's own class session instead of filtering to the single
-- fee_policy_configs.is_active row.

do $$
declare
  function_sql text;
begin
  select pg_get_functiondef(
    'private.workbook_installment_snapshot(uuid,date,boolean)'::regprocedure
  )
  into function_sql;

  function_sql := replace(
    function_sql,
    $old$
  with active_policy as (
    select academic_session_label
    from public.fee_policy_configs
    where is_active = true
      and calculation_model = 'workbook_v1'
    order by updated_at desc
    limit 1
  ),
$old$,
    $new$
  with session_policy as (
    select distinct on (academic_session_label)
      academic_session_label
    from public.fee_policy_configs
    where calculation_model = 'workbook_v1'
    order by academic_session_label, updated_at desc
  ),
$new$
  );
  function_sql := replace(
    function_sql,
    'join active_policy as policy_row',
    'join session_policy as policy_row'
  );

  if function_sql like '%join active_policy as policy_row%' then
    raise exception 'Unable to update private.workbook_installment_snapshot policy scope.';
  end if;

  execute function_sql;
end $$;

do $$
declare
  view_sql text;
begin
  select pg_get_viewdef('public.v_workbook_student_financials'::regclass, true)
  into view_sql;

  view_sql := replace(
    view_sql,
    $old$ WITH active_policy AS (
         SELECT fee_policy_configs.academic_session_label,
            fee_policy_configs.installment_schedule,
            fee_policy_configs.new_student_academic_fee_amount,
            fee_policy_configs.old_student_academic_fee_amount
           FROM fee_policy_configs
          WHERE fee_policy_configs.is_active = true AND fee_policy_configs.calculation_model = 'workbook_v1'::text
          ORDER BY fee_policy_configs.updated_at DESC
         LIMIT 1
        ),$old$,
    $new$ WITH session_policy AS (
         SELECT DISTINCT ON (fee_policy_configs.academic_session_label) fee_policy_configs.academic_session_label,
            fee_policy_configs.installment_schedule,
            fee_policy_configs.new_student_academic_fee_amount,
            fee_policy_configs.old_student_academic_fee_amount
           FROM fee_policy_configs
          WHERE fee_policy_configs.calculation_model = 'workbook_v1'::text
          ORDER BY fee_policy_configs.academic_session_label, fee_policy_configs.updated_at DESC
        ),$new$
  );

  if view_sql like '%WITH active_policy AS%' then
    raise exception 'Unable to update public.v_workbook_student_financials policy scope.';
  end if;

  view_sql := replace(view_sql, 'active_policy.', 'session_policy.');
  view_sql := replace(view_sql, 'JOIN active_policy', 'JOIN session_policy');

  execute 'create or replace view public.v_workbook_student_financials with (security_invoker = true) as '
    || view_sql;
end $$;

do $$
declare
  function_sql text;
begin
  select pg_get_functiondef(
    'public.post_student_payment(uuid,date,public.payment_mode,integer,text,text,text,text,uuid)'::regprocedure
  )
  into function_sql;

  function_sql := replace(
    function_sql,
    'where fpc.is_active = true',
    'where fpc.academic_session_label = v_student_session_label'
  );
  function_sql := replace(
    function_sql,
    E'v_use_workbook_mode :=\n\t\tv_active_policy_model = ''workbook_v1''\n\t\tand v_student_session_label = v_active_policy_session;',
    E'v_use_workbook_mode := v_active_policy_model = ''workbook_v1'';'
  );
  function_sql := replace(
    function_sql,
    E'use_workbook_mode :=\n    active_policy_model = ''workbook_v1''\n    and student_session_label = active_policy_session;',
    E'use_workbook_mode := active_policy_model = ''workbook_v1'';'
  );
  if function_sql like '%where fpc.is_active = true%' then
    raise exception 'Unable to update public.post_student_payment policy scope.';
  end if;

  execute function_sql;
end $$;
