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
-- vpps-latest-2026-05-15-fullbook: source mapping chunk 6
insert into private.vpps_student_source_mapping (
  source_student_uid, import_name, student_id, workbook_filename, matched_via, notes
) values
(
  'STU-0331',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '389'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=258; reviewStatus=ok'
),
(
  'STU-0332',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2535'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=259; reviewStatus=ok'
),
(
  'STU-0333',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '527'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=260; reviewStatus=ok'
),
(
  'STU-0334',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = 'VPPS-STU0334'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=261; reviewStatus=needs_review'
),
(
  'STU-0335',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '325'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=262; reviewStatus=ok'
),
(
  'STU-0336',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2538'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=263; reviewStatus=ok'
),
(
  'STU-0338',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2539'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=264; reviewStatus=ok'
),
(
  'STU-0339',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '456'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=265; reviewStatus=ok'
),
(
  'STU-0340',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '472'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=266; reviewStatus=ok'
),
(
  'STU-0341',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2542'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=267; reviewStatus=ok'
),
(
  'STU-0344',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2544'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=268; reviewStatus=ok'
),
(
  'STU-0346',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '228/12RTE'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=269; reviewStatus=ok'
),
(
  'STU-0347',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2558'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=270; reviewStatus=ok'
),
(
  'STU-0348',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2561'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=271; reviewStatus=ok'
),
(
  'STU-0349',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '420'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=272; reviewStatus=ok'
),
(
  'STU-0351',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2399'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=273; reviewStatus=ok'
),
(
  'STU-0352',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2287'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=274; reviewStatus=ok'
),
(
  'STU-0353',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2338'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=276; reviewStatus=ok'
),
(
  'STU-0355',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2360'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=277; reviewStatus=ok'
),
(
  'STU-0356',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2285'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=278; reviewStatus=ok'
),
(
  'STU-0357',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2277'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=279; reviewStatus=ok'
),
(
  'STU-0359',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2315'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=281; reviewStatus=ok'
),
(
  'STU-0360',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2549'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=282; reviewStatus=ok'
),
(
  'STU-0361',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '05RTE'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=283; reviewStatus=ok'
),
(
  'STU-0363',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2284'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=284; reviewStatus=ok'
),
(
  'STU-0364',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2282'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=285; reviewStatus=ok'
),
(
  'STU-0365',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = 'VPPS-STU0365'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=286; reviewStatus=needs_review'
),
(
  'STU-0366',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2309'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=287; reviewStatus=ok'
),
(
  'STU-0367',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '330/22RTE'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=288; reviewStatus=ok'
),
(
  'STU-0368',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = 'VPPS-STU0368'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=290; reviewStatus=needs_review'
),
(
  'STU-0369',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2387'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=291; reviewStatus=ok'
),
(
  'STU-0370',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2281'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=292; reviewStatus=ok'
),
(
  'STU-0371',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2316'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=293; reviewStatus=ok'
),
(
  'STU-0372',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2307'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=294; reviewStatus=ok'
),
(
  'STU-0373',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2552'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=295; reviewStatus=ok'
),
(
  'STU-0374',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2606'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=296; reviewStatus=ok'
),
(
  'STU-0375',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = 'VPPS-STU0375'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=297; reviewStatus=needs_review'
),
(
  'STU-0376',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '65785'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=298; reviewStatus=ok'
),
(
  'STU-0377',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '785'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=299; reviewStatus=ok'
),
(
  'STU-0378',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2286'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=300; reviewStatus=ok'
),
(
  'STU-0379',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '334/23RTE'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=301; reviewStatus=ok'
),
(
  'STU-0380',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2295'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=302; reviewStatus=ok'
),
(
  'STU-0381',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2304'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=303; reviewStatus=ok'
),
(
  'STU-0382',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2400'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=304; reviewStatus=ok'
),
(
  'STU-0383',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '10RTE'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=305; reviewStatus=ok'
),
(
  'STU-0384',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '07RTE'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=306; reviewStatus=ok'
),
(
  'STU-0385',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2280'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=307; reviewStatus=ok'
),
(
  'STU-0386',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2288'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=308; reviewStatus=ok'
),
(
  'STU-0387',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2283'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=309; reviewStatus=ok'
),
(
  'STU-0388',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2366'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=310; reviewStatus=ok'
)
on conflict (source_student_uid, import_name) do update
set student_id = excluded.student_id,
    matched_via = excluded.matched_via,
    notes = excluded.notes,
    updated_at = now();
