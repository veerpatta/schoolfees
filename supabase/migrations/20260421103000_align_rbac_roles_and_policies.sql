-- Align app and database RBAC model
-- Canonical roles: admin, accountant, read_only_staff

set check_function_bodies = off;

-- 1) Migrate legacy enum values to canonical values.
do $$
begin
  if exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'staff_role'
  )
  and exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'staff_role'
      and e.enumlabel in ('accounts', 'clerk')
  ) then
    create type public.staff_role_v2 as enum ('admin', 'accountant', 'read_only_staff');

    alter table public.users
      alter column role drop default,
      alter column role type public.staff_role_v2
      using (
        case role::text
          when 'admin' then 'admin'
          when 'accounts' then 'accountant'
          when 'clerk' then 'read_only_staff'
          else 'read_only_staff'
        end::public.staff_role_v2
      );

    drop type public.staff_role;
    alter type public.staff_role_v2 rename to staff_role;
  end if;
end
$$;

alter table public.users
  alter column role set default 'read_only_staff';

-- 2) Database-side role and permission helpers.
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
    'read_only_staff'::public.staff_role
  );
$$;

revoke all on function private.current_staff_role() from public;
revoke all on function private.current_staff_role() from anon;
grant execute on function private.current_staff_role() to authenticated;

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
          'payments:view',
          'payments:write',
          'ledger:view',
          'receipts:view',
          'receipts:print',
          'defaulters:view'
        ]
      )
      when 'read_only_staff'::public.staff_role then p_permission = any (
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

create or replace function public.has_any_permission(p_permissions text[])
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from unnest(coalesce(p_permissions, array[]::text[])) as permission_name
    where public.has_permission(permission_name)
  );
$$;

revoke all on function public.has_any_permission(text[]) from public;
revoke all on function public.has_any_permission(text[]) from anon;
grant execute on function public.has_any_permission(text[]) to authenticated;

-- 3) Replace broad authenticated policies with RBAC policies.
drop policy if exists "authenticated can read users" on public.users;
create policy "authenticated can read users"
on public.users for select
to authenticated
using (public.has_any_permission(array['dashboard:view', 'ledger:view', 'receipts:view', 'staff:manage']));

drop policy if exists "authenticated can insert users" on public.users;
create policy "authenticated can insert users"
on public.users for insert
to authenticated
with check (public.has_permission('staff:manage'));

drop policy if exists "authenticated can update users" on public.users;
create policy "authenticated can update users"
on public.users for update
to authenticated
using (public.has_permission('staff:manage'))
with check (public.has_permission('staff:manage'));

drop policy if exists "authenticated can read classes" on public.classes;
create policy "authenticated can read classes"
on public.classes for select
to authenticated
using (public.has_any_permission(array['dashboard:view', 'students:view', 'fees:view', 'payments:view', 'defaulters:view']));

drop policy if exists "authenticated can insert classes" on public.classes;
create policy "authenticated can insert classes"
on public.classes for insert
to authenticated
with check (public.has_permission('fees:write'));

drop policy if exists "authenticated can update classes" on public.classes;
create policy "authenticated can update classes"
on public.classes for update
to authenticated
using (public.has_permission('fees:write'))
with check (public.has_permission('fees:write'));

drop policy if exists "authenticated can read transport routes" on public.transport_routes;
create policy "authenticated can read transport routes"
on public.transport_routes for select
to authenticated
using (public.has_any_permission(array['students:view', 'fees:view', 'defaulters:view']));

drop policy if exists "authenticated can insert transport routes" on public.transport_routes;
create policy "authenticated can insert transport routes"
on public.transport_routes for insert
to authenticated
with check (public.has_permission('fees:write'));

drop policy if exists "authenticated can update transport routes" on public.transport_routes;
create policy "authenticated can update transport routes"
on public.transport_routes for update
to authenticated
using (public.has_permission('fees:write'))
with check (public.has_permission('fees:write'));

drop policy if exists "authenticated can read students" on public.students;
create policy "authenticated can read students"
on public.students for select
to authenticated
using (public.has_any_permission(array['students:view', 'payments:view', 'ledger:view', 'receipts:view', 'defaulters:view', 'dashboard:view']));

drop policy if exists "authenticated can insert students" on public.students;
create policy "authenticated can insert students"
on public.students for insert
to authenticated
with check (public.has_permission('students:write'));

