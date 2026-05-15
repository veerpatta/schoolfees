-- vpps-latest-2026-05-15-fullbook: source mapping chunk 1
insert into private.vpps_student_source_mapping (
  source_student_uid, import_name, student_id, workbook_filename, matched_via, notes
) values
(
  'STU-0494',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = 'VPPS-STU0494'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=2; reviewStatus=needs_review'
),
(
  'STU-0495',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = 'VPPS-STU0495'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=3; reviewStatus=needs_review'
),
(
  'STU-0496',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2408'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=4; reviewStatus=ok'
),
(
  'STU-0497',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2409'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=5; reviewStatus=ok'
),
(
  'STU-0498',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = 'VPPS-STU0498'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=6; reviewStatus=needs_review'
),
(
  'STU-0499',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2608'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=7; reviewStatus=ok'
),
(
  'STU-0500',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = 'VPPS-STU0500'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=8; reviewStatus=needs_review'
),
(
  'STU-0501',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = 'VPPS-STU0501'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=9; reviewStatus=needs_review'
),
(
  'STU-0212',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '202200012'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=10; reviewStatus=ok'
),
(
  'STU-0502',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2590'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=11; reviewStatus=ok'
),
(
  'STU-0503',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2592'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=12; reviewStatus=ok'
),
(
  'STU-0504',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2591'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=13; reviewStatus=ok'
),
(
  'STU-0505',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = 'VPPS-STU0505'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=14; reviewStatus=needs_review'
),
(
  'STU-0222',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '202200013'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=15; reviewStatus=ok'
),
(
  'STU-0506',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2405'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=16; reviewStatus=ok'
),
(
  'STU-0507',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2551'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=17; reviewStatus=ok'
),
(
  'STU-0508',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2406'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=18; reviewStatus=ok'
),
(
  'STU-0509',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2617'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=19; reviewStatus=ok'
),
(
  'STU-0510',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = 'VPPS-STU0510'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=20; reviewStatus=needs_review'
),
(
  'STU-0511',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2616'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=21; reviewStatus=ok'
),
(
  'STU-0466',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2322'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=22; reviewStatus=ok'
),
(
  'STU-0467',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2325'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=23; reviewStatus=ok'
),
(
  'STU-0468',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2245'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=24; reviewStatus=ok'
),
(
  'STU-0469',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2320'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=25; reviewStatus=ok'
),
(
  'STU-0471',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '584'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=26; reviewStatus=ok'
),
(
  'STU-0472',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2319'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=27; reviewStatus=ok'
),
(
  'STU-0473',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2565'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=28; reviewStatus=ok'
),
(
  'STU-0474',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2242'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=29; reviewStatus=ok'
),
(
  'STU-0358',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2291'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=30; reviewStatus=needs_review'
),
(
  'STU-0475',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2331'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=31; reviewStatus=ok'
),
(
  'STU-0476',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2397'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=32; reviewStatus=ok'
),
(
  'STU-0477',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2246'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=33; reviewStatus=ok'
),
(
  'STU-0236',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '202200016'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=34; reviewStatus=ok'
),
(
  'STU-0479',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2394'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=35; reviewStatus=ok'
),
(
  'STU-0480',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2362'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=36; reviewStatus=ok'
),
(
  'STU-0481',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2243'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=37; reviewStatus=ok'
),
(
  'STU-0482',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2328'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=38; reviewStatus=ok'
),
(
  'STU-0483',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2241'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=39; reviewStatus=ok'
),
(
  'STU-0484',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2244'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=40; reviewStatus=ok'
),
(
  'STU-0485',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '202200021'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=41; reviewStatus=ok'
),
(
  'STU-0486',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2318'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=42; reviewStatus=ok'
),
(
  'STU-0487',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2326'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=43; reviewStatus=ok'
),
(
  'STU-0488',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2323'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=44; reviewStatus=ok'
),
(
  'STU-0489',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '593'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=45; reviewStatus=ok'
),
(
  'STU-0490',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2324'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=46; reviewStatus=ok'
),
(
  'STU-0512',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '579'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=47; reviewStatus=ok'
),
(
  'STU-0513',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2425'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=48; reviewStatus=ok'
),
(
  'STU-0514',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = 'VPPS-STU0514'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=49; reviewStatus=needs_review'
),
(
  'STU-0515',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '202200014'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=50; reviewStatus=ok'
),
(
  'STU-0516',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2427'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=51; reviewStatus=ok'
)
on conflict (source_student_uid, import_name) do update
set student_id = excluded.student_id,
    matched_via = excluded.matched_via,
    notes = excluded.notes,
    updated_at = now();
