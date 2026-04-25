-- Conventional discount policies for RTE, Staff Child, and 3rd Child.
-- These rows affect revised dues only; posted receipts and payments remain append-only.

create table if not exists public.conventional_discount_policies (
  id uuid primary key default gen_random_uuid(),
  academic_session_label text not null,
  code text not null check (code in ('rte', 'staff_child', 'third_child')),
  display_name text not null,
  calculation_type text not null check (
    calculation_type in ('tuition_zero', 'tuition_percentage', 'tuition_fixed_amount')
  ),
  fixed_tuition_amount integer check (fixed_tuition_amount is null or fixed_tuition_amount >= 0),
  percentage numeric(5,2) check (percentage is null or (percentage >= 0 and percentage <= 100)),
  is_active boolean not null default true,
  sort_order integer not null default 100,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (academic_session_label, code)
);

create table if not exists public.student_family_groups (
  id uuid primary key default gen_random_uuid(),
  academic_session_label text not null,
  family_label text not null,
  guardian_name text,
  guardian_phone text,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (academic_session_label, family_label)
);

create table if not exists public.student_family_members (
  id uuid primary key default gen_random_uuid(),
  family_group_id uuid not null references public.student_family_groups(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  academic_session_label text not null,
  sibling_order integer,
  is_policy_candidate boolean not null default false,
  manual_order_override boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (family_group_id, student_id, academic_session_label)
);

create table if not exists public.student_conventional_discount_assignments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  policy_id uuid not null references public.conventional_discount_policies(id) on delete restrict,
  academic_session_label text not null,
  is_active boolean not null default true,
  applied_by uuid references auth.users(id) on delete set null,
  applied_at timestamptz not null default now(),
  reason text not null,
  notes text,
  before_tuition_amount integer not null check (before_tuition_amount >= 0),
  resulting_tuition_amount integer not null check (resulting_tuition_amount >= 0),
  calculation_snapshot jsonb not null default '{}'::jsonb,
  family_group_id uuid references public.student_family_groups(id) on delete set null,
  is_manual_override boolean not null default false,
  manual_override_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_student_conventional_discount_active_policy
on public.student_conventional_discount_assignments (student_id, academic_session_label, policy_id)
where is_active;

create index if not exists idx_conventional_discount_policies_session
on public.conventional_discount_policies (academic_session_label, is_active, sort_order);

create index if not exists idx_student_conventional_discount_student_session
on public.student_conventional_discount_assignments (student_id, academic_session_label, is_active);

create index if not exists idx_student_conventional_discount_policy
on public.student_conventional_discount_assignments (policy_id, academic_session_label, is_active);

create index if not exists idx_student_family_members_student
on public.student_family_members (student_id, academic_session_label);

create or replace function private.enforce_max_active_conventional_discounts()
returns trigger
language plpgsql
as $$
declare
  active_count integer;
begin
  if new.is_active then
    select count(*)::integer
      into active_count
    from public.student_conventional_discount_assignments as assignment
    where assignment.student_id = new.student_id
      and assignment.academic_session_label = new.academic_session_label
      and assignment.is_active = true
      and assignment.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);

    if active_count >= 2 then
      raise exception 'A student can have maximum 2 active conventional discounts for one academic year.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_max_active_conventional_discounts on public.student_conventional_discount_assignments;
create trigger enforce_max_active_conventional_discounts
before insert or update on public.student_conventional_discount_assignments
for each row execute function private.enforce_max_active_conventional_discounts();

drop trigger if exists set_updated_at_on_conventional_discount_policies on public.conventional_discount_policies;
create trigger set_updated_at_on_conventional_discount_policies
before update on public.conventional_discount_policies
for each row execute function private.set_updated_at();

drop trigger if exists set_actor_columns_on_conventional_discount_policies on public.conventional_discount_policies;
create trigger set_actor_columns_on_conventional_discount_policies
before insert or update on public.conventional_discount_policies
for each row execute function private.set_actor_columns();

drop trigger if exists set_updated_at_on_student_family_groups on public.student_family_groups;
create trigger set_updated_at_on_student_family_groups
before update on public.student_family_groups
for each row execute function private.set_updated_at();

drop trigger if exists set_actor_columns_on_student_family_groups on public.student_family_groups;
create trigger set_actor_columns_on_student_family_groups
before insert or update on public.student_family_groups
for each row execute function private.set_actor_columns();

drop trigger if exists set_updated_at_on_student_family_members on public.student_family_members;
create trigger set_updated_at_on_student_family_members
before update on public.student_family_members
for each row execute function private.set_updated_at();

drop trigger if exists set_updated_at_on_student_conventional_discount_assignments on public.student_conventional_discount_assignments;
create trigger set_updated_at_on_student_conventional_discount_assignments
before update on public.student_conventional_discount_assignments
for each row execute function private.set_updated_at();

drop trigger if exists audit_conventional_discount_policies on public.conventional_discount_policies;
create trigger audit_conventional_discount_policies
after insert or update or delete on public.conventional_discount_policies
for each row execute function private.capture_audit_event();

drop trigger if exists audit_student_family_groups on public.student_family_groups;
create trigger audit_student_family_groups
after insert or update or delete on public.student_family_groups
for each row execute function private.capture_audit_event();

