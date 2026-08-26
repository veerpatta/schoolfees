-- Surplus on an installment spills forward to the next ones.
--
-- Companion to 20260826120000, and it must be applied FIRST. On its own it
-- moves nothing; without it, 20260826120000 loses money.
--
-- THE PROBLEM
--
-- Both engines pin money to the installment a cashier allocated it to, then
-- clip whatever that installment cannot absorb:
--
--     pending_amount   = greatest(base_charge - settled_amount, 0)
--     late_fee_pending = greatest(final_late_fee - greatest(settled_amount - base_charge, 0), 0)
--
-- That was safe for as long as no installment could be over-applied, which was
-- true: post_student_payment_with_adjustments allocates against total_pending,
-- so a row never receives more than it is asking for.
--
-- 20260826120000 breaks that. An admin waiving a late fee the family has
-- ALREADY PAID lowers the row's charge without lowering what was applied to it.
-- Take the ordinary mid-year case -- four installments of Rs 10,000, the first
-- paid along with its Rs 1,000 late fee:
--
--                                            before waiver   after waiver
--     installment 1 total_charge                 11,000         10,000
--     installment 1 applied_amount               11,000         11,000
--     sum(pending_amount)  (the matview)         30,000         30,000  <-- wrong
--     total_due - total_paid (financial_state)   30,000         29,000
--     credit_balance                                  0              0
--
-- The released Rs 1,000 is eaten by the two greatest(..., 0) clips. It does not
-- become credit -- credit_balance is total_paid - total_due, which only turns
-- positive once the whole year is otherwise settled. What it becomes is a
-- silent Rs 1,000 disagreement between the per-installment engines (student
-- profile, Payment Desk preview, defaulters, dashboards, every export) and
-- v_student_financial_state. The family is still asked for the full Rs 30,000
-- and the waiver does nothing for them until March.
--
-- THE FIX
--
-- Money applied to an installment beyond that installment's own
-- base_charge + final_late_fee reduces the NEXT installments' pending, oldest
-- first. Whatever is still left after the last installment stays where it is
-- and surfaces as credit_balance, exactly as today.
--
-- On the case above: installment 1 releases Rs 1,000, installment 2 absorbs it
-- and reads Rs 9,000 pending, the sum is Rs 29,000, and the two views agree.
-- Release Rs 35,000 instead and the three remaining rooms (Rs 30,000) fill,
-- leaving Rs 5,000 as credit_balance.
--
-- This is not a new model. scripts/verify-workbook-parity.mjs:53 has always
-- computed outstanding as max(0, totalDue - totalPaid) with no per-installment
-- pinning at all, which is what this makes the engines actually do once a row
-- overflows.
--
-- WHY IT IS SAFE
--
--   * No writes. Nothing goes into payments, receipts or payment_adjustments.
--   * The spill only ever ADDS to a row's effective settlement, so a family who
--     skipped installment 1 and paid installment 2 in full still reads paid on
--     installment 2 rather than partly paid.
--   * raw_late_fee and settled_by_due_amount are deliberately untouched, so
--     spilled money can never retroactively make a later installment "settled by
--     its due date" and un-charge a late fee that was correctly raised. Health
--     invariant #5 (grandfathering) is unaffected.
--   * base_charge, applied_amount, discount_closeout_amount, adjustment_amount,
--     raw_late_fee, waiver_applied, final_late_fee and total_charge all keep
--     their current definitions, so total_paid = sum(applied_amount) and
--     total_due = sum(total_charge) do not move and every dependent view keeps
--     its meaning. Only the four derived columns change.
--   * It is a no-op on today's data, and this migration ASSERTS that rather
--     than claiming it: the pre-drop rows are snapshotted and compared after the
--     rebuild, and the transaction aborts if a single figure moved.
--
-- Both engines are rewritten in full from one source text, per the
-- >>> SHARED LATE FEE RULE <<< convention. The new block carries its own
-- >>> SHARED SURPLUS SPILL RULE <<< marker for the same reason: 20260812001114
-- string-patched one copy of the late-fee rule and EMI late fees were invisible
-- to half the app for four days.

begin;

-- ===========================================================================
-- 1. Snapshot what the engines say now, so the rebuild can prove it moved nothing
-- ===========================================================================

