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
