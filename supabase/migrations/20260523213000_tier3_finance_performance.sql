-- Tier 3 finance performance:
-- - keep workbook materialized views indexed for the highest-traffic filters
-- - queue refresh requests from write triggers instead of refreshing inside user transactions
-- - let pg_cron perform concurrent refreshes outside the write path

create schema if not exists extensions;
create extension if not exists pg_cron with schema extensions;

create index if not exists idx_v_workbook_financials_session_status
  on public.v_workbook_student_financials (session_label, record_status);

create index if not exists idx_v_workbook_installments_session
  on public.v_workbook_installment_balances (session_label);

create table if not exists public.workbook_materialized_view_refresh_queue (
  queue_key text primary key default 'workbook',
  pending boolean not null default true,
  requested_at timestamptz not null default now(),
  request_count bigint not null default 1,
  last_refreshed_at timestamptz,
  constraint workbook_materialized_view_refresh_queue_singleton
    check (queue_key = 'workbook')
);

alter table public.workbook_materialized_view_refresh_queue enable row level security;
revoke all on public.workbook_materialized_view_refresh_queue from anon, authenticated;
grant select, insert, update, delete on public.workbook_materialized_view_refresh_queue to service_role;

create or replace function public.queue_workbook_materialized_view_refresh()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.workbook_materialized_view_refresh_queue (queue_key, requested_at, request_count)
  values ('workbook', now(), 1)
  on conflict (queue_key) do update
    set pending = true,
        requested_at = excluded.requested_at,
        request_count = public.workbook_materialized_view_refresh_queue.request_count + 1;

  perform pg_notify(
    'workbook_refresh',
    json_build_object('requested_at', now())::text
  );
end;
$$;

revoke all on function public.queue_workbook_materialized_view_refresh() from public;
grant execute on function public.queue_workbook_materialized_view_refresh() to service_role;

-- Existing source-table triggers call this function. Keep the trigger contract,
-- but make the trigger do only a cheap queue write instead of a materialized-view refresh.
create or replace function public.trigger_refresh_financial_views()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.queue_workbook_materialized_view_refresh();
  return null;
end;
$$;

revoke all on function public.trigger_refresh_financial_views() from public;

create or replace function public.refresh_workbook_materialized_views_if_requested()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requested_at timestamptz;
begin
  select requested_at
    into v_requested_at
  from public.workbook_materialized_view_refresh_queue
  where queue_key = 'workbook'
    and pending = true
  for update skip locked;

  if v_requested_at is null then
    return false;
  end if;

  perform public.refresh_financial_materialized_views(true);

  update public.workbook_materialized_view_refresh_queue
  set pending = false,
      last_refreshed_at = now(),
      request_count = 0
  where queue_key = 'workbook';

  return true;
end;
$$;

revoke all on function public.refresh_workbook_materialized_views_if_requested() from public;
grant execute on function public.refresh_workbook_materialized_views_if_requested() to service_role;

do $$
begin
  if exists (
    select 1
    from cron.job
    where jobname = 'refresh-workbook-materialized-views'
  ) then
    perform cron.unschedule('refresh-workbook-materialized-views');
  end if;
end;
$$;

select cron.schedule(
  'refresh-workbook-materialized-views',
  '*/2 * * * *',
  $$select public.refresh_workbook_materialized_views_if_requested();$$
);

notify pgrst, 'reload schema';