create temporary table _spill_before on commit drop as
select installment_id, pending_amount, late_fee_pending, total_pending,
       balance_status, late_fee_status
from public.v_workbook_installment_balances;

-- ===========================================================================
-- 2. Capture every dependent of the balances matview before dropping it
-- ===========================================================================
-- 20260812120000's nine, plus v_ledger_policy_drift, which was created after it.
-- Every one is replayed byte-for-byte with its comment: this migration changes
-- no column name, no column type and no column order, so nothing downstream
-- needs rewriting. The guard below checks the list against the catalog rather
-- than trusting it.

create temporary table _spill_dependents (ord int, name text, kind text, ddl text, note text)
  on commit drop;

insert into _spill_dependents (ord, name, kind, ddl, note)
select
  ord, name, kind,
  pg_get_viewdef(format('public.%I', name)::regclass, true),
  obj_description(format('public.%I', name)::regclass, 'pg_class')
from (values
  (1, 'v_workbook_student_financials',      'm'),
  (2, 'v_student_carry_forward_balances',   'v'),
  (3, 'v_student_installment_facets',       'v'),
  (4, 'v_student_repayment_plan_status',    'v'),
  (5, 'v_student_financial_state',          'm'),
  (6, 'v_student_directory',                'v'),
  (7, 'v_notion_student_fee_summary',       'v'),
  (8, 'v_notion_family_fee_summary',        'v'),
  (9, 'v_notion_daily_collection_summary',  'v'),
  -- Created after 20260812120000, so it is absent from that migration's list --
  -- which is exactly the list this one was copied from. The cascade would have
  -- dropped it and the replay would never have put it back. Nothing depends on
  -- it, so it goes last.
  (10, 'v_ledger_policy_drift',             'v')
) as t(ord, name, kind);

do $$
declare
  v_missing int;
  v_unlisted text;
begin
  select count(*) into v_missing from _spill_dependents where coalesce(ddl, '') = '';
  if v_missing > 0 then
    raise exception 'surplus spill: % dependent definition(s) came back empty', v_missing;
  end if;

  -- A hand-written list of dependents goes stale the moment somebody adds a
  -- view, and the cascade below does not care: it drops what it drops, and the
  -- replay only restores what is named here. 20260812120000's list was already
  -- one short by the time this migration was written -- v_ledger_policy_drift
  -- was created after it -- so ask the catalog instead of trusting the list.
  select string_agg(name, ', ' order by name) into v_unlisted
  from (
    with recursive deps as (
      select c.oid
      from pg_class c
      where c.oid = 'public.v_workbook_installment_balances'::regclass
      union
      select c.oid
      from deps
      join pg_depend d on d.refobjid = deps.oid and d.classid = 'pg_rewrite'::regclass
      join pg_rewrite rw on rw.oid = d.objid
      join pg_class c on c.oid = rw.ev_class
      where c.oid <> deps.oid
    )
    select c.relname::text as name
    from deps
    join pg_class c on c.oid = deps.oid
    where c.oid <> 'public.v_workbook_installment_balances'::regclass
      and not exists (select 1 from _spill_dependents dep where dep.name = c.relname::text)
  ) as unlisted;

  if v_unlisted is not null then
    raise exception
      'surplus spill: the cascade would also drop %, which this migration does not replay. Add it to the list above before applying.',
      v_unlisted;
  end if;
end $$;

-- ===========================================================================
-- 3. Drop the stack
-- ===========================================================================

drop materialized view public.v_workbook_installment_balances cascade;

