-- vpps-latest-2026-05-15-fullbook: source mapping chunk 5
insert into private.vpps_student_source_mapping (
  source_student_uid, import_name, student_id, workbook_filename, matched_via, notes
) values
(
  'STU-0274',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '275/15RTE'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=206; reviewStatus=ok'
),
(
  'STU-0276',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2474'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=207; reviewStatus=ok'
),
(
  'STU-0277',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '343'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=208; reviewStatus=ok'
),
(
  'STU-0278',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '274'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=209; reviewStatus=ok'
),
(
  'STU-0279',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '602'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=210; reviewStatus=ok'
),
(
  'STU-0280',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '615'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=211; reviewStatus=ok'
),
(
  'STU-0281',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2605'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=212; reviewStatus=ok'
),
(
  'STU-0282',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2502'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=213; reviewStatus=ok'
),
(
  'STU-0284',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '501'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=214; reviewStatus=ok'
),
(
  'STU-0285',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2504'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=215; reviewStatus=ok'
),
(
  'STU-0287',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2505'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=216; reviewStatus=ok'
),
(
  'STU-0288',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '570'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=217; reviewStatus=ok'
),
(
  'STU-0289',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '279/16RTE'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=218; reviewStatus=ok'
),
(
  'STU-0290',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '414'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=219; reviewStatus=ok'
),
(
  'STU-0291',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '610'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=220; reviewStatus=ok'
),
(
  'STU-0292',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '280'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=221; reviewStatus=ok'
),
(
  'STU-0293',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '432'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=222; reviewStatus=ok'
),
(
  'STU-0294',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '558'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=223; reviewStatus=ok'
),
(
  'STU-0295',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2510'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=224; reviewStatus=ok'
),
(
  'STU-0296',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '502'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=225; reviewStatus=ok'
),
(
  'STU-0297',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '272'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=226; reviewStatus=ok'
),
(
  'STU-0298',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '416'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=227; reviewStatus=ok'
),
(
  'STU-0299',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '654653'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=228; reviewStatus=ok'
),
(
  'STU-0300',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '431'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=229; reviewStatus=ok'
),
(
  'STU-0301',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '600'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=230; reviewStatus=ok'
),
(
  'STU-0302',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '607'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=231; reviewStatus=ok'
),
(
  'STU-0303',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '215462'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=232; reviewStatus=ok'
),
(
  'STU-0304',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = 'VPPS-STU0304'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=233; reviewStatus=needs_review'
),
(
  'STU-0305',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '320/21RTE'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=234; reviewStatus=ok'
),
(
  'STU-0306',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '286/17RTE'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=235; reviewStatus=ok'
),
(
  'STU-0307',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2582'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=236; reviewStatus=ok'
),
(
  'STU-0308',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '526'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=237; reviewStatus=ok'
),
(
  'STU-0309',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2604'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=238; reviewStatus=ok'
),
(
  'STU-0310',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '553'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=239; reviewStatus=ok'
),
(
  'STU-0311',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '276'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=240; reviewStatus=ok'
),
(
  'STU-0313',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2522'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=242; reviewStatus=ok'
),
(
  'STU-0315',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2523'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=243; reviewStatus=ok'
),
(
  'STU-0317',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2524'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=244; reviewStatus=ok'
),
(
  'STU-0318',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2525'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=245; reviewStatus=ok'
),
(
  'STU-0319',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2569'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=246; reviewStatus=ok'
),
(
  'STU-0320',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '24RTE/359'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=247; reviewStatus=ok'
),
(
  'STU-0321',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '632'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=248; reviewStatus=ok'
),
(
  'STU-0322',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2527'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=249; reviewStatus=ok'
),
(
  'STU-0323',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '586'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=250; reviewStatus=ok'
),
(
  'STU-0324',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2529'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=251; reviewStatus=ok'
),
(
  'STU-0325',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2547'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=252; reviewStatus=ok'
),
(
  'STU-0326',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '458'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=254; reviewStatus=ok'
),
(
  'STU-0327',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '837'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=255; reviewStatus=ok'
),
(
  'STU-0328',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '847'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=256; reviewStatus=ok'
),
(
  'STU-0330',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2533'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=257; reviewStatus=ok'
)
on conflict (source_student_uid, import_name) do update
set student_id = excluded.student_id,
    matched_via = excluded.matched_via,
    notes = excluded.notes,
    updated_at = now();
