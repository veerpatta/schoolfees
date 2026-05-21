do $$
declare
  phone_values_sql text := '(s.primary_phone)';
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'students'
      and column_name = 'alternate_phone'
  ) then
    phone_values_sql := '(s.primary_phone), (s.alternate_phone)';
  end if;

  execute format($view$
create or replace view public.v_student_sibling_groups
with (security_invoker = true)
as
with student_phones as (
  select
    s.id as student_id,
    c.session_label,
    s.father_name,
    regexp_replace(coalesce(raw_phone.raw_value, ''), '[^0-9]', '', 'g') as normalized_phone
  from public.students as s
  join public.classes as c
    on c.id = s.class_id
  cross join lateral (
    values %s
  ) as raw_phone(raw_value)
  where s.status = 'active'
),
valid_student_phones as (
  select distinct
    student_id,
    session_label,
    father_name,
    normalized_phone
  from student_phones
  where normalized_phone ~ '^[0-9]{10}$'
    and normalized_phone not in ('9999999999', '0000000000', '1234567890')
    and normalized_phone !~ '^([0-9])\1{9}$'
    and normalized_phone !~ '([0-9])\1{6,}'
),
phone_groups as (
  select
    session_label,
    normalized_phone,
    array_agg(student_id order by student_id) as student_ids,
    count(distinct student_id)::integer as student_count
  from valid_student_phones
  group by session_label, normalized_phone
  having count(distinct student_id) >= 2
),
detected_groups as (
  select
    md5(array_to_string(student_ids, '|')) as group_key,
    session_label,
    student_ids,
    student_count,
    array_agg(normalized_phone order by normalized_phone)::text[] as phone_match
  from phone_groups
  group by session_label, student_ids, student_count
),
existing_groups as (
  select
    group_record.id as family_group_id,
    group_record.academic_session_label as session_label,
    array_agg(member.student_id order by member.student_id) as student_ids
  from public.student_family_groups as group_record
  join public.student_family_members as member
    on member.family_group_id = group_record.id
   and member.academic_session_label = group_record.academic_session_label
  group by group_record.id, group_record.academic_session_label
),
father_matches as (
  select
    detected.group_key,
    (
      count(distinct normalized_father.normalized_name) = 1
      and min(normalized_father.normalized_name) <> ''
    ) as father_name_match
  from detected_groups as detected
  join public.students as s
    on s.id = any(detected.student_ids)
  cross join lateral (
    select trim(regexp_replace(regexp_replace(lower(coalesce(s.father_name, '')), '[^[:alnum:][:space:]]', ' ', 'g'), '\s+', ' ', 'g')) as normalized_name
  ) as normalized_father
  group by detected.group_key
)
select
  detected.group_key,
  detected.session_label,
  detected.student_ids,
  detected.student_count,
  detected.phone_match,
  coalesce(father_matches.father_name_match, false) as father_name_match,
  case when existing.family_group_id is not null then 'confirmed' else 'suspected' end::text as confidence,
  existing.family_group_id as existing_family_group_id
from detected_groups as detected
left join father_matches
  on father_matches.group_key = detected.group_key
left join lateral (
  select existing_groups.family_group_id
  from existing_groups
  where existing_groups.session_label = detected.session_label
    and detected.student_ids <@ existing_groups.student_ids
  order by array_length(existing_groups.student_ids, 1), existing_groups.family_group_id
  limit 1
) as existing on true;
$view$, phone_values_sql);
end $$;

grant select on public.v_student_sibling_groups to authenticated;
grant select on public.v_student_sibling_groups to service_role;
