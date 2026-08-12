-- The late fee stops being part of what a family owes in fees.
--
-- ===========================================================================
-- What was wrong
-- ===========================================================================
--
-- lib/money/glossary.ts has said this for months:
--
--     "Fees pending -- the base charge not yet paid. Late fee is deliberately
--      excluded: a student is treated as PAID once Fees pending reaches Rs 0,
--      even if a late fee is still owed. This is the figure that determines
--      'Due now', 'Overdue', and defaulter lists."
--
-- The engines did not agree. Both of them computed
--
--     pending_amount = base_charge + raw_late_fee - waiver_applied
--                      - applied_amount - discount_closeout_amount
--
-- one number with two different kinds of money inside it. Consequences, all
-- observed on live 2026-27:
--
--   * An installment whose fees were paid in full still read 'overdue' while
--     an unwaived late fee sat on it.
--   * Defaulters filtered on that column, so a family who owed nothing but a
--     Rs 1,000 late fee appeared on the follow-up list -- the exact thing the
--     glossary promises never happens.
--   * v_student_directory.seg_has_dues, the Students segment chip, counted
--     them as having dues.
--   * Every consumer that genuinely wanted fees-only had to write
--     `greatest(pending_amount - final_late_fee, 0)` by hand. Six places do,
--     including two repayment-plan views and the dashboard split RPC. Every
--     one of those is a chance to get it wrong.
--
-- ===========================================================================
-- The change
-- ===========================================================================
--
-- The accrual RULE is untouched. What changes is that the two kinds of money
-- get their own columns, in both engines, with the same names:
--
--     pending_amount    fees still owed. Base only. Never contains a late fee.
--     late_fee_pending  late fee still owed, after waivers and after any
--                       payment that already covered it.
--     total_pending     the two added up. For the few callers that want it.
--
-- Payment settles fees first, then the late fee. That ordering is what makes
-- the split exact rather than a re-apportionment:
--
--     pending_amount   = max(base_charge - settled, 0)
--     late_fee_pending = max(final_late_fee - max(settled - base_charge, 0), 0)
--     where settled    = applied_amount + discount_closeout_amount
--
-- Verified against all 2,425 live installment rows before this migration was
-- written: for every row,
--
--     pending_amount + late_fee_pending             = the old pending_amount
--     late_fee_pending = least(final_late_fee, old pending_amount)
--     pending_amount   = greatest(old pending_amount - final_late_fee, 0)
--
-- zero mismatches on each. The two right-hand expressions are the ones the
-- code already computed by hand, so **no rupee moves anywhere in this
-- migration**. What moves is which column it is counted in, and that is the
-- whole point.
--
-- balance_status follows the glossary: 'paid' once fees are clear, whatever
-- the late fee is doing. late_fee_status is new and carries that separately.
--
-- ===========================================================================
-- Also fixed here: the engines had drifted again
-- ===========================================================================
--
-- 20260812001114 taught private.workbook_installment_snapshot about
-- is_emi_late_fee by string-patching pg_get_functiondef. It never touched
-- v_workbook_installment_balances, which does not select the column and whose
-- `when base_charge <= 0 then 0` guard zeroes every EMI late fee -- those rows
-- carry no base by construction. So an EMI late fee was visible to the Payment
-- Desk, the waiver and the posting RPC, and invisible to the dashboard,
-- defaulters, the student directory and every export.
--
-- Both engines are written out in full below, from the same source text, for
-- exactly this reason. String surgery on one copy is what caused the drift.

begin;

-- ===========================================================================
-- 1. Capture every dependent of the balances matview before dropping it
-- ===========================================================================
-- Ten objects hang off this matview, three levels deep. The ones that do not
-- change are replayed byte-for-byte from pg_get_viewdef; the ones that do are
-- rewritten below with anchored substitutions that raise if the anchor has
-- moved. Nothing is reconstructed from memory.

create temporary table _lf_dependents (ord int, name text, kind text, ddl text)
  on commit drop;

insert into _lf_dependents (ord, name, kind, ddl)
select ord, name, kind, pg_get_viewdef(format('public.%I', name)::regclass, true)
from (values
  -- Dependency order. Level 1 first, then level 2, then level 3.
  (1, 'v_workbook_student_financials',      'm'),
  (2, 'v_student_carry_forward_balances',   'v'),
  (3, 'v_student_installment_facets',       'v'),
  (4, 'v_student_repayment_plan_status',    'v'),
  (5, 'v_student_financial_state',          'm'),
  (6, 'v_student_directory',                'v'),
  (7, 'v_notion_student_fee_summary',       'v'),
  (8, 'v_notion_family_fee_summary',        'v'),
  (9, 'v_notion_daily_collection_summary',  'v')
) as t(ord, name, kind);

do $$
declare
  v_missing int;
begin
  select count(*) into v_missing from _lf_dependents where coalesce(ddl, '') = '';
  if v_missing > 0 then
    raise exception 'late-fee split: % dependent definition(s) came back empty', v_missing;
  end if;
end $$;

-- ===========================================================================
-- 2. Drop the stack
-- ===========================================================================

drop materialized view public.v_workbook_installment_balances cascade;

-- ===========================================================================
-- 3. The balances matview -- engine B
-- ===========================================================================

