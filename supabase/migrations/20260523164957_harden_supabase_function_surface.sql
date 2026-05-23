do $$
declare
  fn record;
  direct_staff_rpcs constant text[] := array[
    'active_session_label',
    'get_dashboard_summary',
    'import_student_batch_row',
    'post_student_payment',
    'post_student_payment_with_adjustments',
    'preview_workbook_payment_allocation',
    'realign_recent_import_students_to_active_session'
  ];
  backend_only_functions constant text[] := array[
    'queue_workbook_materialized_view_refresh',
    'refresh_financial_materialized_views',
    'refresh_workbook_materialized_views_if_requested',
    'rls_auto_enable',
    'trigger_refresh_financial_views',
    'vpps_apply_chunk_proxy'
  ];
  private_backend_functions constant text[] := array[
    'capture_audit_event',
    'current_staff_role',
    'enforce_max_active_conventional_discounts',
    'enforce_max_active_conventional_discounts_in_schema',
    'normalize_staff_role',
    'normalize_workbook_class_label',
    'prevent_append_only_mutation',
    'prevent_receipt_adjustment_mutation',
    'set_actor_columns',
    'set_created_by_column',
    'set_updated_at',
    'sync_staff_profile_from_auth_user',
    'vpps_apply_chunk',
    'workbook_installment_snapshot'
  ];
begin
  for fn in
    select
      n.nspname as schema_name,
      p.proname as function_name,
      pg_get_function_identity_arguments(p.oid) as identity_args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where (
      n.nspname = 'public'
      and (p.proname = any(direct_staff_rpcs) or p.proname = any(backend_only_functions))
    )
    or (
      n.nspname = 'private'
      and p.proname = any(private_backend_functions)
    )
  loop
    execute format(
      'alter function %I.%I(%s) set search_path = %s',
      fn.schema_name,
      fn.function_name,
      fn.identity_args,
      case
        when fn.schema_name = 'private' then 'private, public, pg_temp'
        else 'public, private, pg_temp'
      end
    );

    execute format('revoke all on function %I.%I(%s) from public', fn.schema_name, fn.function_name, fn.identity_args);
    execute format('revoke execute on function %I.%I(%s) from anon', fn.schema_name, fn.function_name, fn.identity_args);
    execute format('revoke execute on function %I.%I(%s) from authenticated', fn.schema_name, fn.function_name, fn.identity_args);

    if fn.schema_name = 'public' and fn.function_name = any(direct_staff_rpcs) then
      execute format('grant execute on function %I.%I(%s) to authenticated', fn.schema_name, fn.function_name, fn.identity_args);
      execute format('grant execute on function %I.%I(%s) to service_role', fn.schema_name, fn.function_name, fn.identity_args);
    elsif fn.schema_name = 'public' and fn.function_name = any(backend_only_functions) then
      execute format('grant execute on function %I.%I(%s) to service_role', fn.schema_name, fn.function_name, fn.identity_args);
    elsif fn.schema_name = 'private' then
      execute format('grant execute on function %I.%I(%s) to service_role', fn.schema_name, fn.function_name, fn.identity_args);
    end if;
  end loop;
end;
$$;

alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;
alter default privileges in schema public revoke execute on functions from authenticated;

alter default privileges in schema private revoke execute on functions from public;
alter default privileges in schema private revoke execute on functions from anon;
alter default privileges in schema private revoke execute on functions from authenticated;
