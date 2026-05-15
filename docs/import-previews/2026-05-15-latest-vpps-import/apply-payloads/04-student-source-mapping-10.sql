-- vpps-latest-2026-05-15-fullbook: source mapping chunk 10
insert into private.vpps_student_source_mapping (
  source_student_uid, import_name, student_id, workbook_filename, matched_via, notes
) values
(
  'STU-0079',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2343'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=461; reviewStatus=ok'
),
(
  'STU-0080',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2135'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=462; reviewStatus=ok'
),
(
  'STU-0081',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2137'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=463; reviewStatus=ok'
),
(
  'STU-0082',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2381'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=464; reviewStatus=ok'
),
(
  'STU-0083',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2162'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=465; reviewStatus=ok'
),
(
  'STU-0087',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2389'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=466; reviewStatus=needs_review'
),
(
  'STU-0537',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2395'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=467; reviewStatus=needs_review'
)
on conflict (source_student_uid, import_name) do update
set student_id = excluded.student_id,
    matched_via = excluded.matched_via,
    notes = excluded.notes,
    updated_at = now();