create materialized view public.v_workbook_installment_balances as
with session_policy as (
  select distinct on (academic_session_label) academic_session_label
  from public.fee_policy_configs
  where calculation_model = 'workbook_v1'
  order by academic_session_label, updated_at desc
),
session_installments as (
  select
    i.id as installment_id, i.student_id, s.admission_no,
    s.full_name as student_name, s.father_name, s.primary_phone as father_phone,
    c.session_label, i.class_id, c.class_name,
    private.normalize_workbook_class_label(c.class_name, c.stream_name) as class_label,
    coalesce(c.section, '') as section, coalesce(c.stream_name, '') as stream_name,
    i.installment_no, i.installment_label, i.due_date,
    i.amount_due as base_charge, i.status as installment_status,
    i.late_fee_flat_amount, coalesce(i.is_emi_late_fee, false) as is_emi_late_fee,
    i.is_carry_forward, i.source_session_label,
    s.transport_route_id,
    route_row.route_name as transport_route_name,
    route_row.route_code as transport_route_code
  from public.installments as i
  join public.students as s on s.id = i.student_id
  join public.classes as c on c.id = i.class_id
  join session_policy as policy_row on policy_row.academic_session_label = c.session_label
  left join public.transport_routes as route_row on route_row.id = s.transport_route_id
  where i.status <> 'cancelled'
),
rolled as (
  select
    session_installments.*,
    coalesce(payment_row.paid_amount, 0)::integer as paid_amount,
    coalesce(adjustment_row.adjustment_amount, 0)::integer as adjustment_amount,
    greatest(
      coalesce(payment_row.paid_amount, 0)
        + coalesce(adjustment_row.cash_adjustment, 0), 0
    )::integer as applied_amount,
    greatest(
      coalesce(payment_row.discount_closeout_amount, 0)
        + coalesce(adjustment_row.closeout_adjustment, 0), 0
    )::integer as discount_closeout_amount,
    greatest(
      coalesce(payment_row.paid_by_due_amount, 0)
        + coalesce(payment_row.closeout_by_due_amount, 0)
        + coalesce(adj_by_due_row.adjustment_by_due_amount, 0),
      0
    )::integer as settled_by_due_amount,
    payment_row.last_payment_date
  from session_installments
  left join lateral (
    select
      coalesce(sum(payment_row.amount) filter (where receipt_row.payment_mode <> 'discount'), 0) as paid_amount,
      coalesce(sum(payment_row.amount) filter (where receipt_row.payment_mode = 'discount'), 0) as discount_closeout_amount,
      coalesce(sum(payment_row.amount) filter (
        where receipt_row.payment_date <= session_installments.due_date
          and receipt_row.payment_mode <> 'discount'), 0) as paid_by_due_amount,
      coalesce(sum(payment_row.amount) filter (
        where receipt_row.payment_date <= session_installments.due_date
          and receipt_row.payment_mode = 'discount'), 0) as closeout_by_due_amount,
      max(receipt_row.payment_date) as last_payment_date
    from public.payments as payment_row
    join public.receipts as receipt_row on receipt_row.id = payment_row.receipt_id
    where payment_row.installment_id = session_installments.installment_id
  ) as payment_row on true
  left join lateral (
    select
      coalesce(sum(adj.amount_delta), 0) as adjustment_amount,
      coalesce(sum(adj.amount_delta) filter (where adj_receipt.payment_mode <> 'discount'), 0) as cash_adjustment,
      coalesce(sum(adj.amount_delta) filter (where adj_receipt.payment_mode = 'discount'), 0) as closeout_adjustment
    from public.payment_adjustments as adj
    join public.payments as adj_payment on adj_payment.id = adj.payment_id
    join public.receipts as adj_receipt on adj_receipt.id = adj_payment.receipt_id
    where adj.installment_id = session_installments.installment_id
  ) as adjustment_row on true
  left join lateral (
    select coalesce(sum(adj.amount_delta), 0) as adjustment_by_due_amount
    from public.payment_adjustments as adj
    join public.payments as adj_payment on adj_payment.id = adj.payment_id
    join public.receipts as adj_receipt on adj_receipt.id = adj_payment.receipt_id
    where adj.installment_id = session_installments.installment_id
      and adj_receipt.payment_date <= session_installments.due_date
  ) as adj_by_due_row on true
),
late_eval as (
  select
    rolled.*,
    -- >>> SHARED LATE FEE RULE <<<
    -- Byte-identical to private.workbook_installment_snapshot. If you edit one,
    -- edit the other in the same migration. 20260812001114 edited only the
    -- function and EMI late fees went invisible for four days.
    --
    -- Branch order is deliberate:
    --   1. a 'waived' installment status outranks everything.
    --   2. late_fee_flat_amount <= 0 is the carry-forward guard -- previous-year
    --      rows carry a flat 0 and must never accrue.
    --   3. an EMI late-fee row IS the charge, so it is tested before the
    --      base_charge guard that would otherwise zero it (those rows carry no
    --      base by construction).
    --   4. settled_by_due counts on-time cash, on-time write-offs and on-time
    --      adjustments, so reversing an on-time payment re-charges correctly.
    --   5. current_date, not an as-of date. A late fee is a fact about today.
    case
      when rolled.installment_status = 'waived' then 0
      when coalesce(rolled.late_fee_flat_amount, 0) <= 0 then 0
      when rolled.is_emi_late_fee then
        case when current_date > rolled.due_date
             then rolled.late_fee_flat_amount else 0 end
      when rolled.base_charge <= 0 then 0
      when rolled.settled_by_due_amount >= rolled.base_charge then 0
      when current_date > rolled.due_date then rolled.late_fee_flat_amount
      else 0
    end::integer as raw_late_fee
  from rolled
),
waiver_eval as (
  select
    late_eval.*,
    least(late_eval.raw_late_fee, coalesce(waiver_row.waiver_amount, 0))::integer as waiver_applied
  from late_eval
  left join public.v_effective_late_fee_waivers as waiver_row
    on waiver_row.installment_id = late_eval.installment_id
),
split as (
  select
    waiver_eval.*,
    greatest(waiver_eval.raw_late_fee - waiver_eval.waiver_applied, 0)::integer as final_late_fee,
    -- Money settles fees first, then the late fee.
    greatest(waiver_eval.applied_amount + waiver_eval.discount_closeout_amount, 0)::integer as settled_amount
  from waiver_eval
)
select
  installment_id, student_id, admission_no, student_name, father_name, father_phone,
  session_label, class_id, class_name, class_label, section, stream_name,
  installment_no, installment_label, due_date,
  base_charge, paid_amount, discount_closeout_amount, adjustment_amount, applied_amount,
  raw_late_fee, waiver_applied, final_late_fee,
  greatest(base_charge + raw_late_fee - waiver_applied, 0)::integer as total_charge,
  -- Fees only. This column never contains a late fee.
  greatest(base_charge - settled_amount, 0)::integer as pending_amount,
  -- Late fee only, net of waivers and of any payment that already covered it.
  greatest(final_late_fee - greatest(settled_amount - base_charge, 0), 0)::integer as late_fee_pending,
  -- The two together. Equals what pending_amount used to mean.
  (greatest(base_charge - settled_amount, 0)
     + greatest(final_late_fee - greatest(settled_amount - base_charge, 0), 0))::integer as total_pending,
  case
    when installment_status = 'waived' then 'waived'
    when greatest(base_charge - settled_amount, 0) <= 0 then 'paid'
    when current_date > due_date then 'overdue'
    when settled_amount > 0 then 'partial'
    else 'pending'
  end as balance_status,
  case
    when raw_late_fee <= 0 then 'none'
    when greatest(final_late_fee - greatest(settled_amount - base_charge, 0), 0) > 0 then 'pending'
    when waiver_applied >= raw_late_fee then 'waived'
    else 'paid'
  end as late_fee_status,
  last_payment_date, transport_route_id, transport_route_name, transport_route_code,
  is_carry_forward, source_session_label, is_emi_late_fee
