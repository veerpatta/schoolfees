-- Pre-change snapshot of every installment's late-fee position.
--
-- This table exists for exactly one reason: once the late-fee rule is unified
-- (next migration), `raw_late_fee` under the OLD rule is unrecoverable. Both
-- the waiver backfill and the verification script need it.
--
-- Background. Two engines disagreed on when a Rs 1,000 late fee is owed:
--
--   private.workbook_installment_snapshot  (Payment Desk, posting RPC, waiver)
--     charged as soon as an installment was overdue, but dropped the charge to
--     zero the moment the base was fully paid.
--   v_workbook_installment_balances        (dashboard, defaulters, profile)
--     charged only once a payment actually landed after the due date, so a
--     never-paid defaulter read Rs 0.
--
-- The school has chosen "overdue means owed, and it stays owed", applied
-- identically in both engines. Measured on 2026-08-08 that newly charges 550
-- installments across 393 of 512 active students in the live 2026-27 session
-- (+Rs 5,50,000), so the change is being GRANDFATHERED: every installment
-- already overdue on the cut-over date receives an offsetting per-installment
-- waiver, and no family's late fee goes up as a result of the rule change.
-- Installments not yet due (INST 3, INST 4) are untouched and will charge
-- normally when their due date passes.
--
-- The guarantee the backfill must satisfy, verified against this table:
--
--     for every installment:  final_late_fee_after == final_late_fee_before
--
-- Retained after the cut-over as the audit record of what changed. It is not
-- read by application code — RLS is on with no policies, so `authenticated`
-- cannot see it and only the service role (which bypasses RLS) can.

-- Take a fresh, non-concurrent refresh first. The snapshot must record what the
-- office is actually being shown, not a stale projection, or the before/after
-- diff would attribute staleness to the rule change. Non-concurrent is
-- deliberate: it is transaction-safe (CONCURRENTLY is not) and this matview is
-- small enough that the brief exclusive lock is not felt.
refresh materialized view public.v_workbook_installment_balances;
refresh materialized view public.v_workbook_student_financials;
refresh materialized view public.v_student_financial_state;

create table public.late_fee_rule_change_snapshot (
  installment_id   uuid primary key,
  student_id       uuid    not null,
  session_label    text    not null,
  installment_no   smallint,
  due_date         date,
  base_charge      integer not null,
  applied_amount   integer not null,
  raw_late_fee     integer not null,
  waiver_applied   integer not null,
  final_late_fee   integer not null,
  pending_amount   integer not null,
  captured_at      timestamptz not null default now()
);

comment on table public.late_fee_rule_change_snapshot is
  'Immutable pre-cut-over record of every installment''s late-fee position under the OLD (pre-unification) rule. Read by the waiver backfill and by scripts/verify-late-fee-health.mjs. Never read by application code.';

insert into public.late_fee_rule_change_snapshot (
  installment_id, student_id, session_label, installment_no, due_date,
  base_charge, applied_amount, raw_late_fee, waiver_applied, final_late_fee, pending_amount
)
select
  b.installment_id, b.student_id, b.session_label, b.installment_no, b.due_date,
  b.base_charge, b.applied_amount, b.raw_late_fee, b.waiver_applied, b.final_late_fee, b.pending_amount
from public.v_workbook_installment_balances as b;

-- Also record the student-level waiver pools as they stood, so the backfill can
-- report any pool that could not be allocated to a real charge.
create table public.late_fee_waiver_pool_snapshot (
  student_id        uuid primary key,
  pool_amount       integer not null,
  override_reason   text,
  override_updated_at timestamptz,
  captured_at       timestamptz not null default now()
);

comment on table public.late_fee_waiver_pool_snapshot is
  'Immutable pre-cut-over record of student_fee_overrides.late_fee_waiver_amount, the student-level waiver pool that public.student_late_fee_waivers replaces.';

insert into public.late_fee_waiver_pool_snapshot (
  student_id, pool_amount, override_reason, override_updated_at
)
select o.student_id, o.late_fee_waiver_amount, o.reason, o.updated_at
from public.student_fee_overrides as o
where o.is_active = true
  and coalesce(o.late_fee_waiver_amount, 0) > 0;

-- Service-role only. RLS on, zero policies: `authenticated` sees nothing,
-- service_role bypasses RLS entirely.
alter table public.late_fee_rule_change_snapshot enable row level security;
alter table public.late_fee_waiver_pool_snapshot enable row level security;

revoke all on table public.late_fee_rule_change_snapshot from public, anon, authenticated;
revoke all on table public.late_fee_waiver_pool_snapshot  from public, anon, authenticated;
grant all on table public.late_fee_rule_change_snapshot to service_role;
grant all on table public.late_fee_waiver_pool_snapshot  to service_role;

notify pgrst, 'reload schema';
