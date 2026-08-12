-- Replace the EMI late-fee mechanism.
--
-- WHAT WAS THERE: activation granted a waiver on each covered installment's
-- flat late fee, and a nightly job VOIDED one of those waivers per missed EMI
-- to make the fee reappear. Two structural failures:
--
--   1. Capped at one fee per covered installment. A plan covering a single
--      installment could charge Rs1,000 no matter how many months were missed.
--   2. All 77 carry-forward rows carry late_fee_flat_amount = 0, so a
--      previous-year-only plan had nothing to release and could never charge.
--
-- WHAT REPLACES IT: each missed EMI inserts its own installment carrying a flat
-- Rs1,000 and nothing else. Uncapped, scope-blind, and collectable through the
-- one money path because it is a real installment.
--
-- NOTE, deliberately NOT following the written plan: the plan said to stop
-- granting the blanket waiver at activation and forgive only what was already
-- charged. Implementing that would DOUBLE-charge — installment 3 sitting inside
-- a plan would fire its own Rs1,000 when its original due date passed, on top
-- of the Rs1,000 for the EMI missed that same month. Converting moves a family
-- onto a new calendar, so the old calendar's penalties must stop. The blanket
-- waiver stays; the EMI calendar carries the only penalty.

create table if not exists public.student_repayment_emi_late_fees (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.student_repayment_plans (id) on delete restrict,
  student_id uuid not null references public.students (id) on delete restrict,
  session_label text not null,
  sequence_no smallint not null,
  emi_due_date date not null,
  amount integer not null check (amount > 0),
  -- The installment that makes this charge collectable. One per row.
  backing_installment_id uuid not null references public.installments (id) on delete restrict,
  charged_at timestamptz not null default now(),
  -- Idempotency: one late fee per missed EMI, however often the job runs.
  constraint student_repayment_emi_late_fees_one_per_emi unique (plan_id, sequence_no),
  constraint student_repayment_emi_late_fees_one_per_installment unique (backing_installment_id)
);

comment on table public.student_repayment_emi_late_fees is
  'One row per EMI that went past its due date unpaid. Append-only. Each row '
  'points at the zero-base installment carrying the Rs1,000 charge, so the fee '
  'is collectable, refundable, receiptable and waivable through the ordinary '
  'late-fee flow.';

create index if not exists student_repayment_emi_late_fees_plan_idx
  on public.student_repayment_emi_late_fees (plan_id, sequence_no);
create index if not exists student_repayment_emi_late_fees_student_idx
  on public.student_repayment_emi_late_fees (student_id, session_label);

alter table public.student_repayment_emi_late_fees enable row level security;

drop policy if exists "staff can read emi late fees" on public.student_repayment_emi_late_fees;
create policy "staff can read emi late fees"
  on public.student_repayment_emi_late_fees for select to authenticated
  using ((select public.has_any_permission(
    array['fees:view', 'payments:view', 'defaulters:view', 'dashboard:view'])));

-- No INSERT policy: only the SECURITY DEFINER job writes here.

drop trigger if exists student_repayment_emi_late_fees_write_once
  on public.student_repayment_emi_late_fees;
create trigger student_repayment_emi_late_fees_write_once
  before update on public.student_repayment_emi_late_fees
  for each row execute function private.prevent_repayment_row_update();

drop trigger if exists audit_student_repayment_emi_late_fees
  on public.student_repayment_emi_late_fees;
create trigger audit_student_repayment_emi_late_fees
  after insert or delete on public.student_repayment_emi_late_fees
  for each row execute function private.capture_audit_event();

grant select on public.student_repayment_emi_late_fees to authenticated;
grant select, insert on public.student_repayment_emi_late_fees to service_role;

-- An EMI late fee is a charge the plan created. It must never be swallowed back
-- into a plan as principal on a reschedule — that would fold the penalty into
-- the debt and then waive it.
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
    and not coalesce(inst.is_emi_late_fee, false)
    and (
      p_scope = 'old_and_current'
      or (p_scope = 'old_balance_only'  and coalesce(inst.is_carry_forward, false))
      or (p_scope = 'current_year_only' and not coalesce(inst.is_carry_forward, false))
    )
  order by snap.due_date asc, snap.installment_no asc;
$function$;