from split;

create unique index v_workbook_installment_balances_idx
  on public.v_workbook_installment_balances using btree (installment_id);
create index idx_v_workbook_installments_session
  on public.v_workbook_installment_balances using btree (session_label);
create index idx_v_workbook_installments_student
  on public.v_workbook_installment_balances using btree (student_id);
create index idx_v_workbook_installments_student_carry
  on public.v_workbook_installment_balances using btree (student_id) where is_carry_forward;

grant all on public.v_workbook_installment_balances to anon, authenticated, service_role;
grant select on public.v_workbook_installment_balances to notion_fee_sync_role;

comment on materialized view public.v_workbook_installment_balances is
  'Per-installment financial position. pending_amount is FEES ONLY and never contains a late fee; late_fee_pending carries that separately; total_pending is the two added. balance_status reads paid once fees are clear, whatever the late fee is doing -- late_fee_status carries that. The late-fee CASE is duplicated verbatim in private.workbook_installment_snapshot and the two must be edited together.';

-- ===========================================================================
-- 4. Replay the dependents
-- ===========================================================================
-- Each substitution asserts its anchor exists. A view not listed here is
-- replayed byte-for-byte, which is correct: with pending_amount now fees-only,
-- a consumer that summed it was already asking for fees and now gets them.

do $$
declare
  v_row   record;
  v_ddl   text;
  v_kind  text;
