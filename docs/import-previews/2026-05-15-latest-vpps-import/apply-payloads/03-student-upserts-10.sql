-- vpps-latest-2026-05-15-fullbook: student upserts chunk 10
insert into public.students (
  admission_no, full_name, date_of_birth, father_name, mother_name,
  primary_phone, secondary_phone, class_id, transport_route_id, notes
) values
(
  '2343',
  'Nityanjali Kanwar Chundawat',
  '2009-05-11'::date,
  'Jagnath Singh Chundawat',
  'Pushpa Kanwar',
  null,
  null,
  'c09fe2fa-994e-465e-89fd-4bcc4390ecc6'::uuid,
  'a23dc42f-0183-46de-b38b-d6acd101f286'::uuid,
  'source_student_uid:STU-0079; review:ok; notes:Sources: PSP All Students PDF'
),
(
  '2135',
  'PRATIKSHA KANWAR CHUNDAWAT',
  '2009-08-23'::date,
  'NATHU SINGH',
  'SAMPAT KANWAR',
  null,
  null,
  'c09fe2fa-994e-465e-89fd-4bcc4390ecc6'::uuid,
  'bb6ce44a-80b9-4569-960d-3c077b211b29'::uuid,
  'source_student_uid:STU-0080; review:ok; notes:Sources: PSP All Students PDF'
),
(
  '2137',
  'PRIYANSHI PALIWAL',
  '2009-06-30'::date,
  'BHARAT PALIWAL',
  'KALAWATI PALIWAL',
  null,
  null,
  'c09fe2fa-994e-465e-89fd-4bcc4390ecc6'::uuid,
  'a23dc42f-0183-46de-b38b-d6acd101f286'::uuid,
  'source_student_uid:STU-0081; review:ok; notes:Sources: PSP All Students PDF'
),
(
  '2381',
  'Vanshraj Singh',
  '2010-02-22'::date,
  'Manoj Singh',
  'Lalita Kanwar',
  null,
  null,
  'c09fe2fa-994e-465e-89fd-4bcc4390ecc6'::uuid,
  'a23dc42f-0183-46de-b38b-d6acd101f286'::uuid,
  'source_student_uid:STU-0082; review:ok; notes:Sources: PSP All Students PDF'
),
(
  '2162',
  'Yashashvi Dadheech',
  '2009-10-05'::date,
  'Amit Kumar Dadheech',
  'Antima Dadheech',
  null,
  null,
  'c09fe2fa-994e-465e-89fd-4bcc4390ecc6'::uuid,
  'a23dc42f-0183-46de-b38b-d6acd101f286'::uuid,
  'source_student_uid:STU-0083; review:ok; notes:Sources: PSP All Students PDF'
),
(
  '2389',
  'DIKSHITA VERMA',
  '2008-09-16'::date,
  'VIDHYA SHANKAR',
  'PURNIMA DEVI',
  '8107739975',
  null,
  '52f0460b-ef1f-4c3b-bf94-ec7e510b7d4b'::uuid,
  'a23dc42f-0183-46de-b38b-d6acd101f286'::uuid,
  'source_student_uid:STU-0087; review:needs_review; notes:Sources: PSP All Students PDF | Review: Missing stream for Class 11/12; verify Arts/Commerce/Science'
),
(
  '2395',
  'Mehul Singh Rathore',
  '2008-11-20'::date,
  'Manoj Singh Rathore',
  'Lalita',
  null,
  null,
  '52f0460b-ef1f-4c3b-bf94-ec7e510b7d4b'::uuid,
  'a23dc42f-0183-46de-b38b-d6acd101f286'::uuid,
  'source_student_uid:STU-0537; review:needs_review; notes:Sources: PSP All Students PDF | Review: Missing stream for Class 11/12; verify Arts/Commerce/Science'
)
on conflict (admission_no) do update
set
  full_name = excluded.full_name,
  class_id = excluded.class_id,
  transport_route_id = coalesce(excluded.transport_route_id, public.students.transport_route_id),
  date_of_birth = coalesce(excluded.date_of_birth, public.students.date_of_birth),
  father_name = coalesce(nullif(excluded.father_name, ''), public.students.father_name),
  mother_name = coalesce(nullif(excluded.mother_name, ''), public.students.mother_name),
  primary_phone = coalesce(nullif(excluded.primary_phone, ''), public.students.primary_phone),
  secondary_phone = coalesce(nullif(excluded.secondary_phone, ''), public.students.secondary_phone),
  notes = excluded.notes,
  updated_at = now();
