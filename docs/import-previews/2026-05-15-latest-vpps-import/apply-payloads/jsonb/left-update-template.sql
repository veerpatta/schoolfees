with payload as (
  select jsonb_array_elements(:'p'::jsonb) as r
)
update public.students s
set status = 'left',
    notes = coalesce(s.notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || (r->>'reason'),
    updated_at = now()
from payload
where s.status <> 'left'
  and (
    s.admission_no = nullif(r->>'admission_no', '')
    or s.id in (
      select student_id from private.vpps_student_source_mapping
      where source_student_uid = nullif(r->>'source_student_uid', '')
        and import_name = 'vpps-latest-2026-05-15-fullbook'
    )
  );