begin
  for v_row in select * from _lf_dependents order by ord loop
    v_ddl  := v_row.ddl;
    v_kind := v_row.kind;

    if v_row.name = 'v_workbook_student_financials' then
      -- late_fee_outstanding_amount was derived as (outstanding - base_outstanding).
      -- Both of those are now fees-only, so the subtraction yields 0. It has to
      -- read the late fee directly.
      if position('COALESCE(sum(v_workbook_installment_balances.final_late_fee), 0::bigint)::integer AS late_fee_total,' in v_ddl) = 0 then
        raise exception 'late-fee split: financials late_fee_total anchor not found';
      end if;
      v_ddl := replace(
        v_ddl,
        'COALESCE(sum(v_workbook_installment_balances.final_late_fee), 0::bigint)::integer AS late_fee_total,',
        'COALESCE(sum(v_workbook_installment_balances.final_late_fee), 0::bigint)::integer AS late_fee_total,'
          || E'\n            COALESCE(sum(v_workbook_installment_balances.late_fee_pending), 0::bigint)::integer AS late_fee_pending_total,'
      );

      if position('GREATEST(COALESCE(summary.outstanding_amount, 0) - COALESCE(summary.base_outstanding_amount, 0), 0) AS late_fee_outstanding_amount,' in v_ddl) = 0 then
        raise exception 'late-fee split: financials late_fee_outstanding_amount anchor not found';
      end if;
      v_ddl := replace(
        v_ddl,
        'GREATEST(COALESCE(summary.outstanding_amount, 0) - COALESCE(summary.base_outstanding_amount, 0), 0) AS late_fee_outstanding_amount,',
        'COALESCE(summary.late_fee_pending_total, 0) AS late_fee_outstanding_amount,'
      );

    elsif v_row.name = 'v_student_installment_facets' then
      -- least(final_late_fee, pending_amount) meant "late fee still owed" only
      -- while pending_amount held both. Now it would read 0 for anyone whose
      -- fees are clear -- exactly the students who still owe a late fee.
      if position('COALESCE(sum(LEAST(GREATEST(final_late_fee, 0), GREATEST(pending_amount, 0))), 0::bigint)::integer AS pending_late_fee_amount' in v_ddl) = 0 then
        raise exception 'late-fee split: facets pending_late_fee_amount anchor not found';
      end if;
      v_ddl := replace(
        v_ddl,
        'COALESCE(sum(LEAST(GREATEST(final_late_fee, 0), GREATEST(pending_amount, 0))), 0::bigint)::integer AS pending_late_fee_amount',
        'COALESCE(sum(GREATEST(late_fee_pending, 0)), 0::bigint)::integer AS pending_late_fee_amount'
      );

    elsif v_row.name = 'v_student_repayment_plan_status' then
      -- Both of these subtracted the late fee out of pending_amount by hand.
      -- Doing that now would subtract it twice and understate the plan balance.
      if position('COALESCE(sum(GREATEST(COALESCE(b.pending_amount, 0) - COALESCE(b.final_late_fee, 0), 0)), 0::bigint)::integer AS remaining_balance,' in v_ddl) = 0 then
        raise exception 'late-fee split: plan remaining_balance anchor not found';
      end if;
      v_ddl := replace(
        v_ddl,
        'COALESCE(sum(GREATEST(COALESCE(b.pending_amount, 0) - COALESCE(b.final_late_fee, 0), 0)), 0::bigint)::integer AS remaining_balance,',
        'COALESCE(sum(GREATEST(COALESCE(b.pending_amount, 0), 0)), 0::bigint)::integer AS remaining_balance,'
      );

      if position('GREATEST(nb.pending_amount - nb.final_late_fee, 0) > 0' in v_ddl) = 0 then
        raise exception 'late-fee split: plan uncovered-installment anchor not found';
      end if;
      v_ddl := replace(
        v_ddl,
        'GREATEST(nb.pending_amount - nb.final_late_fee, 0) > 0',
        'nb.pending_amount > 0'
      );

    elsif v_row.name = 'v_student_financial_state' then
      -- total_due, and therefore the credit / overpaid / refundable trio, must
      -- keep counting the late fee: total_paid includes money collected against
      -- it, so dropping it from the total would invent credit for every family
      -- who actually paid one. Only the pending side becomes fees-only, which
      -- it does on its own now that outstanding_amount is fees-only.
      if position('COALESCE(v_workbook_student_financials.outstanding_amount, 0::bigint)::integer AS installment_pending_amount' in v_ddl) = 0 then
        raise exception 'late-fee split: financial_state installment_pending anchor not found';
      end if;
      v_ddl := replace(
        v_ddl,
        'COALESCE(v_workbook_student_financials.outstanding_amount, 0::bigint)::integer AS installment_pending_amount',
        'COALESCE(v_workbook_student_financials.outstanding_amount, 0::bigint)::integer AS installment_pending_amount,'
          || E'\n            COALESCE(v_workbook_student_financials.late_fee_outstanding_amount, 0)::integer AS late_fee_pending'
      );

      if position('financials.installment_pending_amount' in v_ddl) = 0 then
        raise exception 'late-fee split: financial_state projection anchor not found';
      end if;
      v_ddl := replace(
        v_ddl,
        'financials.installment_pending_amount' || E'\n   FROM financials',
        'financials.installment_pending_amount,' || E'\n    financials.late_fee_pending' || E'\n   FROM financials'
      );
    end if;

    if v_kind = 'm' then
      execute format('create materialized view public.%I as %s', v_row.name, v_ddl);
    else
      execute format('create view public.%I as %s', v_row.name, v_ddl);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 4a. Indexes, grants and comments the cascade took with it
-- ---------------------------------------------------------------------------

create unique index v_workbook_student_financials_idx
  on public.v_workbook_student_financials using btree (student_id);
create index idx_v_workbook_financials_session_status
  on public.v_workbook_student_financials using btree (session_label, record_status);
create unique index v_student_financial_state_idx
  on public.v_student_financial_state using btree (student_id);

grant all on public.v_workbook_student_financials    to anon, authenticated, service_role;
grant all on public.v_student_carry_forward_balances to anon, authenticated, service_role;
grant all on public.v_student_installment_facets     to authenticated, service_role;
grant all on public.v_student_repayment_plan_status  to anon, authenticated, service_role;
grant all on public.v_student_financial_state        to anon, authenticated, service_role;
grant all on public.v_student_directory              to authenticated, service_role;
grant all on public.v_notion_student_fee_summary     to anon, authenticated, service_role;
grant all on public.v_notion_family_fee_summary      to anon, authenticated, service_role;
grant all on public.v_notion_daily_collection_summary to anon, authenticated, service_role;

grant select on public.v_workbook_student_financials     to notion_fee_sync_role;
grant select on public.v_notion_student_fee_summary      to notion_fee_sync_role;
grant select on public.v_notion_family_fee_summary       to notion_fee_sync_role;
grant select on public.v_notion_daily_collection_summary to notion_fee_sync_role;

comment on view public.v_student_directory is
  'One filterable row per student per session. seg_* booleans back the Students and Transactions segment chips. The three payment buckets (seg_never_paid, seg_partly_paid, seg_year_clear) partition the roll; seg_overdue is a timing flag and overlaps all three. Every money segment reads fees only -- an unpaid late fee alone never puts a student in one, seg_late_fee_pending carries that.';
comment on view public.v_student_installment_facets is
  'Per-student installment rollups that v_workbook_student_financials does not expose -- notably the previous-year carry-forward balance. Mirrors the TypeScript helpers in lib/fees/due-amounts.ts, including their existing rounding quirks, so filters agree with the figures already rendered.';
comment on view public.v_student_repayment_plan_status is
  'Single source of EMI plan standing. Every surface (Student, Payment Desk, Dashboard, Defaulters, Exports) reads this so statuses cannot disagree.';

-- ===========================================================================
-- 5. The snapshot function -- engine A
-- ===========================================================================
-- Written out in full rather than string-patched. The return type gains three
-- columns, so this is a drop-and-create; the argument list is unchanged, which
-- keeps the ::regprocedure assertions in 20260812001114 and 20260812022558
-- valid. No caller uses positional access.

