-- VPPS latest-Excel import (2026-05-15): private idempotent apply helper.
-- Used by the temporary `vpps-import-applier` Edge Function during the
-- 2026-05-15 mass import to upsert students, write source mappings, mark
-- left students, and stage payments/fee lines into
-- private.vpps_direct_import_stage_dues. Never writes to public.receipts or
-- public.payments. Restricted to service_role.

create or replace function private.vpps_apply_chunk(p_kind text, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_count integer := 0;
begin
  if p_kind = 'students' then
    with up as (
      insert into public.students (
        admission_no, full_name, date_of_birth, father_name, mother_name,
        primary_phone, secondary_phone, class_id, transport_route_id, notes
      )
      select
        r->>'admission_no',
        r->>'full_name',
        nullif(r->>'date_of_birth', '')::date,
        nullif(r->>'father_name', ''),
        nullif(r->>'mother_name', ''),
        nullif(r->>'primary_phone', ''),
        nullif(r->>'secondary_phone', ''),
        (r->>'class_id')::uuid,
        nullif(r->>'transport_route_id', '')::uuid,
        r->>'notes'
      from jsonb_array_elements(p_rows) as r
      on conflict (admission_no) do update
      set full_name = excluded.full_name,
          class_id = excluded.class_id,
          transport_route_id = coalesce(excluded.transport_route_id, public.students.transport_route_id),
          date_of_birth = coalesce(excluded.date_of_birth, public.students.date_of_birth),
          father_name = coalesce(nullif(excluded.father_name, ''), public.students.father_name),
          mother_name = coalesce(nullif(excluded.mother_name, ''), public.students.mother_name),
          primary_phone = coalesce(nullif(excluded.primary_phone, ''), public.students.primary_phone),
          secondary_phone = coalesce(nullif(excluded.secondary_phone, ''), public.students.secondary_phone),
          notes = excluded.notes,
          updated_at = now()
      returning admission_no
    )
    select count(*) into v_count from up;
  elsif p_kind = 'mapping' then
    with up as (
      insert into private.vpps_student_source_mapping (
        source_student_uid, import_name, student_id, workbook_filename, matched_via, notes
      )
      select
        r->>'source_student_uid',
        'vpps-latest-2026-05-15-fullbook',
        s.id,
        'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
        r->>'matched_via',
        'review_status=' || coalesce(r->>'review_status', 'ok')
      from jsonb_array_elements(p_rows) as r
      join public.students s on s.admission_no = (r->>'admission_no')
      on conflict (source_student_uid, import_name) do update
      set student_id = excluded.student_id,
          matched_via = excluded.matched_via,
          notes = excluded.notes,
          updated_at = now()
      returning source_student_uid
    )
    select count(*) into v_count from up;
  elsif p_kind = 'left' then
    update public.students s
    set status = 'left',
        notes = coalesce(s.notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || (r->>'reason'),
        updated_at = now()
    from jsonb_array_elements(p_rows) as r
    where s.status <> 'left'
      and (
        s.admission_no = nullif(r->>'admission_no', '')
        or s.id in (
          select student_id from private.vpps_student_source_mapping
          where source_student_uid = nullif(r->>'source_student_uid', '')
            and import_name = 'vpps-latest-2026-05-15-fullbook'
        )
      );
    get diagnostics v_count = row_count;
  elsif p_kind = 'stage_dues' then
    insert into private.vpps_direct_import_stage_dues (import_name, source_key, payload)
    select 'vpps-latest-2026-05-15-fullbook', r->>'source_key', r->'payload'
    from jsonb_array_elements(p_rows) as r
    on conflict (import_name, source_key) do update set payload = excluded.payload;
    get diagnostics v_count = row_count;
  else
    raise exception 'Unknown kind: %', p_kind;
  end if;
  return jsonb_build_object('kind', p_kind, 'rowsProcessed', jsonb_array_length(p_rows), 'applied', v_count);
end;
$$;

grant execute on function private.vpps_apply_chunk(text, jsonb) to service_role;
