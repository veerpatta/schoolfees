-- vpps-latest-2026-05-15-fullbook: source mapping chunk 3
insert into private.vpps_student_source_mapping (
  source_student_uid, import_name, student_id, workbook_filename, matched_via, notes
) values
(
  'STU-0133',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '635'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=102; reviewStatus=ok'
),
(
  'STU-0134',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '550'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=103; reviewStatus=ok'
),
(
  'STU-0135',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2613'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=104; reviewStatus=ok'
),
(
  'STU-0136',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '555231'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=105; reviewStatus=ok'
),
(
  'STU-0137',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '577'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=106; reviewStatus=ok'
),
(
  'STU-0138',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '548'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=107; reviewStatus=ok'
),
(
  'STU-0140',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '578'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=108; reviewStatus=ok'
),
(
  'STU-0141',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2557'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=109; reviewStatus=ok'
),
(
  'STU-0163',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2231'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=110; reviewStatus=ok'
),
(
  'STU-0164',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '408'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=111; reviewStatus=ok'
),
(
  'STU-0165',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2457'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=112; reviewStatus=ok'
),
(
  'STU-0166',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '20220003'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=113; reviewStatus=ok'
),
(
  'STU-0167',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '424'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=114; reviewStatus=ok'
),
(
  'STU-0168',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2607'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=115; reviewStatus=ok'
),
(
  'STU-0169',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2233'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=116; reviewStatus=ok'
),
(
  'STU-0170',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2308'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=117; reviewStatus=ok'
),
(
  'STU-0171',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '617'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=118; reviewStatus=ok'
),
(
  'STU-0172',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2463'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=119; reviewStatus=ok'
),
(
  'STU-0174',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = 'VPPS-STU0174'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=120; reviewStatus=needs_review'
),
(
  'STU-0175',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '608'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=121; reviewStatus=ok'
),
(
  'STU-0176',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = 'VPPS-STU0176'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=122; reviewStatus=needs_review'
),
(
  'STU-0178',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '645638'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=124; reviewStatus=ok'
),
(
  'STU-0179',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2466'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=125; reviewStatus=ok'
),
(
  'STU-0180',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2238'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=126; reviewStatus=ok'
),
(
  'STU-0182',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2240'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=127; reviewStatus=ok'
),
(
  'STU-0183',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '555226'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=128; reviewStatus=ok'
),
(
  'STU-0184',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2468'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=129; reviewStatus=ok'
),
(
  'STU-0185',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2235'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=130; reviewStatus=ok'
),
(
  'STU-0186',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '202200001'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=131; reviewStatus=ok'
),
(
  'STU-0187',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2236'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=132; reviewStatus=ok'
),
(
  'STU-0188',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '5525513'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=133; reviewStatus=ok'
),
(
  'STU-0189',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '404'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=134; reviewStatus=ok'
),
(
  'STU-0190',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2401'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=135; reviewStatus=ok'
),
(
  'STU-0191',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = 'VPPS-STU0191'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=136; reviewStatus=needs_review'
),
(
  'STU-0192',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2237'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=137; reviewStatus=ok'
),
(
  'STU-0193',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '410'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=138; reviewStatus=ok'
),
(
  'STU-0194',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '460'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=139; reviewStatus=ok'
),
(
  'STU-0195',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '623'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=140; reviewStatus=ok'
),
(
  'STU-0197',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2302'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=141; reviewStatus=ok'
),
(
  'STU-0198',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2239'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=142; reviewStatus=ok'
),
(
  'STU-0200',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2614'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=143; reviewStatus=ok'
),
(
  'STU-0201',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '604'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=144; reviewStatus=ok'
),
(
  'STU-0202',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '380'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=145; reviewStatus=ok'
),
(
  'STU-0203',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '457'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=146; reviewStatus=ok'
),
(
  'STU-0204',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2571'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=147; reviewStatus=ok'
),
(
  'STU-0205',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '461'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=148; reviewStatus=ok'
),
(
  'STU-0206',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '383'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=149; reviewStatus=ok'
),
(
  'STU-0207',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '20220002'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=150; reviewStatus=ok'
),
(
  'STU-0208',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '587'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=151; reviewStatus=ok'
),
(
  'STU-0209',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2204'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=152; reviewStatus=ok'
)
on conflict (source_student_uid, import_name) do update
set student_id = excluded.student_id,
    matched_via = excluded.matched_via,
    notes = excluded.notes,
    updated_at = now();
