-- Per-session recovery state for the Defaulters recovery desk.
--
-- Contact attempts remain append-only in defaulter_contacts. This table stores
-- only the current operational state derived from those attempts and payments:
-- recovery stage, latest resolved promise outcome, and promise reliability
-- counters for future scoring.

create table if not exists public.defaulter_recovery_state (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  session_label text not null,
  family_group_id uuid references public.student_family_groups(id) on delete set null,
  recovery_stage text not null default 'standard'
    check (recovery_stage in ('standard', 'watch', 'promise_due', 'escalated', 'no_call')),
  promise_resolved_outcome text
    check (promise_resolved_outcome in ('kept', 'broken')),
  promise_resolved_at timestamptz,
  last_resolved_contact_id uuid references public.defaulter_contacts(id) on delete set null,
  promise_kept_count integer not null default 0 check (promise_kept_count >= 0),
  promise_broken_count integer not null default 0 check (promise_broken_count >= 0),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, session_label)
);

comment on table public.defaulter_recovery_state is
  'Current per-student/session recovery state for the Defaulters desk. '
  'Append-only contact attempts stay in defaulter_contacts.';

comment on column public.defaulter_recovery_state.promise_kept_count is
  'Count of promises resolved as kept for this student/session. Used for '
  'promise reliability scoring.';

comment on column public.defaulter_recovery_state.promise_broken_count is
  'Count of promises resolved as broken for this student/session. Used for '
  'promise reliability scoring.';

comment on column public.defaulter_recovery_state.last_resolved_contact_id is
  'The promised_pay contact already counted into promise reliability. Prevents '
  'the refresh function from incrementing counters more than once.';

create index if not exists defaulter_recovery_state_session_stage_idx
  on public.defaulter_recovery_state (session_label, recovery_stage);

create index if not exists defaulter_recovery_state_family_idx
  on public.defaulter_recovery_state (family_group_id, session_label)
  where family_group_id is not null;

create index if not exists defaulter_recovery_state_last_contact_idx
  on public.defaulter_recovery_state (last_resolved_contact_id)
  where last_resolved_contact_id is not null;

