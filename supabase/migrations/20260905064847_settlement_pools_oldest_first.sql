-- Money settles the installments oldest-first, whatever receipt it arrived on.
--
-- THE PROBLEM
--
-- A payment is pinned to one installment forever: post_student_payment_with_
-- adjustments allocates oldest-first at the moment of posting and writes
-- payments.installment_id, and both engines then read "paid on this row" by
-- joining on that pin. That was fine while the charges never moved. They do
-- move: a transport override, a discount, a class change or a Fee Setup publish
-- re-splits the year, and the generator kept the rows carrying money frozen at
-- their old charge while everything else was redrawn around them. Live case,
-- SR 660: Rs 7,600 paid on 08-04-2026, before installment 1 was even due, and
-- after a fee edit the ledger read
--
--     installment 1   Rs 9,250 pending   Overdue
--     installment 2   Rs 8,750 pending   Overdue
--     installment 3   Rs 0     pending   Paid
--     installment 4   Rs 6,900 pending   Partial
--
-- because the money stayed welded to installments 3 and 4 and the forward-only
-- surplus spill (20260826115000) refuses, by design, to move it backwards. The
-- school's rule is the opposite and is not negotiable: a family's money always
-- clears installment 1, then 2, then 3, then 4. A later installment can never
-- read paid while an earlier one is owed.
--
-- THE RULE FROM HERE (identical text in both engines)
--
--     The ledger reads as if every rupee the family ever paid were posted
--     today, oldest-first, using the counter's own rule -- a row's fees, then
--     its late fee, then the next row -- over the counter's own order:
--     plan_priority (EMI plan rows first), due_date, installment_no.
--
-- The pin is untouched and stays what it always was: the historical record of
-- which installment a receipt was written against. Nothing here writes to
-- payments, receipts or payment_adjustments. applied_amount, paid_amount,
-- adjustment_amount, discount_closeout_amount and base_charge keep their
-- definitions, so total_paid, total_due and credit_balance do not move. What
-- moves is where the money is READ as sitting: a new settled_amount column
-- carries the pooled figure, and pending_amount, late_fee_pending,
-- total_pending, balance_status and late_fee_status are derived from it.
--
-- The late fee is pooled the same way. An installment was settled on time if
-- everything the family had paid by its due date, minus what the rows ahead of
-- it absorb, covers its base. "What the rows ahead of it absorb" includes their
-- own late fees, which is exactly what makes this a recursion: installment 2's
-- late fee depends on whether installment 1 charged one. That is what the
-- WITH RECURSIVE walk below is for. Postgres accepts it in a materialized view
-- and in a `language sql` function, and the live session is ~2,100 rows deep
-- by at most eight steps.
--
-- WHY A STUDENT WHOSE CHARGES NEVER CHANGED DOES NOT MOVE
--
-- The posting RPC filled rows greedily in this same order, each receipt taking
-- min(remaining, base + late fee - settled) per row. A late fee on a row is
-- always present before any receipt dated after that row's due date reaches
-- it, so the cumulative pinned money through row i equals
-- min(pool, sum of capacities through i) -- the same fill this migration
-- computes in one pass. Only students whose rows were re-split after money was
-- posted, reversed on an earlier row, re-ordered by an EMI plan, or split
-- across two sessions move. The migration LISTS them rather than assuming.
--
-- GRANDFATHERING
--
-- Pooling can raise a late fee: a family who skipped installment 1 and paid
-- installment 2 in full now reads installment 1 as paid and installment 2 as
-- short, so installment 2 charges. The school approved the rule, not a
-- back-charge -- the same call it made on 08-08-2026 -- so every increase is
-- cancelled with a `source = 'grandfather'` waiver and the migration asserts
-- that no installment's final_late_fee is higher than it was before. A late fee
-- that FALLS (money dated before a due date that was pinned to a later row)
-- is simply released.
--
-- Both engines are rewritten in full from one source text. The pooled block
-- carries a SHARED POOLED SETTLEMENT RULE marker and the late-fee CASE keeps
-- its SHARED LATE FEE RULE marker, both byte-identical across the two copies,
-- per the convention 20260812001114 taught this repo the hard way.

begin;

-- ===========================================================================
-- 1. Permanent pre-change snapshot
-- ===========================================================================
-- Same shape and access as late_fee_rule_change_snapshot (20260808130401):
-- service-role only, RLS on with no policies. Read by the grandfather insert
-- below and by scripts/verify-late-fee-health.mjs invariant 5. Never read by
-- application code.

refresh materialized view public.v_workbook_installment_balances;
refresh materialized view public.v_workbook_student_financials;
refresh materialized view public.v_student_financial_state;

create table public.settlement_pool_change_snapshot (
  installment_id           uuid primary key,
  student_id               uuid not null,
  session_label            text not null,
  installment_no           smallint,
  due_date                 date,
  base_charge              integer not null,
  paid_amount              integer not null,
  adjustment_amount        integer not null,
  applied_amount           integer not null,
  discount_closeout_amount integer not null,
  raw_late_fee             integer not null,
  waiver_applied           integer not null,
  final_late_fee           integer not null,
  total_charge             integer not null,
  pending_amount           integer not null,
  late_fee_pending         integer not null,
  total_pending            integer not null,
  balance_status           text not null,
  late_fee_status          text not null,
  captured_at              timestamptz not null default now()
);

