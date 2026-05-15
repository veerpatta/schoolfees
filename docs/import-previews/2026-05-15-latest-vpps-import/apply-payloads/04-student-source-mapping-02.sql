-- vpps-latest-2026-05-15-fullbook: source mapping chunk 2
insert into private.vpps_student_source_mapping (
  source_student_uid, import_name, student_id, workbook_filename, matched_via, notes
) values
(
  'STU-0518',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2426'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=52; reviewStatus=ok'
),
(
  'STU-0519',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2429'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=53; reviewStatus=ok'
),
(
  'STU-0520',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2424'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=54; reviewStatus=ok'
),
(
  'STU-0521',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '202200018'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=55; reviewStatus=ok'
),
(
  'STU-0522',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '202200015'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=56; reviewStatus=ok'
),
(
  'STU-0523',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '202200019'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=57; reviewStatus=ok'
),
(
  'STU-0524',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2610'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=58; reviewStatus=ok'
),
(
  'STU-0525',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '547'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=59; reviewStatus=ok'
),
(
  'STU-0526',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2593'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=60; reviewStatus=ok'
),
(
  'STU-0527',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '534'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=61; reviewStatus=ok'
),
(
  'STU-0528',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2581'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=62; reviewStatus=ok'
),
(
  'STU-0529',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '581'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=63; reviewStatus=ok'
),
(
  'STU-0530',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '583'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=64; reviewStatus=needs_review'
),
(
  'STU-0531',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2583'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=65; reviewStatus=ok'
),
(
  'STU-0532',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '631'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=66; reviewStatus=needs_review'
),
(
  'STU-0533',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '573'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=67; reviewStatus=ok'
),
(
  'STU-0534',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '525253'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=68; reviewStatus=ok'
),
(
  'STU-0535',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2370'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=69; reviewStatus=ok'
),
(
  'STU-0099',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2598'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=70; reviewStatus=ok'
),
(
  'STU-0100',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '555'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=71; reviewStatus=ok'
),
(
  'STU-0101',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2407'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=72; reviewStatus=ok'
),
(
  'STU-0102',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2570'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=73; reviewStatus=ok'
),
(
  'STU-0103',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2411'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=74; reviewStatus=ok'
),
(
  'STU-0104',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2420'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=75; reviewStatus=ok'
),
(
  'STU-0105',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2553'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=76; reviewStatus=ok'
),
(
  'STU-0106',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2417'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=77; reviewStatus=ok'
),
(
  'STU-0107',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2479'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=78; reviewStatus=ok'
),
(
  'STU-0108',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2412'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=79; reviewStatus=ok'
),
(
  'STU-0110',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '202200011'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=80; reviewStatus=ok'
),
(
  'STU-0119',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '202200007'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=81; reviewStatus=ok'
),
(
  'STU-0111',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2422'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=82; reviewStatus=ok'
),
(
  'STU-0112',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2566'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=83; reviewStatus=ok'
),
(
  'STU-0113',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '580'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=84; reviewStatus=ok'
),
(
  'STU-0114',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '566727'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=85; reviewStatus=ok'
),
(
  'STU-0115',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2419'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=86; reviewStatus=ok'
),
(
  'STU-0116',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2595'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=87; reviewStatus=ok'
),
(
  'STU-0117',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2418'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=88; reviewStatus=ok'
),
(
  'STU-0118',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2410'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=89; reviewStatus=ok'
),
(
  'STU-0120',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2413'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=90; reviewStatus=ok'
),
(
  'STU-0121',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '569'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=91; reviewStatus=ok'
),
(
  'STU-0122',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2423'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=92; reviewStatus=ok'
),
(
  'STU-0123',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2599'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=93; reviewStatus=ok'
),
(
  'STU-0124',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2550'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=94; reviewStatus=ok'
),
(
  'STU-0125',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '111'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=95; reviewStatus=ok'
),
(
  'STU-0126',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '202200008'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=96; reviewStatus=ok'
),
(
  'STU-0127',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2601'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=97; reviewStatus=ok'
),
(
  'STU-0128',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2421'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=98; reviewStatus=ok'
),
(
  'STU-0129',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '25555504'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=99; reviewStatus=ok'
),
(
  'STU-0131',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '598'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=100; reviewStatus=ok'
),
(
  'STU-0132',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2596'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=101; reviewStatus=ok'
)
on conflict (source_student_uid, import_name) do update
set student_id = excluded.student_id,
    matched_via = excluded.matched_via,
    notes = excluded.notes,
    updated_at = now();
