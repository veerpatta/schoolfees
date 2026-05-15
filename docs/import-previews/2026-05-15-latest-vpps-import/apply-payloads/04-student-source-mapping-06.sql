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