comment on table public.settlement_pool_change_snapshot is
  'Immutable record of every installment''s position the moment BEFORE settlement became pooled oldest-first (20260905090000). Read by the grandfather backfill in that migration and by scripts/verify-late-fee-health.mjs. Never read by application code.';

insert into public.settlement_pool_change_snapshot (
  installment_id, student_id, session_label, installment_no, due_date,
  base_charge, paid_amount, adjustment_amount, applied_amount, discount_closeout_amount,
  raw_late_fee, waiver_applied, final_late_fee, total_charge,
  pending_amount, late_fee_pending, total_pending, balance_status, late_fee_status
)
select
  b.installment_id, b.student_id, b.session_label, b.installment_no, b.due_date,
  b.base_charge, b.paid_amount, b.adjustment_amount, b.applied_amount, b.discount_closeout_amount,
  b.raw_late_fee, b.waiver_applied, b.final_late_fee, b.total_charge,
  b.pending_amount, b.late_fee_pending, b.total_pending, b.balance_status, b.late_fee_status
from public.v_workbook_installment_balances as b;

alter table public.settlement_pool_change_snapshot enable row level security;
revoke all on table public.settlement_pool_change_snapshot from public, anon, authenticated;
grant all on table public.settlement_pool_change_snapshot to service_role;

-- ===========================================================================
-- 2. Capture every dependent of the balances matview before dropping it
-- ===========================================================================
-- 20260826115000's list, checked against the catalog rather than trusted.
-- Every one is replayed with its comment and its reloptions (security_invoker
-- lives there, and a bare `create view ... as <viewdef>` drops it).

create temporary table _pool_dependents
  (ord int, name text, kind text, ddl text, note text, opts text[])
  on commit drop;

insert into _pool_dependents (ord, name, kind, ddl, note, opts)
select
  ord, name, kind,
  pg_get_viewdef(format('public.%I', name)::regclass, true),
  obj_description(format('public.%I', name)::regclass, 'pg_class'),
  (select c.reloptions from pg_class c
     join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'public' and c.relname = t.name)
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
  (10, 'v_ledger_policy_drift',             'v')
) as t(ord, name, kind);

do $$
declare
  v_missing int;
  v_unlisted text;
