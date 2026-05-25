-- Expand staff_role enum from 3 roles to 5.
-- New canonical roles: admin, accountant, teacher, defaulter_followup, view_only
-- read_only_staff is renamed to view_only via ALTER TYPE RENAME VALUE; the
-- normalize function continues to accept "read_only_staff" as a
-- backward-compatible alias for one release so any in-flight auth metadata
-- still resolves cleanly.

-- check_function_bodies = off defers enum-cast resolution in the function
-- bodies below until first call, by which time this transaction has
-- committed and the new 'teacher' / 'defaulter_followup' values are fully
-- usable (PG's "new value cannot be used in the same transaction" rule).
set check_function_bodies = off;

-- 1) Add the two new enum values. ADD VALUE IF NOT EXISTS is a no-op when
-- the value already exists, so re-runs on already-migrated databases skip
-- cleanly. Mutating in place (vs. type-swap) avoids tripping over the
-- function/policy/test-view dependencies that previously blocked DROP TYPE.
alter type public.staff_role add value if not exists 'teacher';
alter type public.staff_role add value if not exists 'defaulter_followup';

-- 2) Rename read_only_staff to view_only. Guarded so already-renamed
-- databases (view_only present, read_only_staff absent) become no-ops.
do $$
begin
  if exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'staff_role'
      and e.enumlabel = 'read_only_staff'
  )
  and not exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'staff_role'
      and e.enumlabel = 'view_only'
  ) then
    execute 'alter type public.staff_role rename value ''read_only_staff'' to ''view_only''';
  end if;
end
$$;

-- 3) Default rows to view_only.
alter table public.users
  alter column role set default 'view_only';

-- 4) Refresh normalize_staff_role to recognize the new role names and keep
-- "read_only_staff" working as an alias for view_only.
create or replace function private.normalize_staff_role(p_role text)
returns public.staff_role
language sql
immutable
set search_path = public, private
as $$
  select case trim(coalesce(p_role, ''))
    when 'admin' then 'admin'::public.staff_role
    when 'accountant' then 'accountant'::public.staff_role
    when 'teacher' then 'teacher'::public.staff_role
    when 'defaulter_followup' then 'defaulter_followup'::public.staff_role
    when 'view_only' then 'view_only'::public.staff_role
    when 'read_only_staff' then 'view_only'::public.staff_role
    else 'view_only'::public.staff_role
  end;
$$;

-- 5) current_staff_role had read_only_staff baked into its body; rewrite it
-- before any caller exercises the new enum.
create or replace function private.current_staff_role()
returns public.staff_role
language sql
stable
security definer
set search_path = public, auth, private
as $$
  select coalesce(
    (
      select u.role
      from public.users as u
      where u.id = auth.uid()
        and u.is_active = true
      limit 1
    ),
    'view_only'::public.staff_role
  );
$$;

revoke all on function private.current_staff_role() from public;
revoke all on function private.current_staff_role() from anon;
grant execute on function private.current_staff_role() to authenticated;

-- 6) has_permission gets a branch per role. New permissions introduced this
-- migration: students:edit_basic, students:edit_sr_no, contacts:write,
-- payments:waive_late_fee.
create or replace function public.has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public, auth, private
as $$
  select auth.uid() is not null
    and case private.current_staff_role()
      when 'admin'::public.staff_role then true
      when 'accountant'::public.staff_role then p_permission = any (
        array[
          'dashboard:view',
          'students:view',
          'fees:view',
          'payments:view',
          'payments:write',
          'payments:waive_late_fee',
          'finance:view',
          'finance:write',
          'ledger:view',
          'receipts:view',
          'receipts:print',
          'defaulters:view',
          'contacts:write',
          'reports:view'
        ]
      )
      when 'teacher'::public.staff_role then p_permission = any (
        array[
          'dashboard:view',
          'students:view',
          'students:edit_basic',
          'defaulters:view'
        ]
      )
      when 'defaulter_followup'::public.staff_role then p_permission = any (
        array[
          'students:view',
          'defaulters:view',
          'contacts:write'
        ]
      )
      when 'view_only'::public.staff_role then p_permission = any (
        array[
          'dashboard:view',
          'students:view',
          'fees:view',
          'payments:view',
          'ledger:view',
          'receipts:view',
          'defaulters:view',
          'imports:view',
          'reports:view'
        ]
      )
      else false
    end;
$$;

revoke all on function public.has_permission(text) from public;
revoke all on function public.has_permission(text) from anon;
grant execute on function public.has_permission(text) to authenticated;