-- vpps-latest-2026-05-15-fullbook: source mapping chunk 7
insert into private.vpps_student_source_mapping (
  source_student_uid, import_name, student_id, workbook_filename, matched_via, notes
) values
(
  'STU-0389',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2290'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=311; reviewStatus=ok'
),
(
  'STU-0390',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2254'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=312; reviewStatus=ok'
),
(
  'STU-0391',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2255'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=313; reviewStatus=ok'
),
(
  'STU-0392',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2257'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=314; reviewStatus=ok'
),
(
  'STU-0393',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2346'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=315; reviewStatus=ok'
),
(
  'STU-0394',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2336'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=316; reviewStatus=ok'
),
(
  'STU-0395',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2296'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=317; reviewStatus=ok'
),
(
  'STU-0396',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2272'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=318; reviewStatus=ok'
),
(
  'STU-0397',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2342'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=319; reviewStatus=ok'
),
(
  'STU-0398',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2334'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=320; reviewStatus=ok'
),
(
  'STU-0399',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2373'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=321; reviewStatus=ok'
),
(
  'STU-0354',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2359'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=322; reviewStatus=ok'
),
(
  'STU-0401',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2568'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=323; reviewStatus=ok'
),
(
  'STU-0402',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2258'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=324; reviewStatus=ok'
),
(
  'STU-0403',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2261'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=325; reviewStatus=ok'
),
(
  'STU-0404',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2396'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=326; reviewStatus=ok'
),
(
  'STU-0405',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2260'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=327; reviewStatus=ok'
),
(
  'STU-0406',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2577'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=328; reviewStatus=ok'
),
(
  'STU-0407',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2259'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=329; reviewStatus=ok'
),
(
  'STU-0408',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2256'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=330; reviewStatus=ok'
),
(
  'STU-0409',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2266'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=331; reviewStatus=ok'
),
(
  'STU-0410',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2393'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=332; reviewStatus=ok'
),
(
  'STU-0411',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2273'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=333; reviewStatus=ok'
),
(
  'STU-0413',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2274'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=334; reviewStatus=ok'
),
(
  'STU-0491',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2275'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=335; reviewStatus=ok'
),
(
  'STU-0415',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2269'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=336; reviewStatus=ok'
),
(
  'STU-0416',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2265'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=337; reviewStatus=ok'
),
(
  'STU-0417',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2383'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=338; reviewStatus=ok'
),
(
  'STU-0418',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2289'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=339; reviewStatus=ok'
),
(
  'STU-0419',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2271'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=340; reviewStatus=ok'
),
(
  'STU-0420',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2268'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=341; reviewStatus=ok'
),
(
  'STU-0421',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2292'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=342; reviewStatus=ok'
),
(
  'STU-0422',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2560'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=343; reviewStatus=ok'
),
(
  'STU-0423',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2267'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=344; reviewStatus=ok'
),
(
  'STU-0424',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = 'RTE 03'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=345; reviewStatus=ok'
),
(
  'STU-0425',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2264'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=346; reviewStatus=ok'
),
(
  'STU-0426',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2270'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=347; reviewStatus=ok'
),
(
  'STU-0427',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2349'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=348; reviewStatus=ok'
),
(
  'STU-0429',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2276'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=349; reviewStatus=ok'
),
(
  'STU-0430',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2392'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=350; reviewStatus=ok'
),
(
  'STU-0432',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2575'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=351; reviewStatus=ok'
),
(
  'STU-0433',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2253'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=352; reviewStatus=ok'
),
(
  'STU-0434',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '28RTE'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=353; reviewStatus=ok'
),
(
  'STU-0435',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2556'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=354; reviewStatus=ok'
),
(
  'STU-0436',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2588'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=355; reviewStatus=ok'
),
(
  'STU-0437',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2585'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=356; reviewStatus=ok'
),
(
  'STU-0438',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2567'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=357; reviewStatus=ok'
),
(
  'STU-0439',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2252'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=358; reviewStatus=ok'
),
(
  'STU-0440',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2589'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=359; reviewStatus=ok'
),
(
  'STU-0441',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2580'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=360; reviewStatus=ok'
)
on conflict (source_student_uid, import_name) do update
set student_id = excluded.student_id,
    matched_via = excluded.matched_via,
    notes = excluded.notes,
    updated_at = now();
