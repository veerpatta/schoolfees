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
from jsonb_array_elements('[{"source_student_uid":"STU-0079","admission_no":"2343","matched_via":"admission_no","review_status":"ok"},{"source_student_uid":"STU-0080","admission_no":"2135","matched_via":"admission_no","review_status":"ok"},{"source_student_uid":"STU-0081","admission_no":"2137","matched_via":"admission_no","review_status":"ok"},{"source_student_uid":"STU-0082","admission_no":"2381","matched_via":"admission_no","review_status":"ok"},{"source_student_uid":"STU-0083","admission_no":"2162","matched_via":"admission_no","review_status":"ok"},{"source_student_uid":"STU-0087","admission_no":"2389","matched_via":"admission_no","review_status":"needs_review"},{"source_student_uid":"STU-0537","admission_no":"2395","matched_via":"created_new","review_status":"needs_review"}]'::jsonb) as r
join public.students s on s.admission_no = (r->>'admission_no')
on conflict (source_student_uid, import_name) do update
set student_id = excluded.student_id,
    matched_via = excluded.matched_via,
    notes = excluded.notes,
    updated_at = now();