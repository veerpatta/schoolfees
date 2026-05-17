insert into public.students (
  admission_no, full_name, date_of_birth, father_name, mother_name,
  primary_phone, secondary_phone, class_id, transport_route_id, notes
)
select
  r->>'admission_no',
  r->>'full_name',
  nullif(r->>'date_of_birth', '')::date,
  nullif(r->>'father_name', ''),
  nullif(r->>'mother_name', ''),
  nullif(r->>'primary_phone', ''),
  nullif(r->>'secondary_phone', ''),
  (r->>'class_id')::uuid,
  nullif(r->>'transport_route_id', '')::uuid,
  r->>'notes'
from jsonb_array_elements('[{"source_student_uid":"STU-0079","admission_no":"2343","full_name":"Nityanjali Kanwar Chundawat","date_of_birth":"2009-05-11","father_name":"Jagnath Singh Chundawat","mother_name":"Pushpa Kanwar","primary_phone":null,"secondary_phone":null,"class_id":"c09fe2fa-994e-465e-89fd-4bcc4390ecc6","transport_route_id":"a23dc42f-0183-46de-b38b-d6acd101f286","matched_via":"admission_no","review_status":"ok","notes":"source_student_uid:STU-0079; review:ok; notes:Sources: PSP All Students PDF"},{"source_student_uid":"STU-0080","admission_no":"2135","full_name":"PRATIKSHA KANWAR CHUNDAWAT","date_of_birth":"2009-08-23","father_name":"NATHU SINGH","mother_name":"SAMPAT KANWAR","primary_phone":null,"secondary_phone":null,"class_id":"c09fe2fa-994e-465e-89fd-4bcc4390ecc6","transport_route_id":"bb6ce44a-80b9-4569-960d-3c077b211b29","matched_via":"admission_no","review_status":"ok","notes":"source_student_uid:STU-0080; review:ok; notes:Sources: PSP All Students PDF"},{"source_student_uid":"STU-0081","admission_no":"2137","full_name":"PRIYANSHI PALIWAL","date_of_birth":"2009-06-30","father_name":"BHARAT PALIWAL","mother_name":"KALAWATI PALIWAL","primary_phone":null,"secondary_phone":null,"class_id":"c09fe2fa-994e-465e-89fd-4bcc4390ecc6","transport_route_id":"a23dc42f-0183-46de-b38b-d6acd101f286","matched_via":"admission_no","review_status":"ok","notes":"source_student_uid:STU-0081; review:ok; notes:Sources: PSP All Students PDF"},{"source_student_uid":"STU-0082","admission_no":"2381","full_name":"Vanshraj Singh","date_of_birth":"2010-02-22","father_name":"Manoj Singh","mother_name":"Lalita Kanwar","primary_phone":null,"secondary_phone":null,"class_id":"c09fe2fa-994e-465e-89fd-4bcc4390ecc6","transport_route_id":"a23dc42f-0183-46de-b38b-d6acd101f286","matched_via":"admission_no","review_status":"ok","notes":"source_student_uid:STU-0082; review:ok; notes:Sources: PSP All Students PDF"},{"source_student_uid":"STU-0083","admission_no":"2162","full_name":"Yashashvi Dadheech","date_of_birth":"2009-10-05","father_name":"Amit Kumar Dadheech","mother_name":"Antima Dadheech","primary_phone":null,"secondary_phone":null,"class_id":"c09fe2fa-994e-465e-89fd-4bcc4390ecc6","transport_route_id":"a23dc42f-0183-46de-b38b-d6acd101f286","matched_via":"admission_no","review_status":"ok","notes":"source_student_uid:STU-0083; review:ok; notes:Sources: PSP All Students PDF"},{"source_student_uid":"STU-0087","admission_no":"2389","full_name":"DIKSHITA VERMA","date_of_birth":"2008-09-16","father_name":"VIDHYA SHANKAR","mother_name":"PURNIMA DEVI","primary_phone":"8107739975","secondary_phone":null,"class_id":"52f0460b-ef1f-4c3b-bf94-ec7e510b7d4b","transport_route_id":"a23dc42f-0183-46de-b38b-d6acd101f286","matched_via":"admission_no","review_status":"needs_review","notes":"source_student_uid:STU-0087; review:needs_review; notes:Sources: PSP All Students PDF | Review: Missing stream for Class 11/12; verify Arts/Commerce/Science"},{"source_student_uid":"STU-0537","admission_no":"2395","full_name":"Mehul Singh Rathore","date_of_birth":"2008-11-20","father_name":"Manoj Singh Rathore","mother_name":"Lalita","primary_phone":null,"secondary_phone":null,"class_id":"52f0460b-ef1f-4c3b-bf94-ec7e510b7d4b","transport_route_id":"a23dc42f-0183-46de-b38b-d6acd101f286","matched_via":"created_new","review_status":"needs_review","notes":"source_student_uid:STU-0537; review:needs_review; notes:Sources: PSP All Students PDF | Review: Missing stream for Class 11/12; verify Arts/Commerce/Science"}]'::jsonb) as r
on conflict (admission_no) do update
set full_name = excluded.full_name,
    class_id = excluded.class_id,
    transport_route_id = coalesce(excluded.transport_route_id, public.students.transport_route_id),
    date_of_birth = coalesce(excluded.date_of_birth, public.students.date_of_birth),
    father_name = coalesce(nullif(excluded.father_name, ''), public.students.father_name),
    mother_name = coalesce(nullif(excluded.mother_name, ''), public.students.mother_name),
    primary_phone = coalesce(nullif(excluded.primary_phone, ''), public.students.primary_phone),
    secondary_phone = coalesce(nullif(excluded.secondary_phone, ''), public.students.secondary_phone),
    notes = excluded.notes,
    updated_at = now();