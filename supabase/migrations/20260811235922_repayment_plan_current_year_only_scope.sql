-- A third EMI shape: current year only.
--
-- Families arrange this three ways, not two. Some clear last year monthly and
-- keep this year on the normal four installments; some put the whole current
-- year on EMI and settle last year separately; some combine both. Only the
-- first and third existed.
--
-- One function decides what a scope covers, so this is a one-line rule change
-- plus the enumerations that have to learn the new value.

alter table public.student_repayment_plans
  drop constraint if exists student_repayment_plans_scope_check;

alter table public.student_repayment_plans
  add constraint student_repayment_plans_scope_check
  check (scope in ('old_balance_only', 'current_year_only', 'old_and_current'));

create or replace function private.repayment_plan_candidates(
  p_student_id uuid,
  p_session_label text,
  p_scope text,
  p_as_of date default current_date
)
returns table (
  installment_id uuid,
  installment_no smallint,
  installment_label text,
  due_date date,
  is_carry_forward boolean,
  base_charge integer,
  base_pending integer,
  charged_late_fee integer,
  late_fee_flat_amount integer
)
language sql
stable
set search_path to 'public', 'private', 'pg_temp'
as $function$
  select
    snap.installment_id,
    snap.installment_no,
    snap.installment_label,
    snap.due_date,
    coalesce(inst.is_carry_forward, false) as is_carry_forward,
    snap.base_charge,
    greatest(snap.pending_amount - snap.final_late_fee, 0)::integer as base_pending,
    greatest(least(snap.final_late_fee, snap.pending_amount), 0)::integer as charged_late_fee,
    coalesce(inst.late_fee_flat_amount, 0)::integer as late_fee_flat_amount
  from private.workbook_installment_snapshot(p_student_id, p_as_of, true) as snap
  join public.installments as inst on inst.id = snap.installment_id
  where snap.session_label = p_session_label
    and greatest(snap.pending_amount - snap.final_late_fee, 0) > 0
    and (
      p_scope = 'old_and_current'
      or (p_scope = 'old_balance_only'  and coalesce(inst.is_carry_forward, false))
      or (p_scope = 'current_year_only' and not coalesce(inst.is_carry_forward, false))
    )
  order by snap.due_date asc, snap.installment_no asc;
$function$;
