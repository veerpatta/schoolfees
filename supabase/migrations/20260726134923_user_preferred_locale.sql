-- Per-account app language.
--
-- Until now the staff locale lived only in the `vpps_locale` cookie, so a
-- clerk who signed in on the counter tablet and then on their own phone got
-- English again. The phone design promises the opposite ("saved to your
-- login — every device you use shows this language"), so the preference has
-- to be on the account.
--
-- Both accessors are SECURITY DEFINER because RLS on public.users gates
-- SELECT on has_any_permission(...) and UPDATE on has_permission('staff:manage').
-- A counter-staff account can therefore neither read nor write its own row,
-- and Postgres RLS cannot be narrowed to a single column. A definer function
-- scoped to `where id = auth.uid()` and to this one column is the narrowest
-- grant that does the job — it can never touch role, is_active or another
-- user's row.

alter table public.users
  add column if not exists preferred_locale text;

-- 'hi-en' stays valid even though the phone picker offers only English and
-- हिंदी: existing Hinglish users must not be stranded, and narrowing the UI
-- is a reversible product call while a CHECK constraint is not.
alter table public.users
  drop constraint if exists users_preferred_locale_check;

alter table public.users
  add constraint users_preferred_locale_check
  check (preferred_locale is null or preferred_locale in ('en', 'hi', 'hi-en'));

comment on column public.users.preferred_locale is
  'Staff app language. NULL = follow the vpps_locale cookie, then the default.';

create or replace function public.set_my_preferred_locale(p_locale text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_locale is not null and p_locale not in ('en', 'hi', 'hi-en') then
    raise exception 'Unsupported locale %', p_locale;
  end if;

  -- The `is distinct from` guard is load-bearing, not an optimisation.
  -- private.capture_audit_event() is column-agnostic: it writes a full
  -- to_jsonb(new) row snapshot into audit_logs on EVERY update. Without
  -- this, each tap on the language card would append a complete user
  -- record. Now only a genuine change is audited, which is the behaviour
  -- we actually want from an audit log.
  update public.users
     set preferred_locale = p_locale
   where id = auth.uid()
     and preferred_locale is distinct from p_locale;
end;
$$;

create or replace function public.get_my_preferred_locale()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select preferred_locale from public.users where id = auth.uid();
$$;

revoke all on function public.set_my_preferred_locale(text) from public;
revoke all on function public.get_my_preferred_locale() from public;

grant execute on function public.set_my_preferred_locale(text) to authenticated;
grant execute on function public.get_my_preferred_locale() to authenticated;