-- ===========================================================================
-- 4. The balances matview -- engine B
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
),
-- >>> SHARED SURPLUS SPILL RULE <<<
-- Byte-identical to private.workbook_installment_snapshot. Edit both or
-- neither. 20260812001114 edited only one copy of the late-fee rule and EMI
-- late fees went invisible to half the app for four days.
--
-- Money applied to an installment beyond what that installment can absorb
-- reduces the NEXT installments' pending, oldest first. Until 20260826120000
-- there was no such money: posting allocates against total_pending, so nothing
-- could over-apply a row. An admin waiving a late fee the family had already
-- paid is the first thing that creates it, and without this the released rupees
-- are clipped by `greatest(..., 0)` and simply disappear from every
-- per-installment figure while v_student_financial_state quietly disagrees.
spill as (
  select
    split.*,
    -- What this row cannot absorb, and what it still has room for. A row can
    -- never have both: surplus > 0 means settled exceeded capacity.
    greatest(split.settled_amount - (split.base_charge + split.final_late_fee), 0)::integer
      as row_surplus,
    greatest((split.base_charge + split.final_late_fee) - split.settled_amount, 0)::integer
      as row_room
  from split
),
carry as (
  select
    spill.*,
    -- Greedy oldest-first fill, in closed form. Cumulative surplus applied
    -- through this row is min(surplus released BEFORE it, room up to and
    -- including it); the row's own share is the step from the previous row's
    -- cumulative. Exclusive prefix on surplus, inclusive on room -- a row may
    -- not absorb its own surplus, and may absorb everything released earlier.
    least(
      coalesce(sum(spill.row_surplus) over w_before, 0),
      coalesce(sum(spill.row_room)   over w_through, 0)
    )::integer as cum_filled,
    least(
      coalesce(sum(spill.row_surplus) over w_before_prev, 0),
      coalesce(sum(spill.row_room)    over w_before,      0)
    )::integer as cum_filled_prev
  from spill
  window
    w_before      as (partition by spill.student_id order by spill.due_date, spill.installment_no
                      rows between unbounded preceding and 1 preceding),
    w_through     as (partition by spill.student_id order by spill.due_date, spill.installment_no
                      rows between unbounded preceding and current row),
    w_before_prev as (partition by spill.student_id order by spill.due_date, spill.installment_no
                      rows between unbounded preceding and 2 preceding)
),
settled as (
  select
    carry.*,
    -- The spill only ever ADDS. Never let it lower what was actually pinned
    -- here, or a family who skipped installment 1 and paid installment 2 in
    -- full would start reading as partly paid on installment 2.
    (carry.settled_amount + greatest(carry.cum_filled - carry.cum_filled_prev, 0))::integer
      as effective_settled
  from carry
)
select
  installment_id, student_id, admission_no, student_name, father_name, father_phone,
  session_label, class_id, class_name, class_label, section, stream_name,
  installment_no, installment_label, due_date,
  base_charge, paid_amount, discount_closeout_amount, adjustment_amount, applied_amount,
  raw_late_fee, waiver_applied, final_late_fee,
  greatest(base_charge + raw_late_fee - waiver_applied, 0)::integer as total_charge,
  -- Fees only. This column never contains a late fee. Reads effective_settled,
  -- so surplus released on an earlier installment lands here.
  greatest(base_charge - effective_settled, 0)::integer as pending_amount,
  -- Late fee only, net of waivers and of any payment that already covered it.
  greatest(final_late_fee - greatest(effective_settled - base_charge, 0), 0)::integer as late_fee_pending,
  -- The two together. Equals what pending_amount used to mean.
  (greatest(base_charge - effective_settled, 0)
     + greatest(final_late_fee - greatest(effective_settled - base_charge, 0), 0))::integer as total_pending,
  case
    when installment_status = 'waived' then 'waived'
    when greatest(base_charge - effective_settled, 0) <= 0 then 'paid'
    when current_date > due_date then 'overdue'
    when effective_settled > 0 then 'partial'
    else 'pending'
  end as balance_status,
  case
    when raw_late_fee <= 0 then 'none'
    when greatest(final_late_fee - greatest(effective_settled - base_charge, 0), 0) > 0 then 'pending'
    when waiver_applied >= raw_late_fee then 'waived'
    else 'paid'
  end as late_fee_status,
  last_payment_date, transport_route_id, transport_route_name, transport_route_code,
  is_carry_forward, source_session_label, is_emi_late_fee
from settled;

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
  'Per-installment financial position. pending_amount is FEES ONLY and never contains a late fee; late_fee_pending carries that separately; total_pending is the two added. Money applied beyond an installment''s own base_charge + final_late_fee spills forward to the next installments, oldest first; anything left after the last one surfaces as credit_balance. balance_status reads paid once fees are clear, whatever the late fee is doing -- late_fee_status carries that. The late-fee CASE and the surplus-spill block are both duplicated verbatim in private.workbook_installment_snapshot and must be edited together.';

-- ===========================================================================
-- 5. Replay the dependents, byte-for-byte
-- ===========================================================================
-- No substitutions this time. 20260812120000 had to rewrite three of these
-- because it changed what pending_amount MEANT; this migration changes only
-- what it evaluates to, so every consumer keeps asking the same question.