drop trigger if exists audit_student_family_members on public.student_family_members;
create trigger audit_student_family_members
after insert or update or delete on public.student_family_members
for each row execute function private.capture_audit_event();

drop trigger if exists audit_student_conventional_discount_assignments on public.student_conventional_discount_assignments;
create trigger audit_student_conventional_discount_assignments
after insert or update or delete on public.student_conventional_discount_assignments
for each row execute function private.capture_audit_event();

alter table public.conventional_discount_policies enable row level security;
alter table public.student_family_groups enable row level security;
alter table public.student_family_members enable row level security;
alter table public.student_conventional_discount_assignments enable row level security;

drop policy if exists "authenticated can read conventional discount policies" on public.conventional_discount_policies;
create policy "authenticated can read conventional discount policies"
on public.conventional_discount_policies for select
to authenticated
using (public.has_any_permission(array['fees:view', 'students:view', 'reports:view']));

drop policy if exists "authenticated can write conventional discount policies" on public.conventional_discount_policies;
create policy "authenticated can write conventional discount policies"
on public.conventional_discount_policies for all
to authenticated
using (public.has_permission('fees:write'))
with check (public.has_permission('fees:write'));

drop policy if exists "authenticated can read student family groups" on public.student_family_groups;
create policy "authenticated can read student family groups"
on public.student_family_groups for select
to authenticated
using (public.has_any_permission(array['students:view', 'fees:view', 'reports:view']));

drop policy if exists "authenticated can write student family groups" on public.student_family_groups;
create policy "authenticated can write student family groups"
on public.student_family_groups for all
to authenticated
using (public.has_permission('students:write'))
with check (public.has_permission('students:write'));

drop policy if exists "authenticated can read student family members" on public.student_family_members;
create policy "authenticated can read student family members"
on public.student_family_members for select
to authenticated
using (public.has_any_permission(array['students:view', 'fees:view', 'reports:view']));

drop policy if exists "authenticated can write student family members" on public.student_family_members;
create policy "authenticated can write student family members"
on public.student_family_members for all
to authenticated
using (public.has_permission('students:write'))
with check (public.has_permission('students:write'));

drop policy if exists "authenticated can read student conventional discounts" on public.student_conventional_discount_assignments;
create policy "authenticated can read student conventional discounts"
on public.student_conventional_discount_assignments for select
to authenticated
using (public.has_any_permission(array['students:view', 'fees:view', 'payments:view', 'reports:view', 'defaulters:view']));

drop policy if exists "authenticated can write student conventional discounts" on public.student_conventional_discount_assignments;
create policy "authenticated can write student conventional discounts"
on public.student_conventional_discount_assignments for all
to authenticated
using (public.has_permission('students:write'))
with check (public.has_permission('students:write'));

insert into public.conventional_discount_policies (
  academic_session_label,
  code,
  display_name,
  calculation_type,
  fixed_tuition_amount,
  percentage,
  sort_order
)
select session_label, code, display_name, calculation_type, fixed_tuition_amount, percentage, sort_order
from (
  select distinct academic_session_label as session_label
  from public.fee_policy_configs
  where academic_session_label is not null
) as session_rows
cross join (
  values
    ('rte', 'RTE', 'tuition_zero', null::integer, null::numeric, 1),
    ('staff_child', 'Staff Child', 'tuition_percentage', null::integer, 50::numeric, 2),
    ('third_child', '3rd Child Policy', 'tuition_fixed_amount', 6000::integer, null::numeric, 3)
) as defaults(code, display_name, calculation_type, fixed_tuition_amount, percentage, sort_order)
on conflict (academic_session_label, code) do nothing;

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
          'finance:view',
          'finance:write',
          'ledger:view',
          'receipts:view',
          'receipts:print',
          'defaulters:view',
          'reports:view'
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

grant execute on function public.has_permission(text) to authenticated;

create or replace view public.v_student_financial_state
with (security_invoker = true)
as
with blocked_rows as (
  select
    student_id,
    count(*)::integer as rows_kept_for_review
  from public.config_change_blocked_installments
  group by student_id
),
financials as (
  select
    student_id,
    coalesce(total_due, greatest(gross_base_before_discount - discount_amount, 0) + coalesce(late_fee_total, 0))::integer as revised_total_due,
    coalesce(total_paid, 0)::integer as total_paid,
    coalesce(outstanding_amount, 0)::integer as installment_pending_amount
  from public.v_workbook_student_financials
)
select
  financials.student_id,
  financials.revised_total_due as total_due,
  financials.total_paid,
  greatest(financials.revised_total_due - financials.total_paid, 0)::integer as pending_amount,
  greatest(financials.total_paid - financials.revised_total_due, 0)::integer as credit_balance,
  greatest(financials.total_paid - financials.revised_total_due, 0)::integer as overpaid_amount,
  greatest(financials.total_paid - financials.revised_total_due, 0)::integer as refundable_amount,
  coalesce(blocked_rows.rows_kept_for_review, 0)::integer as rows_kept_for_review,
  financials.installment_pending_amount
from financials
left join blocked_rows
  on blocked_rows.student_id = financials.student_id;

grant select on public.v_student_financial_state to authenticated;