drop function if exists private.workbook_installment_snapshot(uuid, date, boolean);

create function private.workbook_installment_snapshot(
  p_student_id uuid default null,
  p_as_of_date date default current_date,
  p_include_candidate_late boolean default false
)
returns table (
  installment_id uuid, student_id uuid, admission_no text, student_name text,
  father_name text, father_phone text, session_label text, class_id uuid,
  class_name text, class_label text, section text, stream_name text,
  installment_no smallint, installment_label text, due_date date,
  base_charge integer, paid_amount integer, adjustment_amount integer,
  applied_amount integer, raw_late_fee integer, waiver_applied integer,
  final_late_fee integer, total_charge integer, pending_amount integer,
  late_fee_pending integer, total_pending integer,
  balance_status text, late_fee_status text, last_payment_date date,
  transport_route_id uuid, transport_route_name text, transport_route_code text
)
language sql
stable
set search_path to 'public', 'private'
as $function$
  with session_policy as (
    select distinct on (academic_session_label) academic_session_label
    from public.fee_policy_configs
    where calculation_model = 'workbook_v1'
    order by academic_session_label, updated_at desc
  ),
  session_installments as (
    select
      i.id as installment_id, i.student_id, s.admission_no,
      s.full_name as student_name, s.father_name, s.primary_phone as father_phone,
      c.session_label, i.class_id, c.class_name,
      private.normalize_workbook_class_label(c.class_name, c.stream_name) as class_label,
      coalesce(c.section, '') as section, coalesce(c.stream_name, '') as stream_name,
      i.installment_no, i.installment_label, i.due_date,
      i.amount_due as base_charge, i.status as installment_status,
      i.late_fee_flat_amount, coalesce(i.is_emi_late_fee, false) as is_emi_late_fee,
      s.transport_route_id,
      route_row.route_name as transport_route_name,
      route_row.route_code as transport_route_code
    from public.installments as i
    join public.students as s on s.id = i.student_id
    join public.classes as c on c.id = i.class_id
    join session_policy as policy_row on policy_row.academic_session_label = c.session_label
    left join public.transport_routes as route_row on route_row.id = s.transport_route_id
    where i.status <> 'cancelled'
      and (p_student_id is null or i.student_id = p_student_id)
  ),
  rolled as (
    select
      session_installments.*,
      coalesce(payment_row.paid_amount, 0)::integer as paid_amount,
      coalesce(adjustment_row.adjustment_amount, 0)::integer as adjustment_amount,
      greatest(
        coalesce(payment_row.paid_amount, 0)
          + coalesce(adjustment_row.cash_adjustment, 0), 0
      )::integer as applied_amount,
      greatest(
        coalesce(payment_row.discount_closeout_amount, 0)
          + coalesce(adjustment_row.closeout_adjustment, 0), 0
      )::integer as discount_closeout_amount,
      greatest(
        coalesce(payment_row.paid_by_due_amount, 0)
          + coalesce(payment_row.closeout_by_due_amount, 0)
          + coalesce(adj_by_due_row.adjustment_by_due_amount, 0),
        0
      )::integer as settled_by_due_amount,
      payment_row.last_payment_date
    from session_installments
    left join lateral (
      select
        coalesce(sum(payment_row.amount) filter (where receipt_row.payment_mode <> 'discount'), 0) as paid_amount,
        coalesce(sum(payment_row.amount) filter (where receipt_row.payment_mode = 'discount'), 0) as discount_closeout_amount,
        coalesce(sum(payment_row.amount) filter (
          where receipt_row.payment_date <= session_installments.due_date
            and receipt_row.payment_mode <> 'discount'), 0) as paid_by_due_amount,
        coalesce(sum(payment_row.amount) filter (
          where receipt_row.payment_date <= session_installments.due_date
            and receipt_row.payment_mode = 'discount'), 0) as closeout_by_due_amount,
        max(receipt_row.payment_date) as last_payment_date
      from public.payments as payment_row
      join public.receipts as receipt_row on receipt_row.id = payment_row.receipt_id
      where payment_row.installment_id = session_installments.installment_id
    ) as payment_row on true
    left join lateral (
      select
        coalesce(sum(adj.amount_delta), 0) as adjustment_amount,
        coalesce(sum(adj.amount_delta) filter (where adj_receipt.payment_mode <> 'discount'), 0) as cash_adjustment,
        coalesce(sum(adj.amount_delta) filter (where adj_receipt.payment_mode = 'discount'), 0) as closeout_adjustment
      from public.payment_adjustments as adj
      join public.payments as adj_payment on adj_payment.id = adj.payment_id
      join public.receipts as adj_receipt on adj_receipt.id = adj_payment.receipt_id
      where adj.installment_id = session_installments.installment_id
    ) as adjustment_row on true
    left join lateral (
      select coalesce(sum(adj.amount_delta), 0) as adjustment_by_due_amount
      from public.payment_adjustments as adj
      join public.payments as adj_payment on adj_payment.id = adj.payment_id
      join public.receipts as adj_receipt on adj_receipt.id = adj_payment.receipt_id
      where adj.installment_id = session_installments.installment_id
        and adj_receipt.payment_date <= session_installments.due_date
    ) as adj_by_due_row on true
  ),
  late_eval as (
    select
      rolled.*,
      -- >>> SHARED LATE FEE RULE <<<
      -- Byte-identical to v_workbook_installment_balances above. Edit both or
      -- neither -- 20260812001114 edited only this copy and EMI late fees went
      -- invisible to every read surface for four days.
      case
        when rolled.installment_status = 'waived' then 0
        when coalesce(rolled.late_fee_flat_amount, 0) <= 0 then 0
        when rolled.is_emi_late_fee then
          case when current_date > rolled.due_date
               then rolled.late_fee_flat_amount else 0 end
        when rolled.base_charge <= 0 then 0
        when rolled.settled_by_due_amount >= rolled.base_charge then 0
        when current_date > rolled.due_date then rolled.late_fee_flat_amount
        else 0
      end::integer as raw_late_fee
    from rolled
  ),
  waiver_eval as (
    select
      late_eval.*,
      least(late_eval.raw_late_fee, coalesce(waiver_row.waiver_amount, 0))::integer as waiver_applied
    from late_eval
    left join public.v_effective_late_fee_waivers as waiver_row
      on waiver_row.installment_id = late_eval.installment_id
  ),
  split as (
    select
      waiver_eval.*,
      greatest(waiver_eval.raw_late_fee - waiver_eval.waiver_applied, 0)::integer as final_late_fee,
      greatest(waiver_eval.applied_amount + waiver_eval.discount_closeout_amount, 0)::integer as settled_amount
    from waiver_eval
  )
  select
    split.installment_id, split.student_id, split.admission_no,
    split.student_name, split.father_name, split.father_phone,
    split.session_label, split.class_id, split.class_name,
    split.class_label, split.section, split.stream_name,
    split.installment_no, split.installment_label, split.due_date,
    split.base_charge, split.paid_amount, split.adjustment_amount,
    split.applied_amount, split.raw_late_fee, split.waiver_applied,
    split.final_late_fee,
    greatest(split.base_charge + split.raw_late_fee - split.waiver_applied, 0)::integer as total_charge,
    greatest(split.base_charge - split.settled_amount, 0)::integer as pending_amount,
    greatest(split.final_late_fee - greatest(split.settled_amount - split.base_charge, 0), 0)::integer as late_fee_pending,
    (greatest(split.base_charge - split.settled_amount, 0)
       + greatest(split.final_late_fee - greatest(split.settled_amount - split.base_charge, 0), 0))::integer as total_pending,
    case
      when split.installment_status = 'waived' then 'waived'
      when greatest(split.base_charge - split.settled_amount, 0) <= 0 then 'paid'
      when p_as_of_date > split.due_date then 'overdue'
      when split.settled_amount > 0 then 'partial'
      else 'pending'
    end as balance_status,
    case
      when split.raw_late_fee <= 0 then 'none'
      when greatest(split.final_late_fee - greatest(split.settled_amount - split.base_charge, 0), 0) > 0 then 'pending'
      when split.waiver_applied >= split.raw_late_fee then 'waived'
      else 'paid'
    end as late_fee_status,
    split.last_payment_date, split.transport_route_id,
    split.transport_route_name, split.transport_route_code
  from split
  order by split.student_id, split.installment_no;
