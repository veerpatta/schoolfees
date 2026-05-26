-- Rename staff_role 'defaulter_followup' to 'fee_collector' and rebalance
-- the has_permission matrix to match the 5-role spec:
--   Admin           — full access (no change)
--   Accountant      — payment-entry + waiver + receipt-print; views everything
--                     else; no finance:write / contacts:write any more.
--   Teacher         — :view across the app + students:edit_basic.
--   Fee Collector   — defaults to Defaulters; contacts:write; reads every tab.
--   Viewer (view_only) — practical read-only: Dashboard, Students, Defaulters,
--                     Receipts only.
--
-- "ALTER TYPE … RENAME VALUE" rewires every enum reference (users.role rows,
-- function bodies, policy expressions) to point at the renamed label, so no
-- row-level updates are needed and existing user records stay valid.
-- normalize_staff_role keeps "defaulter_followup" (and the older
-- "read_only_staff") accepted as text aliases so any cached JWT or
-- in-flight session metadata still resolves cleanly after this lands.

-- Defer enum-cast resolution in the function bodies below until first call,
-- by which time this transaction has committed and the renamed value is
-- usable (PG's "new value cannot be used in the same transaction" rule).
set check_function_bodies = off;

-- 1) Rename the enum value. Guarded for re-runnability: skip when the new
-- name is already present (already-migrated databases become no-ops).
do $$
begin
  if exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'staff_role'
      and e.enumlabel = 'defaulter_followup'
  )
  and not exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'staff_role'
      and e.enumlabel = 'fee_collector'
  ) then
    execute 'alter type public.staff_role rename value ''defaulter_followup'' to ''fee_collector''';
  end if;
end
$$;

-- Make sure 'fee_collector' is present even if the enum was rebuilt fresh
-- (e.g. on a brand-new project that never had 'defaulter_followup').
alter type public.staff_role add value if not exists 'fee_collector';

-- 2) Refresh normalize_staff_role: accept the new canonical label and keep
-- the old "defaulter_followup" / "read_only_staff" text strings as aliases
-- for one release so any cached JWT metadata still resolves.
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
    when 'fee_collector' then 'fee_collector'::public.staff_role
    when 'defaulter_followup' then 'fee_collector'::public.staff_role
    when 'view_only' then 'view_only'::public.staff_role
    when 'read_only_staff' then 'view_only'::public.staff_role
    else 'view_only'::public.staff_role
  end;
$$;

-- 3) current_staff_role keeps the same signature; rewrite to reference the
-- renamed enum value cleanly.
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

-- 4) has_permission: rebalanced to the new matrix. Mirrors lib/auth/roles.ts
-- exactly; the staff-roles unit test asserts the TS side, and the
-- has-permission integration tests assert this SQL side. Drift between the
-- two surfaces shows up immediately.
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
          'ledger:view',
          'receipts:view',
          'receipts:print',
          'defaulters:view',
          'imports:view',
          'reports:view',
          'settings:view'
        ]
      )
      when 'teacher'::public.staff_role then p_permission = any (
        array[
          'dashboard:view',
          'students:view',
          'students:edit_basic',
          'fees:view',
          'payments:view',
          'finance:view',
          'ledger:view',
          'receipts:view',
          'defaulters:view',
          'imports:view',
          'reports:view',
          'settings:view'
        ]
      )
      when 'fee_collector'::public.staff_role then p_permission = any (
        array[
          'dashboard:view',
          'students:view',
          'fees:view',
          'payments:view',
          'finance:view',
          'ledger:view',
          'receipts:view',
          'defaulters:view',
          'contacts:write',
          'imports:view',
          'reports:view',
          'settings:view'
        ]
      )
      when 'view_only'::public.staff_role then p_permission = any (
        array[
          'dashboard:view',
          'students:view',
          'defaulters:view',
          'receipts:view'
        ]
      )
      else false
    end;
$$;

revoke all on function public.has_permission(text) from public;
revoke all on function public.has_permission(text) from anon;
grant execute on function public.has_permission(text) to authenticated;
