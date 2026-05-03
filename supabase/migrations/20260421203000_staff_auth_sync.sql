-- Keep public.users synchronized with Supabase Auth users for internal staff RBAC.

set check_function_bodies = off;

create or replace function private.normalize_staff_role(p_role text)
returns public.staff_role
language sql
immutable
set search_path = public, private
as $$
  select case trim(coalesce(p_role, ''))
    when 'admin' then 'admin'::public.staff_role
    when 'accountant' then 'accountant'::public.staff_role
    when 'read_only_staff' then 'read_only_staff'::public.staff_role
    else 'read_only_staff'::public.staff_role
  end;
$$;

create or replace function private.sync_staff_profile_from_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth, private
as $$
declare
  resolved_full_name text;
  resolved_is_active boolean;
begin
  resolved_full_name := coalesce(
    nullif(trim(coalesce(new.raw_user_meta_data->>'full_name', '')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data->>'name', '')), ''),
    nullif(trim(split_part(coalesce(new.email, ''), '@', 1)), ''),
    'School Staff'
  );

  resolved_is_active := case
    when jsonb_typeof(new.raw_app_meta_data -> 'is_active') = 'boolean' then
      (new.raw_app_meta_data->>'is_active')::boolean
    else
      true
  end;

  insert into public.users (
    id,
    full_name,
    role,
    phone,
    is_active,
    last_login_at
  )
  values (
    new.id,
    resolved_full_name,
    private.normalize_staff_role(new.raw_app_meta_data->>'staff_role'),
    nullif(trim(coalesce(new.raw_user_meta_data->>'phone', new.raw_user_meta_data->>'phone_number', '')), ''),
    resolved_is_active,
    new.last_sign_in_at
  )
  on conflict (id) do update
  set
    full_name = excluded.full_name,
    role = excluded.role,
    phone = excluded.phone,
    is_active = excluded.is_active,
    last_login_at = excluded.last_login_at,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists sync_staff_profile_from_auth_users on auth.users;
create trigger sync_staff_profile_from_auth_users
after insert or update of email, raw_user_meta_data, raw_app_meta_data, last_sign_in_at
on auth.users
for each row execute function private.sync_staff_profile_from_auth_user();

insert into public.users (
  id,
  full_name,
  role,
  phone,
  is_active,
  last_login_at
)
select
  au.id,
  coalesce(
    nullif(trim(coalesce(au.raw_user_meta_data->>'full_name', '')), ''),
    nullif(trim(coalesce(au.raw_user_meta_data->>'name', '')), ''),
    nullif(trim(split_part(coalesce(au.email, ''), '@', 1)), ''),
    'School Staff'
  ) as full_name,
  private.normalize_staff_role(au.raw_app_meta_data->>'staff_role') as role,
  nullif(trim(coalesce(au.raw_user_meta_data->>'phone', au.raw_user_meta_data->>'phone_number', '')), '') as phone,
  case
    when jsonb_typeof(au.raw_app_meta_data -> 'is_active') = 'boolean' then
      (au.raw_app_meta_data->>'is_active')::boolean
    else
      true
  end as is_active,
  au.last_sign_in_at as last_login_at
from auth.users as au
on conflict (id) do update
set
  full_name = excluded.full_name,
  role = excluded.role,
  phone = excluded.phone,
  is_active = excluded.is_active,
  last_login_at = excluded.last_login_at,
  updated_at = now();
