-- Materialize v_student_sibling_groups.
--
-- Why: the plain view re-normalizes every active student's phone numbers
-- (regex), groups them, and lateral-joins family groups ON EVERY QUERY.
-- Production pg_stat_statements: 1,161 calls averaging ~1.07s — it is queried
-- on every Students list load and every student profile. Sibling detection
-- changes only when student contact data or family membership changes, so a
-- materialized snapshot refreshed on those writes is the right shape.
--
-- Refresh wiring reuses the proven workbook pattern: statement triggers on the
-- source tables mark a queue row pending; the */2 cron drains it with a
-- CONCURRENT refresh (readers never block).

create materialized view if not exists public.mv_student_sibling_groups as
select
  group_key,
  session_label,
  student_ids,
  student_count,
  phone_match,
  father_name_match,
  confidence,
  existing_family_group_id
from public.v_student_sibling_groups;

-- Unique index is required for REFRESH ... CONCURRENTLY.
create unique index if not exists mv_student_sibling_groups_key_idx
  on public.mv_student_sibling_groups (session_label, group_key);

-- Callers filter with student_ids && array[...] (overlap) and session_label.
create index if not exists mv_student_sibling_groups_student_ids_idx
  on public.mv_student_sibling_groups using gin (student_ids);

grant select on public.mv_student_sibling_groups to authenticated, service_role;

-- The queue table was born as a workbook-only singleton; widen the check so it
-- can carry one row per refresh domain.
alter table public.workbook_materialized_view_refresh_queue
  drop constraint if exists workbook_materialized_view_refresh_queue_singleton;
alter table public.workbook_materialized_view_refresh_queue
  add constraint workbook_materialized_view_refresh_queue_singleton
  check (queue_key in ('workbook', 'sibling_groups'));

-- Queue row for the refresh backstop (same table the workbook views use).
insert into public.workbook_materialized_view_refresh_queue
  (queue_key, pending, requested_at, request_count)
values ('sibling_groups', false, now(), 0)
on conflict (queue_key) do nothing;

create or replace function public.queue_sibling_groups_refresh()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.workbook_materialized_view_refresh_queue
    (queue_key, pending, requested_at, request_count)
  values ('sibling_groups', true, now(), 1)
  on conflict (queue_key) do update
    set pending = true,
        requested_at = excluded.requested_at,
        request_count = public.workbook_materialized_view_refresh_queue.request_count + 1;

  return null;
end;
$$;

revoke all on function public.queue_sibling_groups_refresh() from public;

drop trigger if exists queue_sibling_refresh_on_students on public.students;
create trigger queue_sibling_refresh_on_students
  after insert or update or delete or truncate on public.students
  for each statement execute function public.queue_sibling_groups_refresh();

drop trigger if exists queue_sibling_refresh_on_family_groups on public.student_family_groups;
create trigger queue_sibling_refresh_on_family_groups
  after insert or update or delete or truncate on public.student_family_groups
  for each statement execute function public.queue_sibling_groups_refresh();

drop trigger if exists queue_sibling_refresh_on_family_members on public.student_family_members;
create trigger queue_sibling_refresh_on_family_members
  after insert or update or delete or truncate on public.student_family_members
  for each statement execute function public.queue_sibling_groups_refresh();

create or replace function public.refresh_sibling_groups_if_requested()
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
  where queue_key = 'sibling_groups'
    and pending = true
  for update skip locked;

  if v_requested_at is null then
    return false;
  end if;

  refresh materialized view concurrently public.mv_student_sibling_groups;

  update public.workbook_materialized_view_refresh_queue
  set pending = false,
      last_refreshed_at = now(),
      request_count = 0
  where queue_key = 'sibling_groups';

  return true;
end;
$$;

revoke all on function public.refresh_sibling_groups_if_requested() from public;
grant execute on function public.refresh_sibling_groups_if_requested() to service_role;

do $$
begin
  if exists (
    select 1
    from cron.job
    where jobname = 'refresh-sibling-groups-matview'
  ) then
    perform cron.unschedule('refresh-sibling-groups-matview');
  end if;
end;
$$;

select cron.schedule(
  'refresh-sibling-groups-matview',
  '*/2 * * * *',
  $$select public.refresh_sibling_groups_if_requested();$$
);