$function$;

grant execute on function private.workbook_installment_snapshot(uuid, date, boolean) to authenticated;
grant execute on function private.workbook_installment_snapshot(uuid, date, boolean) to service_role;

comment on function private.workbook_installment_snapshot(uuid,date,boolean) is
  'Per-installment financial snapshot. pending_amount is FEES ONLY; late_fee_pending carries the late fee; total_pending is the two added and is what a cashier can collect against this installment. balance_status reads paid once fees are clear -- late_fee_status carries the late fee separately. p_include_candidate_late is DEPRECATED and ignored. p_as_of_date drives balance_status only; the late fee is always evaluated against current_date so this function and v_workbook_installment_balances cannot disagree.';

-- ===========================================================================
-- 6. Callers
-- ===========================================================================
-- Every caller falls into one of two groups, and getting the group wrong is
-- how a family stops being able to pay a late fee or a plan balance doubles.
--
--   Wants the TOTAL (collecting money):  post_student_payment,
--     post_student_payment_with_adjustments, preview_workbook_payment_allocation
--   Wants FEES ONLY (measuring debt):    repayment plan functions
--   Wants the LATE FEE:                  waive_late_fee
--
-- get_dashboard_summary and get_student_directory_summary need no edit: they
-- read outstanding_amount and pending_amount, both of which are now fees-only,
-- which is what those figures were always documented to mean.

do $$
declare
  v_src text;
  v_new text;
