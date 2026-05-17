with payload as (
  select jsonb_array_elements(:'p'::jsonb) as r
)
insert into private.vpps_student_source_mapping (
  source_student_uid, import_name, student_id, workbook_filename, matched_via, notes
)
select
  r->>'source_student_uid',
  'vpps-latest-2026-05-15-fullbook',
  s.id,
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  r->>'matched_via',
  'review_status=' || (r->>'review_status')
from payload p
join public.students s on s.admission_no = (r->>'admission_no')
on conflict (source_student_uid, import_name) do update
set student_id = excluded.student_id,
    matched_via = excluded.matched_via,
    notes = excluded.notes,
    updated_at = now();