create or replace function public.refresh_defaulter_recovery_state(
  p_session_label text,
  p_today date default current_date
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows integer := 0;
begin
  if not public.has_permission('defaulters:view') then
    raise exception 'Unauthorized recovery state refresh.' using errcode = '28000';
  end if;

  with latest_promises as (
    select distinct on (dc.student_id)
      dc.id as contact_id,
      dc.student_id,
      dc.session_label,
      dc.contacted_at,
      dc.snooze_until,
      (
        select sfm.family_group_id
        from public.student_family_members sfm
        where sfm.student_id = dc.student_id
          and sfm.academic_session_label = dc.session_label
        order by sfm.created_at desc
        limit 1
      ) as family_group_id,
      exists (
        select 1
        from public.receipts r
        join public.payments p
          on p.receipt_id = r.id
          and p.student_id = r.student_id
        join public.installments i
          on i.id = p.installment_id
          and i.student_id = p.student_id
        join public.classes
          on classes.id = i.class_id
          and classes.session_label = dc.session_label
        where r.student_id = dc.student_id
          and r.payment_date >= dc.contacted_at::date
      ) as paid_since_promise
    from public.defaulter_contacts dc
    where dc.session_label = p_session_label
      and dc.outcome = 'promised_pay'
      and dc.snooze_until is not null
      and (
        dc.snooze_until <= p_today
        or exists (
          select 1
          from public.receipts r
          join public.payments p
            on p.receipt_id = r.id
            and p.student_id = r.student_id
          join public.installments i
            on i.id = p.installment_id
            and i.student_id = p.student_id
          join public.classes
            on classes.id = i.class_id
            and classes.session_label = dc.session_label
          where r.student_id = dc.student_id
            and r.payment_date >= dc.contacted_at::date
        )
      )
    order by dc.student_id, dc.contacted_at desc, dc.id desc
  ),
  resolved as (
    select
      contact_id,
      student_id,
      session_label,
      family_group_id,
      case
        when paid_since_promise then 'kept'
        when snooze_until < p_today then 'broken'
        else null
      end as outcome
    from latest_promises
  ),
  upserted as (
    insert into public.defaulter_recovery_state (
      student_id,
      session_label,
      family_group_id,
      recovery_stage,
      promise_resolved_outcome,
      promise_resolved_at,
      last_resolved_contact_id,
      promise_kept_count,
      promise_broken_count
    )
    select
      resolved.student_id,
      resolved.session_label,
      resolved.family_group_id,
      case when resolved.outcome = 'broken' then 'promise_due' else 'standard' end,
      resolved.outcome,
      now(),
      resolved.contact_id,
      case when resolved.outcome = 'kept' then 1 else 0 end,
      case when resolved.outcome = 'broken' then 1 else 0 end
    from resolved
    where resolved.outcome is not null
    on conflict (student_id, session_label) do update
    set
      family_group_id = coalesce(excluded.family_group_id, defaulter_recovery_state.family_group_id),
      recovery_stage = excluded.recovery_stage,
      promise_resolved_outcome = excluded.promise_resolved_outcome,
      promise_resolved_at = case
        when defaulter_recovery_state.last_resolved_contact_id is distinct from excluded.last_resolved_contact_id
          then excluded.promise_resolved_at
        else defaulter_recovery_state.promise_resolved_at
      end,
      last_resolved_contact_id = excluded.last_resolved_contact_id,
      promise_kept_count = defaulter_recovery_state.promise_kept_count + case
        when defaulter_recovery_state.last_resolved_contact_id is distinct from excluded.last_resolved_contact_id
          and excluded.promise_resolved_outcome = 'kept'
          then 1
        else 0
      end,
      promise_broken_count = defaulter_recovery_state.promise_broken_count + case
        when defaulter_recovery_state.last_resolved_contact_id is distinct from excluded.last_resolved_contact_id
          and excluded.promise_resolved_outcome = 'broken'
          then 1
        else 0
      end
    returning 1
  )
  select count(*) into v_rows from upserted;

  return v_rows;
end;
$$;

comment on function public.refresh_defaulter_recovery_state(text, date) is
  'Resolves latest promised_pay contacts to kept/broken using receipts, then '
  'updates defaulter_recovery_state idempotently. Does not mutate '
  'defaulter_contacts.';

grant execute on function public.refresh_defaulter_recovery_state(text, date) to authenticated;

drop trigger if exists set_updated_at_on_defaulter_recovery_state
  on public.defaulter_recovery_state;
create trigger set_updated_at_on_defaulter_recovery_state
before update on public.defaulter_recovery_state
for each row execute function private.set_updated_at();

drop trigger if exists set_actor_columns_on_defaulter_recovery_state
  on public.defaulter_recovery_state;
create trigger set_actor_columns_on_defaulter_recovery_state
before insert or update on public.defaulter_recovery_state
for each row execute function private.set_actor_columns();

drop trigger if exists audit_defaulter_recovery_state
  on public.defaulter_recovery_state;
create trigger audit_defaulter_recovery_state
after insert or update or delete on public.defaulter_recovery_state
for each row execute function private.capture_audit_event();

alter table public.defaulter_recovery_state enable row level security;

drop policy if exists "staff can read recovery state" on public.defaulter_recovery_state;
create policy "staff can read recovery state"
on public.defaulter_recovery_state for select
to authenticated
using (public.has_permission('defaulters:view'));

drop policy if exists "staff can upsert recovery state" on public.defaulter_recovery_state;
create policy "staff can upsert recovery state"
on public.defaulter_recovery_state for insert
to authenticated
with check (public.has_permission('defaulters:view'));

drop policy if exists "staff can update recovery state" on public.defaulter_recovery_state;
create policy "staff can update recovery state"
on public.defaulter_recovery_state for update
to authenticated
using (public.has_permission('defaulters:view'))
with check (public.has_permission('defaulters:view'));
