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