-- vpps-latest-2026-05-15-fullbook: source mapping chunk 8
insert into private.vpps_student_source_mapping (
  source_student_uid, import_name, student_id, workbook_filename, matched_via, notes
) values
(
  'STU-0442',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2587'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=361; reviewStatus=ok'
),
(
  'STU-0443',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2548'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=362; reviewStatus=ok'
),
(
  'STU-0444',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2584'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=363; reviewStatus=ok'
),
(
  'STU-0445',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2249'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=364; reviewStatus=ok'
),
(
  'STU-0446',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2247'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=365; reviewStatus=ok'
),
(
  'STU-0447',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2337'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=366; reviewStatus=ok'
),
(
  'STU-0448',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2250'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=367; reviewStatus=ok'
),
(
  'STU-0449',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2355'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=368; reviewStatus=ok'
),
(
  'STU-0450',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2248'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=369; reviewStatus=ok'
),
(
  'STU-0452',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2586'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=370; reviewStatus=ok'
),
(
  'STU-0453',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2251'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=371; reviewStatus=ok'
),
(
  'STU-0454',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2344'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=372; reviewStatus=ok'
),
(
  'NEW-2026-27-0372',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2379'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=373; reviewStatus=ok'
),
(
  'STU-0142',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2214'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=374; reviewStatus=ok'
),
(
  'STU-0143',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2365'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=375; reviewStatus=ok'
),
(
  'NEW-2026-27-0375',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2391'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=376; reviewStatus=ok'
),
(
  'NEW-2026-27-0376',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2356'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=377; reviewStatus=ok'
),
(
  'STU-0144',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2574'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=378; reviewStatus=ok'
),
(
  'STU-0145',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2213'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=379; reviewStatus=ok'
),
(
  'STU-0146',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2317'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=380; reviewStatus=ok'
),
(
  'STU-0147',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2314'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=381; reviewStatus=ok'
),
(
  'STU-0148',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2361'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=382; reviewStatus=ok'
),
(
  'STU-0150',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2218'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=383; reviewStatus=ok'
),
(
  'STU-0151',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2386'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=384; reviewStatus=ok'
),
(
  'NEW-2026-27-0384',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2377'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=385; reviewStatus=ok'
),
(
  'STU-0152',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2353'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=386; reviewStatus=ok'
),
(
  'STU-0153',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2219'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=387; reviewStatus=ok'
),
(
  'STU-0155',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2333'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=388; reviewStatus=ok'
),
(
  'STU-0156',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '23'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=389; reviewStatus=ok'
),
(
  'STU-0157',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2602'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=390; reviewStatus=ok'
),
(
  'STU-0159',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2562'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=391; reviewStatus=ok'
),
(
  'STU-0160',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2579'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=392; reviewStatus=ok'
),
(
  'STU-0161',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2220'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=393; reviewStatus=ok'
),
(
  'STU-0162',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2212'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=394; reviewStatus=ok'
),
(
  'STU-0001',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '255555'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=395; reviewStatus=ok'
),
(
  'STU-0003',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = 'VPPS-STU0003'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=396; reviewStatus=needs_review'
),
(
  'STU-0004',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2600'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=397; reviewStatus=ok'
),
(
  'STU-0005',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2576'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=398; reviewStatus=ok'
),
(
  'STU-0006',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '375'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=399; reviewStatus=ok'
),
(
  'STU-0007',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '4668564'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=400; reviewStatus=ok'
),
(
  'STU-0008',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2554'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=401; reviewStatus=ok'
),
(
  'STU-0010',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2555'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=402; reviewStatus=ok'
),
(
  'STU-0011',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2603'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=403; reviewStatus=ok'
),
(
  'STU-0012',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '7'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=404; reviewStatus=ok'
),
(
  'STU-0013',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2578'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=405; reviewStatus=ok'
),
(
  'STU-0014',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2171'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=406; reviewStatus=ok'
),
(
  'STU-0015',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2169'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=407; reviewStatus=ok'
),
(
  'STU-0016',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2611'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=408; reviewStatus=ok'
),
(
  'STU-0017',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2374'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=409; reviewStatus=ok'
),
(
  'STU-0018',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2173'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=410; reviewStatus=ok'
)
on conflict (source_student_uid, import_name) do update
set student_id = excluded.student_id,
    matched_via = excluded.matched_via,
    notes = excluded.notes,
    updated_at = now();
