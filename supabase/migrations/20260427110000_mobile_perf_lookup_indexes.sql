set search_path = public;

create index if not exists idx_students_primary_phone_lookup
on public.students (primary_phone)
where primary_phone is not null and trim(primary_phone) <> '';