begin
  select count(*) into v_missing from _pool_dependents where coalesce(ddl, '') = '';
  if v_missing > 0 then
    raise exception 'pooled settlement: % dependent definition(s) came back empty', v_missing;
  end if;

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
      and not exists (select 1 from _pool_dependents dep where dep.name = c.relname::text)
  ) as unlisted;

  if v_unlisted is not null then
    raise exception
      'pooled settlement: the cascade would also drop %, which this migration does not replay. Add it to the list above before applying.',
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
with recursive session_policy as (
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
    route_row.route_code as transport_route_code,
    -- The counter's first sort key: rows covered by the student's ACTIVE EMI
    -- plan are settled before everything else, exactly as
    -- post_student_payment_with_adjustments orders them.
    case
      when exists (
        select 1
        from public.student_repayment_plan_items as plan_item
        join public.student_repayment_plans as plan_row on plan_row.id = plan_item.plan_id
        where plan_item.installment_id = i.id
          and plan_row.lifecycle = 'active'
      ) then 0
      else 1
    end as plan_priority
  from public.installments as i
  join public.students as s on s.id = i.student_id
  join public.classes as c on c.id = i.class_id
  join session_policy as policy_row on policy_row.academic_session_label = c.session_label
  left join public.transport_routes as route_row on route_row.id = s.transport_route_id
  where i.status <> 'cancelled'
),
rolled as (
  -- The pin, per row. Kept as the historical record and as the source of the
  -- per-student totals; never read as "paid on this row" any more.
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
    payment_row.last_payment_date
  from session_installments
  left join lateral (
    select
      coalesce(sum(payment_row.amount) filter (where receipt_row.payment_mode <> 'discount'), 0) as paid_amount,
      coalesce(sum(payment_row.amount) filter (where receipt_row.payment_mode = 'discount'), 0) as discount_closeout_amount,
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
),
-- >>> SHARED POOLED SETTLEMENT RULE <<<
-- Byte-identical to private.workbook_installment_snapshot. Edit both or
-- neither. 20260812001114 edited only one copy of the late-fee rule and EMI
-- late fees went invisible to half the app for four days.
--
-- Every rupee the family paid in this session is one pool. It settles the rows
-- in the counter's order -- plan_priority, due_date, installment_no -- and on
-- each row it covers the fees first, then the late fee, before moving on. The
-- pin on payments.installment_id is history, not position.
student_money as (
  -- Each counted rupee with the date it arrived, for the on-time test. A
  -- reversal carries the date of the receipt it reverses, so reversing an
  -- on-time payment re-charges the late fee correctly.
  select
    rolled.student_id, rolled.session_label,
    receipt_row.payment_date, payment_row.amount::bigint as amount
  from rolled
  join public.payments as payment_row on payment_row.installment_id = rolled.installment_id
  join public.receipts as receipt_row on receipt_row.id = payment_row.receipt_id
  union all
  select
    rolled.student_id, rolled.session_label,
    adj_receipt.payment_date, adj.amount_delta::bigint as amount
  from rolled
  join public.payment_adjustments as adj on adj.installment_id = rolled.installment_id
  join public.payments as adj_payment on adj_payment.id = adj.payment_id
  join public.receipts as adj_receipt on adj_receipt.id = adj_payment.receipt_id
),
ordered as (
  select
    rolled.*,
    row_number() over (
      partition by rolled.student_id, rolled.session_label
      order by rolled.plan_priority, rolled.due_date, rolled.installment_no, rolled.installment_id
    )::integer as settlement_rank,
    sum(rolled.applied_amount + rolled.discount_closeout_amount) over (
      partition by rolled.student_id, rolled.session_label
    )::bigint as pool_total,
    coalesce(by_due.amount, 0)::bigint as pool_by_due_amount
  from rolled
  left join lateral (
    select greatest(coalesce(sum(money_row.amount), 0), 0) as amount
    from student_money as money_row
    where money_row.student_id = rolled.student_id
      and money_row.session_label = rolled.session_label
      and money_row.payment_date <= rolled.due_date
  ) as by_due on true
),
walk as (
  -- One step per row, in settlement order. capacity_after is what this row
  -- and every row before it can absorb: base + final late fee each.
  select
    seed.student_id, seed.session_label,
    0::integer as settlement_rank,
    0::bigint as capacity_after,
    0::integer as raw_late_fee, 0::integer as waiver_applied, 0::integer as final_late_fee
  from (select distinct student_id, session_label from ordered) as seed
  union all
  select
    step.student_id, step.session_label, step.settlement_rank,
    walk.capacity_after + step.base_charge + late_fee.final_late_fee,
    late_fee.raw_late_fee, late_fee.waiver_applied, late_fee.final_late_fee
  from walk
  join ordered as step
    on step.student_id = walk.student_id
   and step.session_label = walk.session_label
   and step.settlement_rank = walk.settlement_rank + 1
  left join public.v_effective_late_fee_waivers as waiver_row
    on waiver_row.installment_id = step.installment_id
  cross join lateral (
    select
      raw.raw_late_fee,
      least(raw.raw_late_fee, coalesce(waiver_row.waiver_amount, 0))::integer as waiver_applied,
      greatest(raw.raw_late_fee - least(raw.raw_late_fee, coalesce(waiver_row.waiver_amount, 0)), 0)::integer as final_late_fee
    from (
      select
        -- >>> SHARED LATE FEE RULE <<<
        -- Byte-identical to private.workbook_installment_snapshot. If you edit
        -- one, edit the other in the same migration.
        --
        -- Branch order is deliberate:
        --   1. a 'waived' installment status outranks everything.
        --   2. late_fee_flat_amount <= 0 is the carry-forward guard -- previous-year
        --      rows carry a flat 0 and must never accrue.
        --   3. an EMI late-fee row IS the charge, so it is tested before the
        --      base_charge guard that would otherwise zero it.
        --   4. the on-time test is POOLED: everything paid by this row's due date,
        --      minus what the rows ahead of it absorb (their base and their own
        --      late fee), covers this row's base.
        --   5. current_date, not an as-of date. A late fee is a fact about today.
        case
          when step.installment_status = 'waived' then 0
          when coalesce(step.late_fee_flat_amount, 0) <= 0 then 0
          when step.is_emi_late_fee then
            case when current_date > step.due_date
                 then step.late_fee_flat_amount else 0 end
          when step.base_charge <= 0 then 0
          when step.pool_by_due_amount >= walk.capacity_after + step.base_charge then 0
          when current_date > step.due_date then step.late_fee_flat_amount
          else 0
        end::integer as raw_late_fee
    ) as raw
  ) as late_fee
),
settled as (
  select
    ordered.*,
    walk.raw_late_fee, walk.waiver_applied, walk.final_late_fee,
    -- The pool fills this row after everything ahead of it is full, up to
    -- its own capacity. Fees first, then the late fee.
    least(
      greatest(ordered.pool_total - (walk.capacity_after - ordered.base_charge - walk.final_late_fee), 0),
      (ordered.base_charge + walk.final_late_fee)::bigint
    )::integer as settled_amount
  from ordered
  join walk
    on walk.student_id = ordered.student_id
   and walk.session_label = ordered.session_label
   and walk.settlement_rank = ordered.settlement_rank
),
final_split as (
  select
    settled.*,
    least(settled.settled_amount, settled.base_charge)::integer as fee_settled_amount,
    (settled.settled_amount - least(settled.settled_amount, settled.base_charge))::integer as late_fee_settled_amount
  from settled
)
-- <<< SHARED POOLED SETTLEMENT RULE >>>
select
  installment_id, student_id, admission_no, student_name, father_name, father_phone,
  session_label, class_id, class_name, class_label, section, stream_name,
  installment_no, installment_label, due_date,
  base_charge, paid_amount, discount_closeout_amount, adjustment_amount, applied_amount,
  raw_late_fee, waiver_applied, final_late_fee,
  greatest(base_charge + raw_late_fee - waiver_applied, 0)::integer as total_charge,
  -- Fees only. This column never contains a late fee.
  greatest(base_charge - fee_settled_amount, 0)::integer as pending_amount,
  -- Late fee only, net of waivers and of any pooled money that reached it.
  greatest(final_late_fee - late_fee_settled_amount, 0)::integer as late_fee_pending,
  -- The two together. What a cashier can collect against this row.
  (greatest(base_charge - fee_settled_amount, 0)
     + greatest(final_late_fee - late_fee_settled_amount, 0))::integer as total_pending,
  case
    when installment_status = 'waived' then 'waived'
    when greatest(base_charge - fee_settled_amount, 0) <= 0 then 'paid'
    when current_date > due_date then 'overdue'
    when settled_amount > 0 then 'partial'
    else 'pending'
  end as balance_status,
  case
    when raw_late_fee <= 0 then 'none'
    when greatest(final_late_fee - late_fee_settled_amount, 0) > 0 then 'pending'
    when waiver_applied >= raw_late_fee then 'waived'
    else 'paid'
  end as late_fee_status,
  last_payment_date, transport_route_id, transport_route_name, transport_route_code,
  is_carry_forward, source_session_label, is_emi_late_fee,
  -- New since 20260905090000. What the pool says sits on this row, and how it
  -- splits between fees and late fee. applied_amount above is the PIN.
  settled_amount, fee_settled_amount, late_fee_settled_amount,
  plan_priority, settlement_rank
from final_split;

create unique index v_workbook_installment_balances_idx
  on public.v_workbook_installment_balances using btree (installment_id);
create index idx_v_workbook_installments_session
  on public.v_workbook_installment_balances using btree (session_label);
create index idx_v_workbook_installments_student
  on public.v_workbook_installment_balances using btree (student_id);
create index idx_v_workbook_installments_student_carry
  on public.v_workbook_installment_balances using btree (student_id) where is_carry_forward;

comment on materialized view public.v_workbook_installment_balances is
  'Per-installment financial position. Money settles the installments OLDEST-FIRST at read time, whatever installment a receipt was pinned to: settled_amount is what the pool says sits on this row, applied_amount is the historical pin. pending_amount is FEES ONLY and never contains a late fee; late_fee_pending carries that separately; total_pending is the two added. balance_status reads paid once fees are clear, whatever the late fee is doing -- late_fee_status carries that. The late-fee CASE and the pooled-settlement block are both duplicated verbatim in private.workbook_installment_snapshot and must be edited together.';

-- ===========================================================================
-- 5. Replay the dependents
-- ===========================================================================
-- One substitution. v_workbook_student_financials recomputed each row's
-- pending by hand from the pin --
--   GREATEST(base_charge - applied_amount - discount_closeout_amount, 0)
-- -- and drove base_outstanding_amount, inst1..4_pending, next_due_* and the
-- paid / partly-paid / overdue counts off it. 20260826115000 replayed that
-- byte-for-byte, which is why the spill never reached the student list. Under
-- pooling those columns must read the engine's pending_amount, and "carries
-- money" must read settled_amount > 0. paid_installment1..4 read the pooled
-- figure too, so the four per-installment columns on the student list agree
-- with the installment table on the student page.
--
-- Every anchor is asserted before it is replaced, and the old expression is
-- asserted gone afterwards, so a viewdef that has drifted from what this
-- migration expects aborts the transaction instead of half-applying.

do $$
declare
  v_row   record;
  v_ddl   text;
  v_old_pending  constant text :=
    'GREATEST(v_workbook_installment_balances.base_charge - v_workbook_installment_balances.applied_amount - v_workbook_installment_balances.discount_closeout_amount, 0)';
  v_old_touched  constant text :=
    '(v_workbook_installment_balances.applied_amount > 0 OR v_workbook_installment_balances.discount_closeout_amount > 0)';
  v_old_paid     constant text :=
    'THEN v_workbook_installment_balances.paid_amount';
begin
  for v_row in select * from _pool_dependents order by ord loop
    v_ddl := v_row.ddl;

    if v_row.name = 'v_workbook_student_financials' then
      if position(v_old_pending in v_ddl) = 0 then
        raise exception 'pooled settlement: financials per-row pending anchor not found';
      end if;
      if position(v_old_touched in v_ddl) = 0 then
        raise exception 'pooled settlement: financials "carries money" anchor not found';
      end if;
      if position(v_old_paid in v_ddl) = 0 then
        raise exception 'pooled settlement: financials paid_installmentN anchor not found';
      end if;

      -- Order matters: the "carries money" predicate is replaced before the
      -- per-row pending expression so the two substitutions cannot overlap.
      v_ddl := replace(v_ddl, v_old_touched, 'v_workbook_installment_balances.settled_amount > 0');
      v_ddl := replace(v_ddl, v_old_pending, 'v_workbook_installment_balances.pending_amount');
      v_ddl := replace(v_ddl, v_old_paid, 'THEN v_workbook_installment_balances.settled_amount');

      if position('base_charge - v_workbook_installment_balances.applied_amount' in v_ddl) > 0 then
        raise exception 'pooled settlement: financials still recomputes pending from the pin after substitution';
      end if;
    end if;

    if v_row.kind = 'm' then
      execute format('create materialized view public.%I as %s', v_row.name, v_ddl);
    else
      execute format('create view public.%I as %s', v_row.name, v_ddl);
    end if;

    if v_row.note is not null then
      execute format('comment on %s public.%I is %L',
                     case when v_row.kind = 'm' then 'materialized view' else 'view' end,
                     v_row.name, v_row.note);
    end if;

    if v_row.kind = 'v' and v_row.opts is not null then
      execute format('alter view public.%I set (%s)',
                     v_row.name, array_to_string(v_row.opts, ', '));
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

-- The 20260819120000 access list. anon reads nothing in this product.
grant all    on public.v_workbook_student_financials    to authenticated, service_role;
grant all    on public.v_workbook_installment_balances  to authenticated, service_role;
grant all    on public.v_student_carry_forward_balances to authenticated, service_role;
grant all    on public.v_student_installment_facets     to authenticated, service_role;
grant all    on public.v_student_repayment_plan_status  to authenticated, service_role;
grant all    on public.v_student_financial_state        to authenticated, service_role;
grant all    on public.v_student_directory              to authenticated, service_role;
grant select on public.v_ledger_policy_drift            to authenticated, service_role;

grant select on
  public.v_notion_student_fee_summary,
  public.v_notion_family_fee_summary,
  public.v_notion_daily_collection_summary
to notion_fee_sync_role, service_role;

grant select on public.v_workbook_student_financials    to notion_fee_sync_role;
grant select on public.v_workbook_installment_balances  to notion_fee_sync_role;

revoke all on
  public.v_workbook_student_financials,
  public.v_workbook_installment_balances,
  public.v_student_financial_state,
  public.v_student_carry_forward_balances,
  public.v_student_directory,
  public.v_student_installment_facets,
  public.v_student_repayment_plan_status,
  public.v_notion_student_fee_summary,
  public.v_notion_family_fee_summary,
  public.v_notion_daily_collection_summary,
  public.v_ledger_policy_drift
from anon;

revoke all on
  public.v_notion_student_fee_summary,
  public.v_notion_family_fee_summary,
  public.v_notion_daily_collection_summary
from authenticated;

-- ===========================================================================
-- 6. The snapshot function -- engine A
-- ===========================================================================
-- Rewritten in full from the same source text as the matview above. The
-- signature is unchanged, so the ::regprocedure assertions in 20260812001114
-- and 20260812022558 stay valid; the return table gains the five pooled
-- columns at the END so every caller that names its columns keeps working.

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
  transport_route_id uuid, transport_route_name text, transport_route_code text,
  settled_amount integer, fee_settled_amount integer, late_fee_settled_amount integer,
  plan_priority integer, settlement_rank integer
)
language sql
stable
set search_path to 'public', 'private'
as $function$
  with recursive session_policy as (
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
      route_row.route_code as transport_route_code,
      case
        when exists (
          select 1
          from public.student_repayment_plan_items as plan_item
          join public.student_repayment_plans as plan_row on plan_row.id = plan_item.plan_id
          where plan_item.installment_id = i.id
            and plan_row.lifecycle = 'active'
        ) then 0
        else 1
      end as plan_priority
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
      payment_row.last_payment_date
    from session_installments
    left join lateral (
      select
        coalesce(sum(payment_row.amount) filter (where receipt_row.payment_mode <> 'discount'), 0) as paid_amount,
        coalesce(sum(payment_row.amount) filter (where receipt_row.payment_mode = 'discount'), 0) as discount_closeout_amount,
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
  ),
  -- >>> SHARED POOLED SETTLEMENT RULE <<<
  -- Byte-identical to public.v_workbook_installment_balances. Edit both or
  -- neither. 20260812001114 edited only one copy of the late-fee rule and EMI
  -- late fees went invisible to half the app for four days.
  --
  -- Every rupee the family paid in this session is one pool. It settles the rows
  -- in the counter's order -- plan_priority, due_date, installment_no -- and on
  -- each row it covers the fees first, then the late fee, before moving on. The
  -- pin on payments.installment_id is history, not position.
  student_money as (
    -- Each counted rupee with the date it arrived, for the on-time test. A
    -- reversal carries the date of the receipt it reverses, so reversing an
    -- on-time payment re-charges the late fee correctly.
    select
      rolled.student_id, rolled.session_label,
      receipt_row.payment_date, payment_row.amount::bigint as amount
    from rolled
    join public.payments as payment_row on payment_row.installment_id = rolled.installment_id
    join public.receipts as receipt_row on receipt_row.id = payment_row.receipt_id
    union all
    select
      rolled.student_id, rolled.session_label,
      adj_receipt.payment_date, adj.amount_delta::bigint as amount
    from rolled
    join public.payment_adjustments as adj on adj.installment_id = rolled.installment_id
    join public.payments as adj_payment on adj_payment.id = adj.payment_id
    join public.receipts as adj_receipt on adj_receipt.id = adj_payment.receipt_id
  ),
  ordered as (
    select
      rolled.*,
      row_number() over (
        partition by rolled.student_id, rolled.session_label
        order by rolled.plan_priority, rolled.due_date, rolled.installment_no, rolled.installment_id
      )::integer as settlement_rank,
      sum(rolled.applied_amount + rolled.discount_closeout_amount) over (
        partition by rolled.student_id, rolled.session_label
      )::bigint as pool_total,
      coalesce(by_due.amount, 0)::bigint as pool_by_due_amount
    from rolled
    left join lateral (
      select greatest(coalesce(sum(money_row.amount), 0), 0) as amount
      from student_money as money_row
      where money_row.student_id = rolled.student_id
        and money_row.session_label = rolled.session_label
        and money_row.payment_date <= rolled.due_date
    ) as by_due on true
  ),
  walk as (
    -- One step per row, in settlement order. capacity_after is what this row
    -- and every row before it can absorb: base + final late fee each.
    select
      seed.student_id, seed.session_label,
      0::integer as settlement_rank,
      0::bigint as capacity_after,
      0::integer as raw_late_fee, 0::integer as waiver_applied, 0::integer as final_late_fee
    from (select distinct student_id, session_label from ordered) as seed
    union all
    select
      step.student_id, step.session_label, step.settlement_rank,
      walk.capacity_after + step.base_charge + late_fee.final_late_fee,
      late_fee.raw_late_fee, late_fee.waiver_applied, late_fee.final_late_fee
    from walk
    join ordered as step
      on step.student_id = walk.student_id
     and step.session_label = walk.session_label
     and step.settlement_rank = walk.settlement_rank + 1
    left join public.v_effective_late_fee_waivers as waiver_row
      on waiver_row.installment_id = step.installment_id
    cross join lateral (
      select
        raw.raw_late_fee,
        least(raw.raw_late_fee, coalesce(waiver_row.waiver_amount, 0))::integer as waiver_applied,
        greatest(raw.raw_late_fee - least(raw.raw_late_fee, coalesce(waiver_row.waiver_amount, 0)), 0)::integer as final_late_fee
      from (
        select
          -- >>> SHARED LATE FEE RULE <<<
          -- Byte-identical to v_workbook_installment_balances above. Edit both or
          -- neither -- 20260812001114 edited only this copy and EMI late fees went
          -- invisible to every read surface for four days.
          case
            when step.installment_status = 'waived' then 0
            when coalesce(step.late_fee_flat_amount, 0) <= 0 then 0
            when step.is_emi_late_fee then
              case when current_date > step.due_date
                   then step.late_fee_flat_amount else 0 end
            when step.base_charge <= 0 then 0
            when step.pool_by_due_amount >= walk.capacity_after + step.base_charge then 0
            when current_date > step.due_date then step.late_fee_flat_amount
            else 0
          end::integer as raw_late_fee
      ) as raw
    ) as late_fee
  ),
  settled as (
    select
      ordered.*,
      walk.raw_late_fee, walk.waiver_applied, walk.final_late_fee,
      -- The pool fills this row after everything ahead of it is full, up to
      -- its own capacity. Fees first, then the late fee.
      least(
        greatest(ordered.pool_total - (walk.capacity_after - ordered.base_charge - walk.final_late_fee), 0),
        (ordered.base_charge + walk.final_late_fee)::bigint
      )::integer as settled_amount
    from ordered
    join walk
      on walk.student_id = ordered.student_id
     and walk.session_label = ordered.session_label
     and walk.settlement_rank = ordered.settlement_rank
  ),
  final_split as (
    select
      settled.*,
      least(settled.settled_amount, settled.base_charge)::integer as fee_settled_amount,
      (settled.settled_amount - least(settled.settled_amount, settled.base_charge))::integer as late_fee_settled_amount
    from settled
  )
  -- <<< SHARED POOLED SETTLEMENT RULE >>>
  select
    final_split.installment_id, final_split.student_id, final_split.admission_no,
    final_split.student_name, final_split.father_name, final_split.father_phone,
    final_split.session_label, final_split.class_id, final_split.class_name,
    final_split.class_label, final_split.section, final_split.stream_name,
    final_split.installment_no, final_split.installment_label, final_split.due_date,
    final_split.base_charge, final_split.paid_amount, final_split.adjustment_amount,
    final_split.applied_amount, final_split.raw_late_fee, final_split.waiver_applied,
    final_split.final_late_fee,
    greatest(final_split.base_charge + final_split.raw_late_fee - final_split.waiver_applied, 0)::integer as total_charge,
    greatest(final_split.base_charge - final_split.fee_settled_amount, 0)::integer as pending_amount,
    greatest(final_split.final_late_fee - final_split.late_fee_settled_amount, 0)::integer as late_fee_pending,
    (greatest(final_split.base_charge - final_split.fee_settled_amount, 0)
       + greatest(final_split.final_late_fee - final_split.late_fee_settled_amount, 0))::integer as total_pending,
    case
      when final_split.installment_status = 'waived' then 'waived'
      when greatest(final_split.base_charge - final_split.fee_settled_amount, 0) <= 0 then 'paid'
      when p_as_of_date > final_split.due_date then 'overdue'
      when final_split.settled_amount > 0 then 'partial'
      else 'pending'
    end as balance_status,
    case
      when final_split.raw_late_fee <= 0 then 'none'
      when greatest(final_split.final_late_fee - final_split.late_fee_settled_amount, 0) > 0 then 'pending'
      when final_split.waiver_applied >= final_split.raw_late_fee then 'waived'
      else 'paid'
    end as late_fee_status,
    final_split.last_payment_date, final_split.transport_route_id,
    final_split.transport_route_name, final_split.transport_route_code,
    final_split.settled_amount, final_split.fee_settled_amount, final_split.late_fee_settled_amount,
    final_split.plan_priority, final_split.settlement_rank
  from final_split
  order by final_split.student_id, final_split.installment_no;
$function$;

grant execute on function private.workbook_installment_snapshot(uuid, date, boolean) to authenticated;
grant execute on function private.workbook_installment_snapshot(uuid, date, boolean) to service_role;

comment on function private.workbook_installment_snapshot(uuid,date,boolean) is
  'Per-installment financial snapshot. Money settles the installments OLDEST-FIRST at read time: settled_amount is what the pool says sits on this row, applied_amount is the historical pin. pending_amount is FEES ONLY; late_fee_pending carries the late fee; total_pending is the two added and is what a cashier can collect against this installment. balance_status reads paid once fees are clear -- late_fee_status carries the late fee separately. p_include_candidate_late is DEPRECATED and ignored. p_as_of_date drives balance_status only; the late fee is always evaluated against current_date so this function and v_workbook_installment_balances cannot disagree.';

-- ---------------------------------------------------------------------------
-- 6a. preview_workbook_payment_allocation -- the Payment Desk's read model
-- ---------------------------------------------------------------------------
-- Gains the pooled columns so the desk can show what the pool has already
-- placed on each row. Ordering, filter and the permission predicate are
-- unchanged from 20260812120000.

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
  transport_route_id uuid, transport_route_name text, transport_route_code text,
  settled_amount integer, fee_settled_amount integer, late_fee_settled_amount integer,
  plan_priority integer
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
    snapshot_row.transport_route_name, snapshot_row.transport_route_code,
    snapshot_row.settled_amount, snapshot_row.fee_settled_amount,
    snapshot_row.late_fee_settled_amount, snapshot_row.plan_priority
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
  order by snapshot_row.plan_priority asc, snapshot_row.due_date asc, snapshot_row.installment_no asc;
$function$;

grant execute on function public.preview_workbook_payment_allocation(uuid, date) to authenticated;
grant execute on function public.preview_workbook_payment_allocation(uuid, date) to service_role;

-- ---------------------------------------------------------------------------
-- 6b. Activating or cancelling an EMI plan re-orders settlement, so it must
-- refresh the projections like every other money-moving write does.
-- ---------------------------------------------------------------------------

drop trigger if exists refresh_financials_on_repayment_plan on public.student_repayment_plans;
create trigger refresh_financials_on_repayment_plan
  after insert or update of lifecycle or delete on public.student_repayment_plans
  for each statement execute function public.trigger_refresh_financial_views();

-- ---------------------------------------------------------------------------
-- 6c. The generator no longer freezes rows for carrying money. The two locks
-- it keeps -- an active EMI plan, and a moved due date on a paid row, which
-- re-runs the late-fee clock -- must be storable by both review tables.
-- ---------------------------------------------------------------------------

alter table public.config_change_blocked_installments
  drop constraint if exists config_change_blocked_installments_reason_code_check;

alter table public.config_change_blocked_installments
  add constraint config_change_blocked_installments_reason_code_check
  check (
    reason_code = any (
      array['fully_paid', 'partially_paid', 'adjustment_posted', 'in_repayment_plan', 'due_date_changed']
    )
  );

alter table public.ledger_regeneration_rows
  drop constraint if exists ledger_regeneration_rows_reason_code_check;

alter table public.ledger_regeneration_rows
  add constraint ledger_regeneration_rows_reason_code_check
  check (
    reason_code = any (
      array[
        'missing_installment',
        'already_in_sync',
        'fully_paid',
        'partially_paid',
        'adjustment_posted',
        'existing_waived',
        'existing_cancelled',
        'extra_installment',
        'missing_settings',
        'discount_reduces_unpaid',
        'charge_rise_on_unsettled',
        -- The preview now holds the same rows the generator holds.
        'in_repayment_plan',
        'due_date_changed'
      ]
    )
  );

-- ===========================================================================
-- 7. Prove what moved, grandfather the late fees, and assert the invariants
-- ===========================================================================

refresh materialized view public.v_workbook_installment_balances;

do $$
declare
  v_count bigint;
  v_sample text;
begin
  -- The pin and the charges are untouched by construction. If any of these
  -- moved, this migration changed something it promised not to.
  select count(*), coalesce(min(b.installment_id::text), '') into v_count, v_sample
  from public.v_workbook_installment_balances as b
  join public.settlement_pool_change_snapshot as snap on snap.installment_id = b.installment_id
  where snap.base_charge              is distinct from b.base_charge
     or snap.paid_amount              is distinct from b.paid_amount
     or snap.adjustment_amount        is distinct from b.adjustment_amount
     or snap.applied_amount           is distinct from b.applied_amount
     or snap.discount_closeout_amount is distinct from b.discount_closeout_amount;
  if v_count > 0 then
    raise exception 'pooled settlement: % row(s) changed a pinned figure, starting at %', v_count, v_sample;
  end if;

  select count(*) into v_count from public.settlement_pool_change_snapshot;
  select count(*) - v_count into v_count from public.v_workbook_installment_balances;
  if v_count <> 0 then
    raise exception 'pooled settlement: row count moved by %', v_count;
  end if;
end $$;

-- Every late fee that ROSE because money moved between rows is cancelled.
insert into public.student_late_fee_waivers (
  student_id, installment_id, session_label, amount, reason, source
)
select
  bal.student_id,
  bal.installment_id,
  bal.session_label,
  bal.final_late_fee - snap.final_late_fee,
  'Grandfathered: the ledger now settles installments oldest-first (20260905090000) and this installment''s late fee rose as a result. The school approved the rule, not a back-charge. Void this waiver to bill it.',
  'grandfather'
from public.v_workbook_installment_balances as bal
join public.settlement_pool_change_snapshot as snap
  on snap.installment_id = bal.installment_id
where bal.final_late_fee > snap.final_late_fee;

refresh materialized view public.v_workbook_installment_balances;
refresh materialized view public.v_workbook_student_financials;
refresh materialized view public.v_student_financial_state;

do $$
declare
  v_count bigint;
  v_rupees bigint;
  v_sample text;
  v_row record;
  v_shown int := 0;
begin
  -- Nobody's late fee is higher than it was.
  select count(*), coalesce(min(b.installment_id::text), '') into v_count, v_sample
  from public.v_workbook_installment_balances as b
  join public.settlement_pool_change_snapshot as snap on snap.installment_id = b.installment_id
  where b.final_late_fee > snap.final_late_fee;
  if v_count > 0 then
    raise exception 'pooled settlement: % installment(s) still charge more late fee than before, starting at %', v_count, v_sample;
  end if;

  -- Per student and session, what the rows say is owed equals the whole year's
  -- charge minus everything settled -- invariant 9 of verify-late-fee-health.
  select count(*), coalesce(min(student_id::text), '') into v_count, v_sample
  from (
    select student_id, session_label
    from public.v_workbook_installment_balances
    group by student_id, session_label
    having sum(total_pending) <> greatest(sum(total_charge) - sum(applied_amount + discount_closeout_amount), 0)
  ) as diverging;
  if v_count > 0 then
    raise exception 'pooled settlement: % student/session pair(s) where per-row dues disagree with charge - settled, starting at %', v_count, v_sample;
  end if;

  -- The rule itself: no row carries money while a row ahead of it still owes.
  select count(*), coalesce(min(later.installment_id::text), '') into v_count, v_sample
  from public.v_workbook_installment_balances as later
  join public.v_workbook_installment_balances as earlier
    on earlier.student_id = later.student_id
   and earlier.session_label = later.session_label
   and earlier.settlement_rank < later.settlement_rank
  where later.settled_amount > 0
    and earlier.total_pending > 0;
  if v_count > 0 then
    raise exception 'pooled settlement: % row(s) read settled behind a row that still owes, starting at %', v_count, v_sample;
  end if;

  -- Report, do not hide: who moved, and what was grandfathered.
  select count(*), coalesce(sum(amount), 0) into v_count, v_rupees
  from public.student_late_fee_waivers
  where source = 'grandfather'
    and reason like 'Grandfathered: the ledger now settles installments oldest-first (20260905090000)%';
  raise notice 'pooled settlement: % late-fee increase(s) grandfathered, Rs % in total', v_count, v_rupees;

  select count(distinct b.student_id) into v_count
  from public.v_workbook_installment_balances as b
  join public.settlement_pool_change_snapshot as snap on snap.installment_id = b.installment_id
  where snap.pending_amount   is distinct from b.pending_amount
     or snap.late_fee_pending is distinct from b.late_fee_pending
     or snap.balance_status   is distinct from b.balance_status
     or snap.late_fee_status  is distinct from b.late_fee_status;
  raise notice 'pooled settlement: % student(s) read differently than before', v_count;

  for v_row in
    select b.admission_no, b.session_label,
           string_agg(
             format('#%s %s->%s %s->%s', b.installment_no,
                    snap.pending_amount, b.pending_amount, snap.balance_status, b.balance_status),
             ', ' order by b.settlement_rank
           ) as moved
    from public.v_workbook_installment_balances as b
    join public.settlement_pool_change_snapshot as snap on snap.installment_id = b.installment_id
    where snap.pending_amount   is distinct from b.pending_amount
       or snap.late_fee_pending is distinct from b.late_fee_pending
       or snap.balance_status   is distinct from b.balance_status
       or snap.late_fee_status  is distinct from b.late_fee_status
    group by b.student_id, b.admission_no, b.session_label
    order by b.session_label, b.admission_no
  loop
    exit when v_shown >= 200;
    v_shown := v_shown + 1;
    raise notice 'pooled settlement: SR % (%): %', v_row.admission_no, v_row.session_label, v_row.moved;
  end loop;
end $$;

notify pgrst, 'reload schema';

commit;