drop policy if exists "authenticated can update students" on public.students;
create policy "authenticated can update students"
on public.students for update
to authenticated
using (public.has_permission('students:write'))
with check (public.has_permission('students:write'));

drop policy if exists "authenticated can read fee settings" on public.fee_settings;
create policy "authenticated can read fee settings"
on public.fee_settings for select
to authenticated
using (public.has_permission('fees:view'));

drop policy if exists "authenticated can insert fee settings" on public.fee_settings;
create policy "authenticated can insert fee settings"
on public.fee_settings for insert
to authenticated
with check (public.has_permission('fees:write'));

drop policy if exists "authenticated can update fee settings" on public.fee_settings;
create policy "authenticated can update fee settings"
on public.fee_settings for update
to authenticated
using (public.has_permission('fees:write'))
with check (public.has_permission('fees:write'));

drop policy if exists "authenticated can read school fee defaults" on public.school_fee_defaults;
create policy "authenticated can read school fee defaults"
on public.school_fee_defaults for select
to authenticated
using (public.has_permission('fees:view'));

drop policy if exists "authenticated can insert school fee defaults" on public.school_fee_defaults;
create policy "authenticated can insert school fee defaults"
on public.school_fee_defaults for insert
to authenticated
with check (public.has_permission('fees:write'));

drop policy if exists "authenticated can update school fee defaults" on public.school_fee_defaults;
create policy "authenticated can update school fee defaults"
on public.school_fee_defaults for update
to authenticated
using (public.has_permission('fees:write'))
with check (public.has_permission('fees:write'));

drop policy if exists "authenticated can read student fee overrides" on public.student_fee_overrides;
create policy "authenticated can read student fee overrides"
on public.student_fee_overrides for select
to authenticated
using (public.has_permission('fees:view'));

drop policy if exists "authenticated can insert student fee overrides" on public.student_fee_overrides;
create policy "authenticated can insert student fee overrides"
on public.student_fee_overrides for insert
to authenticated
with check (public.has_permission('fees:write'));

drop policy if exists "authenticated can update student fee overrides" on public.student_fee_overrides;
create policy "authenticated can update student fee overrides"
on public.student_fee_overrides for update
to authenticated
using (public.has_permission('fees:write'))
with check (public.has_permission('fees:write'));

drop policy if exists "authenticated can read installments" on public.installments;
create policy "authenticated can read installments"
on public.installments for select
to authenticated
using (public.has_any_permission(array['fees:view', 'payments:view', 'ledger:view', 'defaulters:view']));

drop policy if exists "authenticated can insert installments" on public.installments;
create policy "authenticated can insert installments"
on public.installments for insert
to authenticated
with check (public.has_permission('fees:write'));

drop policy if exists "authenticated can update installments" on public.installments;
create policy "authenticated can update installments"
on public.installments for update
to authenticated
using (public.has_permission('fees:write'))
with check (public.has_permission('fees:write'));

drop policy if exists "authenticated can read receipts" on public.receipts;
create policy "authenticated can read receipts"
on public.receipts for select
to authenticated
using (public.has_any_permission(array['payments:view', 'ledger:view', 'receipts:view', 'dashboard:view']));

drop policy if exists "authenticated can insert receipts" on public.receipts;
create policy "authenticated can insert receipts"
on public.receipts for insert
to authenticated
with check (public.has_permission('payments:write'));

drop policy if exists "authenticated can read payments" on public.payments;
create policy "authenticated can read payments"
on public.payments for select
to authenticated
using (public.has_any_permission(array['payments:view', 'ledger:view', 'receipts:view', 'dashboard:view']));

drop policy if exists "authenticated can insert payments" on public.payments;
create policy "authenticated can insert payments"
on public.payments for insert
to authenticated
with check (public.has_permission('payments:write'));

drop policy if exists "authenticated can read payment adjustments" on public.payment_adjustments;
create policy "authenticated can read payment adjustments"
on public.payment_adjustments for select
to authenticated
using (public.has_any_permission(array['ledger:view', 'defaulters:view', 'dashboard:view']));

drop policy if exists "authenticated can insert payment adjustments" on public.payment_adjustments;
create policy "authenticated can insert payment adjustments"
on public.payment_adjustments for insert
to authenticated
with check (public.has_permission('payments:adjust'));

drop policy if exists "authenticated can read audit logs" on public.audit_logs;
create policy "authenticated can read audit logs"
on public.audit_logs for select
to authenticated
using (public.has_permission('staff:manage'));

