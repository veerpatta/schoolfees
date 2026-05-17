with payload as (
  select jsonb_array_elements(:'p'::jsonb) as r
), upsert as (
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
  from payload
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
      updated_at = now()
  returning admission_no, id, full_name
)
select count(*) as upserted from upsert;