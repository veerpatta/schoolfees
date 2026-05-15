create table if not exists public.student_session_reanchor_log (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete restrict,
  from_session text not null,
  to_session text not null,
  batch_id uuid references public.import_batches(id) on delete set null,
  run_by uuid references auth.users(id) on delete set null,
  run_at timestamptz not null default now()
);

create index if not exists idx_student_session_reanchor_log_student
on public.student_session_reanchor_log (student_id, run_at desc);

create index if not exists idx_student_session_reanchor_log_batch
on public.student_session_reanchor_log (batch_id, run_at desc)
where batch_id is not null;

alter table public.student_session_reanchor_log enable row level security;

drop policy if exists "staff can read student session reanchor log" on public.student_session_reanchor_log;
create policy "staff can read student session reanchor log"
on public.student_session_reanchor_log for select
to authenticated
using (public.has_any_permission(array['students:view', 'fees:view', 'finance:view']));

drop policy if exists "staff can insert student session reanchor log" on public.student_session_reanchor_log;
create policy "staff can insert student session reanchor log"
on public.student_session_reanchor_log for insert
to authenticated
with check (public.has_permission('fees:write'));

create or replace function public.realign_recent_import_students_to_active_session(
  p_run_by uuid default null
)
returns table (
  moved_count integer,
  attention_count integer,
  moved_student_ids uuid[]
)
language plpgsql
security invoker
set search_path = public, private
as $$
declare
  v_active_session text;
begin
  if not public.has_permission('fees:write') then
    raise exception 'Missing permission: fees:write';
  end if;

  select academic_session_label
  into v_active_session
  from public.fee_policy_configs
  where is_active = true
  order by updated_at desc
  limit 1;

  if coalesce(trim(v_active_session), '') = '' then
    raise exception 'Active Fee Setup session is not configured.';
  end if;

  return query
  with recent_batches as (
    select id, target_session_label, created_at
    from public.import_batches
    where created_at > now() - interval '7 days'
      and coalesce(trim(target_session_label), '') <> ''
      and trim(target_session_label) <> trim(v_active_session)
  ),
  affected as (
    select distinct on (coalesce(ir.imported_student_id, ir.target_student_id))
      coalesce(ir.imported_student_id, ir.target_student_id) as student_id,
      rb.id as batch_id,
      c.session_label as from_session,
      c.id as from_class_id,
      c.class_name,
      c.stream_name
    from public.import_rows ir
    join recent_batches rb on rb.id = ir.batch_id
    join public.students s on s.id = coalesce(ir.imported_student_id, ir.target_student_id)
    join public.classes c on c.id = s.class_id
    where coalesce(ir.imported_student_id, ir.target_student_id) is not null
    order by coalesce(ir.imported_student_id, ir.target_student_id), rb.created_at desc
  ),
  matched as (
    select
      a.student_id,
      a.batch_id,
      a.from_session,
      a.from_class_id,
      active_class.id as to_class_id
    from affected a
    left join public.classes active_class
      on active_class.session_label = v_active_session
      and active_class.status = 'active'
      and private.normalize_workbook_class_label(active_class.class_name, active_class.stream_name)
        = private.normalize_workbook_class_label(a.class_name, a.stream_name)
  ),
  moved_source as (
    select *
    from matched
    where to_class_id is not null
      and from_class_id <> to_class_id
  ),
  updated_students as (
    update public.students s
    set class_id = ms.to_class_id,
        updated_by = p_run_by,
        updated_at = now()
    from moved_source ms
    where s.id = ms.student_id
    returning s.id, ms.from_session, ms.batch_id
  ),
  audit_rows as (
    insert into public.student_session_reanchor_log (
      student_id,
      from_session,
      to_session,
      batch_id,
      run_by
    )
    select
      us.id,
      us.from_session,
      v_active_session,
      us.batch_id,
      p_run_by
    from updated_students us
    returning student_id
  )
  select
    coalesce((select count(*)::integer from audit_rows), 0) as moved_count,
    coalesce((
      select count(*)::integer
      from matched
      where to_class_id is null
    ), 0) as attention_count,
    coalesce((select array_agg(student_id) from audit_rows), array[]::uuid[]) as moved_student_ids;
end;
$$;

grant execute on function public.realign_recent_import_students_to_active_session(uuid) to authenticated;