-- 4) Protect payment posting RPC at function level.
create or replace function public.post_student_payment(
  p_student_id uuid,
  p_payment_date date,
  p_payment_mode public.payment_mode,
  p_total_amount integer,
  p_reference_number text default null,
  p_remarks text default null,
  p_received_by text default null,
  p_receipt_prefix text default 'SVP'
)
returns table (
  receipt_id uuid,
  receipt_number text,
  allocated_total integer
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  balance_row record;
  allocation_amount integer;
  remaining_amount integer;
  daily_sequence integer;
  candidate_receipt_number text;
  candidate_receipt_id uuid;
  total_outstanding integer;
  normalized_prefix text;
begin
  if not public.has_permission('payments:write') then
    raise exception 'You do not have permission to post payments.';
  end if;

  if p_total_amount is null or p_total_amount <= 0 then
    raise exception 'Payment amount must be greater than 0.';
  end if;

  if p_payment_date is null then
    raise exception 'Payment date is required.';
  end if;

  if p_student_id is null then
    raise exception 'Student is required.';
  end if;

  if not exists (select 1 from public.students where id = p_student_id) then
    raise exception 'Selected student was not found.';
  end if;

  normalized_prefix := nullif(trim(coalesce(p_receipt_prefix, '')), '');

  if normalized_prefix is null then
    normalized_prefix := 'SVP';
  end if;

  select coalesce(sum(outstanding_amount), 0)
  into total_outstanding
  from public.v_installment_balances
  where student_id = p_student_id
    and outstanding_amount > 0;

  if total_outstanding <= 0 then
    raise exception 'No pending dues are available for this student.';
  end if;

  if p_total_amount > total_outstanding then
    raise exception 'Payment amount cannot exceed total pending amount.';
  end if;

  select coalesce(
    max((regexp_match(receipt_number, '-([0-9]{4})$'))[1]::integer),
    0
  )
  into daily_sequence
  from public.receipts
  where receipt_number like normalized_prefix || to_char(p_payment_date, 'YYYYMMDD') || '-%';

  for _attempt in 1..12 loop
    daily_sequence := daily_sequence + 1;
    candidate_receipt_number :=
      normalized_prefix || to_char(p_payment_date, 'YYYYMMDD') || '-' || lpad(daily_sequence::text, 4, '0');

    begin
      insert into public.receipts (
        receipt_number,
        student_id,
        payment_date,
        payment_mode,
        total_amount,
        reference_number,
        notes,
        received_by
      )
      values (
        candidate_receipt_number,
        p_student_id,
        p_payment_date,
        p_payment_mode,
        p_total_amount,
        nullif(trim(coalesce(p_reference_number, '')), ''),
        nullif(trim(coalesce(p_remarks, '')), ''),
        nullif(trim(coalesce(p_received_by, '')), '')
      )
      returning id into candidate_receipt_id;

      exit;
    exception
      when unique_violation then
        continue;
    end;
  end loop;

  if candidate_receipt_id is null then
    raise exception 'Unable to generate a unique receipt number. Please retry.';
  end if;

  remaining_amount := p_total_amount;

  for balance_row in
    select installment_id, outstanding_amount
    from public.v_installment_balances
    where student_id = p_student_id
      and outstanding_amount > 0
    order by due_date asc, installment_no asc
  loop
    exit when remaining_amount <= 0;

    allocation_amount := least(remaining_amount, balance_row.outstanding_amount);

    if allocation_amount <= 0 then
      continue;
    end if;

    insert into public.payments (
      receipt_id,
      student_id,
      installment_id,
      amount,
      notes
    )
    values (
      candidate_receipt_id,
      p_student_id,
      balance_row.installment_id,
      allocation_amount,
      nullif(trim(coalesce(p_remarks, '')), '')
    );

    remaining_amount := remaining_amount - allocation_amount;
  end loop;

  if remaining_amount <> 0 then
    raise exception 'Unable to allocate payment cleanly. Please retry.';
  end if;

  return query
  select
    candidate_receipt_id as receipt_id,
    candidate_receipt_number as receipt_number,
    p_total_amount as allocated_total;
end;
$$;

grant execute on function public.post_student_payment(
  uuid,
  date,
  public.payment_mode,
  integer,
  text,
  text,
  text,
  text
) to authenticated;
