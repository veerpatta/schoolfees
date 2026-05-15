create table if not exists public.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

drop policy if exists "authenticated can read app_settings" on public.app_settings;
create policy "authenticated can read app_settings" on public.app_settings
  for select to authenticated using (true);

drop policy if exists "settings:write can update app_settings" on public.app_settings;
create policy "settings:write can update app_settings" on public.app_settings
  for all to authenticated
  using (public.has_permission('settings:write'))
  with check (public.has_permission('settings:write'));

grant select, insert, update, delete on public.app_settings to authenticated;

insert into public.app_settings (key, value)
select 'active_session_label', academic_session_label
from public.fee_policy_configs
where is_active = true
order by updated_at desc
limit 1
on conflict (key) do update
set value = excluded.value,
    updated_at = now();

create or replace function public.active_session_label()
returns text
language sql
stable
set search_path = public
as $$
  select value from public.app_settings where key = 'active_session_label'
$$;

grant execute on function public.active_session_label() to authenticated;