do $$
declare
  v_row record;
begin
  for v_row in select * from _spill_dependents order by ord loop
    if v_row.kind = 'm' then
      execute format('create materialized view public.%I as %s', v_row.name, v_row.ddl);
    else
      execute format('create view public.%I as %s', v_row.name, v_row.ddl);
    end if;

    -- Restore the comment from the catalog rather than from a hand-written
    -- block below. A comment nobody re-typed is a comment silently deleted.
    if v_row.note is not null then
      execute format('comment on %s public.%I is %L',
                     case when v_row.kind = 'm' then 'materialized view' else 'view' end,
                     v_row.name, v_row.note);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 5a. Indexes, grants and comments the cascade took with it
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
grant all on public.v_ledger_policy_drift            to anon, authenticated, service_role;

grant select on public.v_workbook_student_financials     to notion_fee_sync_role;
grant select on public.v_notion_student_fee_summary      to notion_fee_sync_role;
grant select on public.v_notion_family_fee_summary       to notion_fee_sync_role;
grant select on public.v_notion_daily_collection_summary to notion_fee_sync_role;

-- Comments are restored inside the replay loop above, from what the catalog
-- actually held, so this migration cannot drop one by forgetting to re-type it.

-- ===========================================================================
-- 6. The snapshot function -- engine A
-- ===========================================================================
-- Rewritten in full rather than string-patched, from the same source text as
-- the matview above. The signature and the return type are unchanged, so the
-- ::regprocedure assertions in 20260812001114 and 20260812022558 stay valid.

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
  ),
  -- >>> SHARED SURPLUS SPILL RULE <<<
  -- Byte-identical to public.v_workbook_installment_balances. Edit both or
  -- neither. 20260812001114 edited only one copy of the late-fee rule and EMI
  -- late fees went invisible to half the app for four days.
  --
  -- Money applied to an installment beyond what that installment can absorb
  -- reduces the NEXT installments' pending, oldest first. Until 20260826120000
  -- there was no such money: posting allocates against total_pending, so nothing
  -- could over-apply a row. An admin waiving a late fee the family had already
  -- paid is the first thing that creates it, and without this the released rupees
  -- are clipped by `greatest(..., 0)` and simply disappear from every
  -- per-installment figure while v_student_financial_state quietly disagrees.
  spill as (
    select
      split.*,
      -- What this row cannot absorb, and what it still has room for. A row can
      -- never have both: surplus > 0 means settled exceeded capacity.
      greatest(split.settled_amount - (split.base_charge + split.final_late_fee), 0)::integer
        as row_surplus,
      greatest((split.base_charge + split.final_late_fee) - split.settled_amount, 0)::integer
        as row_room
    from split
  ),
  carry as (
    select
      spill.*,
      -- Greedy oldest-first fill, in closed form. Cumulative surplus applied
      -- through this row is min(surplus released BEFORE it, room up to and
      -- including it); the row's own share is the step from the previous row's
      -- cumulative. Exclusive prefix on surplus, inclusive on room -- a row may
      -- not absorb its own surplus, and may absorb everything released earlier.
      least(
        coalesce(sum(spill.row_surplus) over w_before, 0),
        coalesce(sum(spill.row_room)   over w_through, 0)
      )::integer as cum_filled,
      least(
        coalesce(sum(spill.row_surplus) over w_before_prev, 0),
        coalesce(sum(spill.row_room)    over w_before,      0)
      )::integer as cum_filled_prev
    from spill
    window
      w_before      as (partition by spill.student_id order by spill.due_date, spill.installment_no
                        rows between unbounded preceding and 1 preceding),
      w_through     as (partition by spill.student_id order by spill.due_date, spill.installment_no
                        rows between unbounded preceding and current row),
      w_before_prev as (partition by spill.student_id order by spill.due_date, spill.installment_no
                        rows between unbounded preceding and 2 preceding)
  ),
  settled as (
    select
      carry.*,
      -- The spill only ever ADDS. Never let it lower what was actually pinned
      -- here, or a family who skipped installment 1 and paid installment 2 in
      -- full would start reading as partly paid on installment 2.
      (carry.settled_amount + greatest(carry.cum_filled - carry.cum_filled_prev, 0))::integer
        as effective_settled
    from carry
  )
  select
    settled.installment_id, settled.student_id, settled.admission_no,
    settled.student_name, settled.father_name, settled.father_phone,
    settled.session_label, settled.class_id, settled.class_name,
    settled.class_label, settled.section, settled.stream_name,
    settled.installment_no, settled.installment_label, settled.due_date,
    settled.base_charge, settled.paid_amount, settled.adjustment_amount,
    settled.applied_amount, settled.raw_late_fee, settled.waiver_applied,
    settled.final_late_fee,
    greatest(settled.base_charge + settled.raw_late_fee - settled.waiver_applied, 0)::integer as total_charge,
    greatest(settled.base_charge - settled.effective_settled, 0)::integer as pending_amount,
    greatest(settled.final_late_fee - greatest(settled.effective_settled - settled.base_charge, 0), 0)::integer as late_fee_pending,
    (greatest(settled.base_charge - settled.effective_settled, 0)
       + greatest(settled.final_late_fee - greatest(settled.effective_settled - settled.base_charge, 0), 0))::integer as total_pending,
    case
      when settled.installment_status = 'waived' then 'waived'
      when greatest(settled.base_charge - settled.effective_settled, 0) <= 0 then 'paid'
      when p_as_of_date > settled.due_date then 'overdue'
      when settled.effective_settled > 0 then 'partial'
      else 'pending'
    end as balance_status,
    case
      when settled.raw_late_fee <= 0 then 'none'
      when greatest(settled.final_late_fee - greatest(settled.effective_settled - settled.base_charge, 0), 0) > 0 then 'pending'
      when settled.waiver_applied >= settled.raw_late_fee then 'waived'
      else 'paid'
    end as late_fee_status,
    settled.last_payment_date, settled.transport_route_id,
    settled.transport_route_name, settled.transport_route_code
  from settled
  order by settled.student_id, settled.installment_no;