-- vpps-latest-2026-05-15-fullbook: source mapping chunk 9
insert into private.vpps_student_source_mapping (
  source_student_uid, import_name, student_id, workbook_filename, matched_via, notes
) values
(
  'STU-0019',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2175'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=411; reviewStatus=ok'
),
(
  'STU-0020',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2207'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=412; reviewStatus=ok'
),
(
  'STU-0009',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = 'VPPS-STU0009'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=413; reviewStatus=needs_review'
),
(
  'STU-0022',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2174'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=414; reviewStatus=ok'
),
(
  'STU-0023',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2168'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=415; reviewStatus=ok'
),
(
  'STU-0024',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = 'VPPS-STU0024'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=416; reviewStatus=needs_review'
),
(
  'STU-0026',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2216'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=417; reviewStatus=ok'
),
(
  'STU-0027',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2572'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=418; reviewStatus=ok'
),
(
  'STU-0028',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2573'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=419; reviewStatus=ok'
),
(
  'STU-0029',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2177'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=420; reviewStatus=ok'
),
(
  'STU-0030',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2164'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=421; reviewStatus=ok'
),
(
  'STU-0031',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '6'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'name_class_phone_fallback',
  'sheetRow=422; reviewStatus=ok'
),
(
  'STU-0032',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2184'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=423; reviewStatus=ok'
),
(
  'STU-0457',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2609'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=424; reviewStatus=needs_review'
),
(
  'STU-0458',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2369'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=425; reviewStatus=needs_review'
),
(
  'STU-0461',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2612'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=426; reviewStatus=needs_review'
),
(
  'STU-0462',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2563'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=427; reviewStatus=needs_review'
),
(
  'STU-0463',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2350'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=428; reviewStatus=needs_review'
),
(
  'STU-0464',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2200'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=429; reviewStatus=needs_review'
),
(
  'NEW-2026-27-0429',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2183'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=430; reviewStatus=needs_review'
),
(
  'STU-0046',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2363'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=431; reviewStatus=ok'
),
(
  'STU-0047',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2382'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=432; reviewStatus=ok'
),
(
  'STU-0048',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2310'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=433; reviewStatus=ok'
),
(
  'STU-0049',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2156'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=434; reviewStatus=ok'
),
(
  'STU-0050',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2332'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=435; reviewStatus=ok'
),
(
  'STU-0052',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2311'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=436; reviewStatus=ok'
),
(
  'STU-0053',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2297'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=437; reviewStatus=ok'
),
(
  'STU-0054',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2163'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=438; reviewStatus=ok'
),
(
  'STU-0055',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2348'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=439; reviewStatus=ok'
),
(
  'STU-0056',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = 'VPPS-STU0056'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=440; reviewStatus=needs_review'
),
(
  'STU-0058',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2372'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=441; reviewStatus=ok'
),
(
  'STU-0059',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2354'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=442; reviewStatus=ok'
),
(
  'STU-0060',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2390'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=443; reviewStatus=ok'
),
(
  'STU-0061',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2190'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=444; reviewStatus=ok'
),
(
  'STU-0062',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2300'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=445; reviewStatus=ok'
),
(
  'STU-0063',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2301'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=446; reviewStatus=ok'
),
(
  'STU-0064',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2299'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=447; reviewStatus=ok'
),
(
  'STU-0065',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2182'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=448; reviewStatus=ok'
),
(
  'STU-0066',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2347'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=449; reviewStatus=ok'
),
(
  'STU-0067',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2364'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=450; reviewStatus=ok'
),
(
  'STU-0068',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2139'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=451; reviewStatus=ok'
),
(
  'STU-0069',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2345'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=452; reviewStatus=ok'
),
(
  'STU-0070',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2384'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=453; reviewStatus=ok'
),
(
  'STU-0071',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2564'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'created_new',
  'sheetRow=454; reviewStatus=ok'
),
(
  'STU-0072',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2371'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=455; reviewStatus=ok'
),
(
  'STU-0074',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2176'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=456; reviewStatus=ok'
),
(
  'STU-0075',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2141'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=457; reviewStatus=ok'
),
(
  'STU-0076',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2341'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=458; reviewStatus=ok'
),
(
  'STU-0077',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '2132'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=459; reviewStatus=ok'
),
(
  'STU-0078',
  'vpps-latest-2026-05-15-fullbook',
  (select id from public.students where admission_no = '15'),
  'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
  'admission_no',
  'sheetRow=460; reviewStatus=ok'
)
on conflict (source_student_uid, import_name) do update
set student_id = excluded.student_id,
    matched_via = excluded.matched_via,
    notes = excluded.notes,
    updated_at = now();
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
