-- Restrict the Notion projection surface to its dedicated sync role and the
-- service role. SECURITY INVOKER makes all five projections honor the caller's
-- grants and RLS policies instead of silently using the postgres view owner.
revoke all on
  public.v_notion_student_fee_summary,
  public.v_notion_daily_collection_summary,
  public.v_notion_family_fee_summary,
  public.v_notion_student_fee_sync,
  public.v_notion_daily_summary
from public, anon, authenticated;

alter view public.v_notion_student_fee_summary set (security_invoker = true);
alter view public.v_notion_daily_collection_summary set (security_invoker = true);
alter view public.v_notion_family_fee_summary set (security_invoker = true);
alter view public.v_notion_student_fee_sync set (security_invoker = true);
alter view public.v_notion_daily_summary set (security_invoker = true);

grant usage on schema public to notion_fee_sync_role;
grant select on
  public.v_notion_student_fee_summary,
  public.v_notion_daily_collection_summary,
  public.v_notion_family_fee_summary,
  public.v_notion_student_fee_sync,
  public.v_notion_daily_summary
to notion_fee_sync_role, service_role;

-- Direct and transitive dependencies of the security-invoker projections.
-- This is intentionally SELECT-only. The role cannot write school records.
grant select on
  public.classes,
  public.fee_policy_configs,
  public.fee_settings,
  public.installments,
  public.payment_adjustments,
  public.payments,
  public.receipts,
  public.school_fee_defaults,
  public.student_family_groups,
  public.student_family_members,
  public.student_fee_overrides,
  public.students,
  public.transport_routes,
  public.v_installment_balances,
  public.v_workbook_installment_balances,
  public.v_workbook_student_financials
to notion_fee_sync_role;

do $$
declare
  relation_name text;
begin
  foreach relation_name in array array[
    'classes',
    'fee_policy_configs',
    'fee_settings',
    'installments',
    'payment_adjustments',
    'payments',
    'receipts',
    'school_fee_defaults',
    'student_family_groups',
    'student_family_members',
    'student_fee_overrides',
    'students',
    'transport_routes'
  ]
  loop
    execute format(
      'drop policy if exists %I on public.%I',
      'notion sync can read ' || relation_name,
      relation_name
    );
    execute format(
      'create policy %I on public.%I for select to notion_fee_sync_role using (true)',
      'notion sync can read ' || relation_name,
      relation_name
    );
  end loop;
end;
$$;

-- Receipt adjustments are append-only financial evidence. Only staff who can
-- post payments may create them; existing SELECT behavior remains unchanged.
drop policy if exists "authenticated can insert receipt finance adjustments"
  on public.receipt_finance_adjustments;
create policy "payment writers can insert receipt finance adjustments"
on public.receipt_finance_adjustments
for insert
to authenticated
with check ((select public.has_permission('payments:write')));

-- The refresh RPC already performs an internal defaulters:view check. Remove
-- the implicit PUBLIC/anon execution grant while retaining guarded staff use.
revoke all on function public.refresh_defaulter_recovery_state(text, date) from public;
revoke execute on function public.refresh_defaulter_recovery_state(text, date) from anon;
grant execute on function public.refresh_defaulter_recovery_state(text, date)
  to authenticated, service_role;

-- Pin function lookup paths so object resolution cannot be changed by callers.
alter function public.get_dashboard_summary(text, text)
  set search_path = public, private, pg_temp;
alter function public.refresh_financial_materialized_views(boolean)
  set search_path = public, private, pg_temp;
alter function public.trigger_refresh_financial_views()
  set search_path = public, private, pg_temp;
alter function private.enforce_third_child_traceability()
  set search_path = public, private, pg_temp;
alter function private.derive_family_child_client_request_id(text, uuid)
  set search_path = public, private, pg_temp;
alter function private.prevent_notion_sync_log_mutation()
  set search_path = public, private, pg_temp;

comment on table public.workbook_materialized_view_refresh_queue is
  'Service-only internal refresh queue. RLS intentionally has no client policies.';
comment on materialized view public.mv_student_sibling_groups is
  'Read optimization for authenticated sibling workflows; never a write source of truth.';
comment on materialized view public.v_workbook_installment_balances is
  'Read model for authenticated fee workflows; source mutations remain RLS guarded and append-only.';
comment on materialized view public.v_workbook_student_financials is
  'Read model for authenticated fee workflows; source mutations remain RLS guarded and append-only.';