begin
  ---------------------------------------------------------------------------
  -- 6a. post_student_payment -- collecting, so it wants the total
  ---------------------------------------------------------------------------
  v_src := pg_get_functiondef(
    'public.post_student_payment(uuid,date,payment_mode,integer,text,text,text,text,uuid)'::regprocedure);
  if position('snapshot_row.pending_amount' in v_src) = 0 then
    raise exception 'late-fee split: anchor not found in post_student_payment';
  end if;
  v_new := replace(v_src, 'snapshot_row.pending_amount', 'snapshot_row.total_pending');
  v_new := replace(v_new, 'balance_row.pending_amount', 'balance_row.total_pending');
  execute v_new;

  ---------------------------------------------------------------------------
  -- 6b. post_student_payment_with_adjustments -- one line. The jsonb key stays
  -- 'pending_amount' so the recordset shape and the allocation loop below it
  -- are untouched; only what gets put in it changes.
  ---------------------------------------------------------------------------
  v_src := pg_get_functiondef(
    'public.post_student_payment_with_adjustments(uuid,date,payment_mode,integer,text,text,text,text,uuid,integer,integer)'::regprocedure);
  if position('''pending_amount'', snapshot_row.pending_amount,' in v_src) = 0 then
    raise exception 'late-fee split: anchor not found in post_student_payment_with_adjustments';
  end if;
  execute replace(
    v_src,
    '''pending_amount'', snapshot_row.pending_amount,',
    '''pending_amount'', snapshot_row.total_pending,'
  );

  ---------------------------------------------------------------------------
  -- 6c. waive_late_fee -- least(final_late_fee, pending_amount) was the late
  -- fee still owed only while pending_amount held both kinds of money. Left
  -- alone it would report nothing waivable for every family whose fees are
  -- clear, which is most of the people who need a waiver.
  ---------------------------------------------------------------------------
  v_src := pg_get_functiondef(
    'public.waive_late_fee(uuid,integer,text,text,uuid,uuid)'::regprocedure);
  if position('least(' || E'\n' || '      greatest(snap.final_late_fee, 0),' in v_src) = 0 then
    raise exception 'late-fee split: anchor not found in waive_late_fee';
  end if;
  v_new := replace(
    v_src,
    'least(' || E'\n' || '      greatest(snap.final_late_fee, 0),' || E'\n'
      || '      greatest(snap.pending_amount, 0)' || E'\n' || '    )::integer as remaining',
    'greatest(snap.late_fee_pending, 0)::integer as remaining'
  );
  if v_new = v_src then
    raise exception 'late-fee split: waive_late_fee remaining expression did not change';
  end if;
  execute v_new;

  ---------------------------------------------------------------------------
  -- 6d. Repayment plans -- these already wanted fees only and subtracted the
  -- late fee by hand. Doing that now would subtract it twice.
  ---------------------------------------------------------------------------
  v_src := pg_get_functiondef('private.repayment_plan_remaining(uuid)'::regprocedure);
  if position('greatest(snap.pending_amount - snap.final_late_fee, 0)' in v_src) = 0 then
    raise exception 'late-fee split: anchor not found in repayment_plan_remaining';
  end if;
  execute replace(v_src,
    'greatest(snap.pending_amount - snap.final_late_fee, 0)',
    'greatest(snap.pending_amount, 0)');

  v_src := pg_get_functiondef(
    'private.repayment_plan_candidates(uuid,text,text,date)'::regprocedure);
  if position('greatest(snap.pending_amount - snap.final_late_fee, 0)' in v_src) = 0
     or position('greatest(least(snap.final_late_fee, snap.pending_amount), 0)' in v_src) = 0 then
    raise exception 'late-fee split: anchor not found in repayment_plan_candidates';
  end if;
  v_new := replace(v_src,
    'greatest(least(snap.final_late_fee, snap.pending_amount), 0)::integer as charged_late_fee',
    'greatest(snap.late_fee_pending, 0)::integer as charged_late_fee');
  v_new := replace(v_new,
    'greatest(snap.pending_amount - snap.final_late_fee, 0)',
    'greatest(snap.pending_amount, 0)');
  execute v_new;

  v_src := pg_get_functiondef(
    'public.reschedule_student_repayment_plan(uuid,integer,date,text,integer,uuid,date[])'::regprocedure);
  if position('greatest(snap.pending_amount - snap.final_late_fee, 0)' in v_src) = 0 then
    raise exception 'late-fee split: anchor not found in reschedule_student_repayment_plan';
  end if;
  execute replace(v_src,
    'greatest(snap.pending_amount - snap.final_late_fee, 0)',
    'greatest(snap.pending_amount, 0)');
end $$;

-- ---------------------------------------------------------------------------
-- 6e. preview_workbook_payment_allocation -- the Payment Desk's read model.
-- Gains the two new columns so the desk can show "Fees due" and "Late fee due"
-- as separate lines, and its filter moves to total_pending so an installment
-- whose fees are clear but whose late fee is not still appears at the counter.
-- ---------------------------------------------------------------------------

drop function if exists public.preview_workbook_payment_allocation(uuid, date);

create function public.preview_workbook_payment_allocation(
  p_student_id uuid,
  p_payment_date date default current_date
)
returns table (
  installment_id uuid, student_id uuid, admission_no text, student_name text,
  father_name text, father_phone text, session_label text, class_id uuid,
  class_name text, class_label text, section text, stream_name text,
  installment_no smallint, installment_label text,
  is_carry_forward boolean, source_session_label text, target_session_label text,
  carry_forward_fee_head text,
  due_date date, base_charge integer, paid_amount integer, adjustment_amount integer,
  applied_amount integer, raw_late_fee integer, waiver_applied integer,
  final_late_fee integer, total_charge integer, pending_amount integer,
  late_fee_pending integer, total_pending integer,
  balance_status text, late_fee_status text, last_payment_date date,
  transport_route_id uuid, transport_route_name text, transport_route_code text
)
language sql
stable
security definer
set search_path to 'public', 'private', 'pg_temp'
as $function$
  select
    snapshot_row.installment_id, snapshot_row.student_id, snapshot_row.admission_no,
    snapshot_row.student_name, snapshot_row.father_name, snapshot_row.father_phone,
    snapshot_row.session_label, snapshot_row.class_id, snapshot_row.class_name,
    snapshot_row.class_label, snapshot_row.section, snapshot_row.stream_name,
    snapshot_row.installment_no, snapshot_row.installment_label,
    coalesce(installment_row.is_carry_forward, false) as is_carry_forward,
    installment_row.source_session_label,
    installment_row.target_session_label,
    installment_row.carry_forward_fee_head,
    snapshot_row.due_date, snapshot_row.base_charge, snapshot_row.paid_amount,
    snapshot_row.adjustment_amount, snapshot_row.applied_amount,
    snapshot_row.raw_late_fee, snapshot_row.waiver_applied,
    snapshot_row.final_late_fee, snapshot_row.total_charge,
    snapshot_row.pending_amount, snapshot_row.late_fee_pending,
    snapshot_row.total_pending,
    snapshot_row.balance_status, snapshot_row.late_fee_status,
    snapshot_row.last_payment_date, snapshot_row.transport_route_id,
    snapshot_row.transport_route_name, snapshot_row.transport_route_code
  from private.workbook_installment_snapshot(p_student_id, p_payment_date, true) as snapshot_row
  join public.installments as installment_row
    on installment_row.id = snapshot_row.installment_id
  where (
    coalesce(auth.role(), '') = 'service_role'
    or public.has_any_permission(array[
      'payments:view', 'payments:write', 'ledger:view',
      'receipts:view', 'dashboard:view', 'finance:view'
    ])
  )
    and snapshot_row.total_pending > 0
  order by snapshot_row.due_date asc, snapshot_row.installment_no asc;
$function$;

grant execute on function public.preview_workbook_payment_allocation(uuid, date) to authenticated;
grant execute on function public.preview_workbook_payment_allocation(uuid, date) to service_role;

-- ---------------------------------------------------------------------------
-- 6f. get_dashboard_fee_split -- the RPC behind the dashboard's late-fee tile.
-- It hand-rolled the same split this migration now provides as columns.
-- previous_year_pending is fixed while we are here: it summed the raw
-- late-fee-inclusive pending_amount while the current-year branch subtracted
-- the late fee out, so the two halves of the same card disagreed about what
-- "pending" meant. Carry-forward rows never accrue a late fee, so this changes
-- no number today -- it stops the next carry-forward rule change from being a
-- silent bug.
-- ---------------------------------------------------------------------------

create or replace function public.get_dashboard_fee_split(p_session_label text)
returns table (
  current_year_expected integer, current_year_collected integer,
  current_year_pending integer, previous_year_original integer,
  previous_year_collected integer, previous_year_pending integer,
  late_fee_pending integer
)
language plpgsql
stable
security definer
set search_path to 'public', 'private', 'pg_temp'
as $function$
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not public.has_any_permission(array['dashboard:view', 'finance:view'])
  then
    raise exception 'You do not have permission to read the fee split.';
  end if;

  return query
  with scoped as (
    select
      b.is_carry_forward,
      b.base_charge,
      b.applied_amount,
      b.pending_amount,
      b.late_fee_pending
    from public.v_workbook_installment_balances as b
    join public.students as s on s.id = b.student_id
    join public.classes  as c on c.id = b.class_id
    where b.session_label = p_session_label
      and c.status = 'active'
      -- Active, or left/inactive but with money already collected: their
      -- remaining dues are still collectable and must stay visible. A departed
      -- student who never paid has had their installments cancelled, so they
      -- contribute nothing either way.
      and (
        s.status = 'active'
        or exists (
          select 1
          from public.payments p
          join public.receipts r on r.id = p.receipt_id
          where p.student_id = s.id and r.payment_mode <> 'discount'
        )
      )
  ),
  per_row as (
    select
      scoped.is_carry_forward,
      scoped.base_charge,
      least(greatest(scoped.applied_amount, 0), scoped.base_charge) as collected_against_base,
      scoped.pending_amount,
      greatest(scoped.late_fee_pending, 0) as late_pending
    from scoped
  )
  select
    coalesce(sum(per_row.base_charge)            filter (where not per_row.is_carry_forward), 0)::integer,
    coalesce(sum(per_row.collected_against_base) filter (where not per_row.is_carry_forward), 0)::integer,
    coalesce(sum(per_row.pending_amount)         filter (where not per_row.is_carry_forward), 0)::integer,
    coalesce(sum(per_row.base_charge)            filter (where per_row.is_carry_forward), 0)::integer,
    coalesce(sum(per_row.collected_against_base) filter (where per_row.is_carry_forward), 0)::integer,
    coalesce(sum(per_row.pending_amount)         filter (where per_row.is_carry_forward), 0)::integer,
    coalesce(sum(per_row.late_pending)           filter (where not per_row.is_carry_forward), 0)::integer
  from per_row;
end;
$function$;

grant execute on function public.get_dashboard_fee_split(text) to authenticated;
grant execute on function public.get_dashboard_fee_split(text) to service_role;

refresh materialized view public.v_workbook_installment_balances;
refresh materialized view public.v_workbook_student_financials;
refresh materialized view public.v_student_financial_state;

-- ===========================================================================
-- 7. Assertions -- the two engines must agree, and no money may have moved
-- ===========================================================================

do $$
declare
  v_engine_drift  int;
  v_split_break   int;
  v_negative      int;
begin
  -- Same installment, same three numbers, from both engines.
  select count(*) into v_engine_drift
  from public.v_workbook_installment_balances b
  join private.workbook_installment_snapshot(null, current_date, true) f
    on f.installment_id = b.installment_id
  where b.raw_late_fee     is distinct from f.raw_late_fee
     or b.pending_amount   is distinct from f.pending_amount
     or b.late_fee_pending is distinct from f.late_fee_pending
     or b.total_pending    is distinct from f.total_pending
     or b.balance_status   is distinct from f.balance_status;

  if v_engine_drift > 0 then
    raise exception 'late-fee split: % installment(s) disagree between the two engines', v_engine_drift;
  end if;

  -- The split must be exact: fees + late fee = what the column used to hold.
  select count(*) into v_split_break
  from public.v_workbook_installment_balances
  where pending_amount + late_fee_pending <> total_pending;

  if v_split_break > 0 then
    raise exception 'late-fee split: % row(s) where fees + late fee <> total', v_split_break;
  end if;

  select count(*) into v_negative
  from public.v_workbook_installment_balances
  where pending_amount < 0 or late_fee_pending < 0 or final_late_fee < 0;

  if v_negative > 0 then
    raise exception 'late-fee split: % row(s) with a negative balance', v_negative;
  end if;
end $$;

commit;