$function$;

grant execute on function private.workbook_installment_snapshot(uuid, date, boolean) to authenticated;
grant execute on function private.workbook_installment_snapshot(uuid, date, boolean) to service_role;

comment on function private.workbook_installment_snapshot(uuid,date,boolean) is
  'Per-installment financial snapshot. pending_amount is FEES ONLY; late_fee_pending carries the late fee; total_pending is the two added and is what a cashier can collect against this installment. Money applied beyond an installment''s own base_charge + final_late_fee spills forward to the next installments, oldest first. balance_status reads paid once fees are clear -- late_fee_status carries the late fee separately. p_include_candidate_late is DEPRECATED and ignored. p_as_of_date drives balance_status only; the late fee is always evaluated against current_date so this function and v_workbook_installment_balances cannot disagree.';

-- ===========================================================================
-- 7. Prove nothing moved
-- ===========================================================================

refresh materialized view public.v_workbook_installment_balances;
refresh materialized view public.v_workbook_student_financials;
refresh materialized view public.v_student_financial_state;

do $$
declare
  v_moved bigint;
  v_sample text;
  v_before bigint;
begin
  select count(*), coalesce(min(installment_id::text), '') into v_moved, v_sample
  from (
    select b.installment_id
    from public.v_workbook_installment_balances as b
    join _spill_before as before_row on before_row.installment_id = b.installment_id
    where before_row.pending_amount   is distinct from b.pending_amount
       or before_row.late_fee_pending is distinct from b.late_fee_pending
       or before_row.total_pending    is distinct from b.total_pending
       or before_row.balance_status   is distinct from b.balance_status
       or before_row.late_fee_status  is distinct from b.late_fee_status
  ) as moved;

  if v_moved > 0 then
    -- The spill is only reachable when an installment is over-applied, and
    -- nothing can over-apply one until 20260826120000 exists. If this fires,
    -- some row already carries more money than it charges, and a human has to
    -- look at it BEFORE the spill goes live: it is about to move real dues.
    raise exception
      'surplus spill: % installment row(s) changed, starting at %. Expected none -- investigate before applying.',
      v_moved, v_sample;
  end if;

  -- And the row count must match, or a row was dropped rather than moved.
  select count(*) into v_before from _spill_before;
  select count(*) into v_moved from public.v_workbook_installment_balances;
  if v_moved <> v_before then
    raise exception 'surplus spill: row count changed from % to %', v_before, v_moved;
  end if;
end $$;

commit;
