-- vpps-latest-2026-05-15-fullbook: source mapping chunk 4
insert into private.vpps_student_source_mapping (
  source_student_uid, import_name, student_id, workbook_filename, matched_via, notes
) values
(
  'STU-0210',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = 'VPPS-STU0210'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=153; reviewStatus=needs_review'
),
(
  'STU-0211',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '405'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=154; reviewStatus=ok'
),
(
  'STU-0213',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2958'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=156; reviewStatus=ok'
),
(
  'STU-0214',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2202'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=157; reviewStatus=ok'
),
(
  'STU-0215',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '407'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=158; reviewStatus=ok'
),
(
  'STU-0216',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2488'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=159; reviewStatus=ok'
),
(
  'STU-0217',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2222'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=160; reviewStatus=ok'
),
(
  'STU-0218',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2489'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=161; reviewStatus=ok'
),
(
  'STU-0221',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '703'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=162; reviewStatus=ok'
),
(
  'STU-0223',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '350'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=163; reviewStatus=ok'
),
(
  'STU-0225',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2491'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=164; reviewStatus=ok'
),
(
  'STU-0226',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '447'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=165; reviewStatus=ok'
),
(
  'STU-0227',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '566'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=167; reviewStatus=ok'
),
(
  'STU-0228',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '399'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=168; reviewStatus=ok'
),
(
  'STU-0229',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '622'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=169; reviewStatus=ok'
),
(
  'STU-0230',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '438'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=170; reviewStatus=ok'
),
(
  'STU-0231',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '67278'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=171; reviewStatus=ok'
),
(
  'STU-0232',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '605'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=172; reviewStatus=ok'
),
(
  'STU-0233',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2555506'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=173; reviewStatus=ok'
),
(
  'STU-0234',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '202200002'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=174; reviewStatus=ok'
),
(
  'STU-0235',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '202200020'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=175; reviewStatus=ok'
),
(
  'STU-0237',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = 'VPPS-STU0237'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=177; reviewStatus=needs_review'
),
(
  'STU-0238',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '441'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=178; reviewStatus=ok'
),
(
  'STU-0240',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2433'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=179; reviewStatus=ok'
),
(
  'STU-0241',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2434'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=180; reviewStatus=ok'
),
(
  'STU-0242',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '987'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=181; reviewStatus=ok'
),
(
  'STU-0243',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2436'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=182; reviewStatus=ok'
),
(
  'STU-0244',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2437'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=183; reviewStatus=ok'
),
(
  'STU-0245',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '552551'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=184; reviewStatus=ok'
),
(
  'STU-0246',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '557'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=185; reviewStatus=ok'
),
(
  'STU-0247',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2455'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=186; reviewStatus=ok'
),
(
  'STU-0249',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '5442'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=187; reviewStatus=ok'
),
(
  'STU-0250',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '597'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=188; reviewStatus=ok'
),
(
  'STU-0251',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '467'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=189; reviewStatus=ok'
),
(
  'STU-0252',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '365'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=190; reviewStatus=ok'
),
(
  'STU-0254',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2445'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=191; reviewStatus=ok'
),
(
  'STU-0256',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '202200006'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=192; reviewStatus=ok'
),
(
  'STU-0257',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '385'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=193; reviewStatus=ok'
),
(
  'STU-0258',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '532862'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=194; reviewStatus=ok'
),
(
  'STU-0259',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '21525'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=195; reviewStatus=ok'
),
(
  'STU-0261',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '202200003'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=196; reviewStatus=ok'
),
(
  'STU-0262',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = 'DIRECT-20260514-M0289'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=197; reviewStatus=ok'
),
(
  'STU-0263',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2450'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=198; reviewStatus=ok'
),
(
  'STU-0265',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '885'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=199; reviewStatus=ok'
),
(
  'STU-0266',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2559'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=200; reviewStatus=ok'
),
(
  'STU-0268',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '482'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=201; reviewStatus=ok'
),
(
  'STU-0269',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '202200005'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=202; reviewStatus=ok'
),
(
  'STU-0270',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2456'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=203; reviewStatus=ok'
),
(
  'STU-0272',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '373'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=204; reviewStatus=ok'
),
(
  'STU-0273',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = 'VPPS-STU0273'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=205; reviewStatus=needs_review'
)
on conflict (source_student_uid, import_name) do update
set student_id = excluded.student_id,
    matched_via = excluded.matched_via,
    notes = excluded.notes,
    updated_at = now();
