-- One late-fee rule in both engines, waivers moved to per-installment rows, and
-- the whole rule change grandfathered -- atomically.
--
-- ===========================================================================
-- What was wrong
-- ===========================================================================
--
-- Two engines disagreed about when a Rs 1,000 late fee is owed:
--
--   private.workbook_installment_snapshot  (Payment Desk, posting RPC, waiver)
--     charged as soon as an installment was overdue, but dropped the charge to
--     zero the moment the base was fully paid -- so a late fee could in
--     practice never be collected.
--   v_workbook_installment_balances        (dashboard, defaulters, profile)
--     charged only once a payment landed after the due date -- so a student who
--     never paid at all read Rs 0.
--
-- And a waiver was a single rupee POOL on student_fee_overrides, with no
-- installment and no session attached, re-allocated on every read to whichever
-- installment happened to sort first. Post a partial payment, the set of
-- charged installments changes, the pool slides, and the fee the cashier
-- forgave is charged again. That is the reported bug: "waiving the late fee
-- keeps coming back if I waived it during a partial payment."
--
-- ===========================================================================
-- The rule from here (identical text in both engines)
-- ===========================================================================
--
--     an installment past its due date with base still unsettled owes the flat
--     late fee, and keeps owing it until paid or explicitly waived.
--
-- CASE order is deliberate:
--   1. `waived` installment status wins over everything.
--   2. `late_fee_flat_amount <= 0` is tested BEFORE anything money-shaped. This
--      is the carry-forward guard: previous-year rows carry a flat amount of 0
--      (CARRY_FORWARD_LATE_FEE_FLAT_AMOUNT) and must never accrue a late fee.
--      Testing the flat amount is stronger than testing `installment_no >= 90`
--      and also covers a per-student custom flat of 0.
--   3. `settled_by_due` counts on-time cash, on-time discount close-outs AND
--      on-time adjustments. Close-outs so a balance written off before the due
--      date does not start accruing the next day. Adjustments so REVERSING an
--      on-time payment correctly re-charges -- the old rule looked only at
--      gross payments and exempted such an installment forever.
--   4. `current_date`, not p_as_of_date. Pinning the function to the real date
--      is what makes the two engines equal by construction; a late fee is a
--      fact about today, not about a date a cashier is previewing.
--
-- `p_include_candidate_late` is now dead, but the parameter is retained so the
-- signature stays stable for preview_workbook_payment_allocation,
-- post_student_payment_with_adjustments, waive_late_fee and the regprocedure
-- assertion in 20260517075735.
--
-- ===========================================================================
-- Why this is one migration and not three
-- ===========================================================================
--
-- Measured on 2026-08-08, unifying the rule newly charges 550 installments
-- across 393 of 512 active students in the live 2026-27 session: +Rs 5,50,000,
-- taking school-wide late fee owed from Rs 11,000 to Rs 5,61,000. 29 of those
-- installments belong to families who had ALREADY paid their base in full.
--
-- The school signed off on the rule but not on billing those families, so the
-- change is grandfathered. If the rule change and the grandfathering were
-- separate migrations, production would sit with Rs 5.5 lakh of phantom debt
-- between them -- and if the second one failed, it would stay there. Doing both
-- in one transaction means the inflated state is never observable.
--
-- The guarantee, asserted at the end of this migration against
-- public.late_fee_rule_change_snapshot:
--
--     no installment's final_late_fee is higher than it was before.
--
-- Achieved with two waiver rows per affected installment, kept separate so the
-- audit trail does not pretend a grandfather waiver was a cashier's decision:
--
--   source='migration'   amount = old waiver_applied
--                        pins the old sliding pool to the installment it was
--                        actually offsetting at cut-over.
--   source='grandfather' amount = new raw_late_fee - old raw_late_fee
--                        cancels exactly the increase this rule change causes.
--
--   sum = old_waiver + (new_raw - old_raw)
--   final_new = new_raw - sum = old_raw - old_waiver = final_old.  QED
--
-- Installments not yet due (INST 3 on 20-Oct, INST 4 on 20-Jan) have
-- new_raw = 0 today, get no rows, and will charge normally when their due date
-- passes. That is the entire point of the exercise.
--
-- The six dependent views are captured and replayed verbatim rather than
-- retyped -- 53 KB of hand-transcribed view SQL is a bug waiting to happen, and
-- only one of them changes (see the two asserted patches below).

-- ---------------------------------------------------------------------------
-- 0. Refuse to run out of order.
-- ---------------------------------------------------------------------------

do $$
declare
  v_snapshot_rows int;
  v_existing_waivers int;
begin
  select count(*) into v_snapshot_rows from public.late_fee_rule_change_snapshot;
  if v_snapshot_rows = 0 then
    raise exception
      'public.late_fee_rule_change_snapshot is empty -- run the snapshot migration first, or the grandfather amounts cannot be computed';
  end if;

  select count(*) into v_existing_waivers from public.student_late_fee_waivers;
  if v_existing_waivers <> 0 then
    raise exception
      'public.student_late_fee_waivers already has % row(s); this migration backfills and must run exactly once', v_existing_waivers;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. Capture everything CASCADE is about to destroy.
-- ---------------------------------------------------------------------------

create table public._lf_mig_views as
select
  c.relname::text                                as name,
  c.relkind::text                                as kind,
  rtrim(btrim(pg_get_viewdef(c.oid, true)), ';') as def,
  c.reloptions                                   as reloptions
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'v_workbook_student_financials',
    'v_notion_student_fee_summary',
    'v_notion_daily_collection_summary',
    'v_student_carry_forward_balances',
    'v_student_financial_state',
    'v_notion_family_fee_summary'
  );

alter table public._lf_mig_views add column created_ok boolean not null default false;

do $$
declare v_n int;
begin
  select count(*) into v_n from public._lf_mig_views;
  if v_n <> 6 then
    raise exception 'Expected to capture 6 dependent views, captured %', v_n;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1b. Patch v_workbook_student_financials.late_fee_waiver_amount at capture.
--
-- That column reads student_fee_overrides.late_fee_waiver_amount -- the pool
-- this migration retires. Left alone it would under-report "Late fee waived"
-- everywhere (receipts, defaulters breakdown, exports, Notion) the moment the
-- pool stops being the source of truth. Two anchored replacements, each
-- asserted to match EXACTLY ONCE so a silent no-match cannot slip through.
-- ---------------------------------------------------------------------------

do $$
declare
  v_def  text;
  v_from text;
  v_to   text;
  v_hits int;
begin
  select def into v_def from public._lf_mig_views where name = 'v_workbook_student_financials';

  -- (a) expose the per-installment waiver total on the aggregate CTE
  v_from := 'COALESCE(sum(v_workbook_installment_balances.final_late_fee), 0::bigint)::integer AS late_fee_total,';
  v_to   := v_from || E'\n            COALESCE(sum(v_workbook_installment_balances.waiver_applied), 0::bigint)::integer AS late_fee_waiver_total,';
  v_hits := array_length(string_to_array(v_def, v_from), 1) - 1;
  if v_hits <> 1 then
    raise exception 'Patch (a) expected exactly 1 anchor match, found %', v_hits;
  end if;
  v_def := replace(v_def, v_from, v_to);

  -- (b) source the output column from that total instead of the override pool.
  --     Anchored on the following line because "profile.late_fee_waiver_amount,"
  --     alone also matches "student_profile.late_fee_waiver_amount," in a CTE.
  v_from := E'    profile.late_fee_waiver_amount,\n    COALESCE(summary.base_charge_total';
  v_to   := E'    COALESCE(summary.late_fee_waiver_total, 0)::integer AS late_fee_waiver_amount,\n    COALESCE(summary.base_charge_total';
  v_hits := array_length(string_to_array(v_def, v_from), 1) - 1;
  if v_hits <> 1 then
    raise exception 'Patch (b) expected exactly 1 anchor match, found %', v_hits;
  end if;
  v_def := replace(v_def, v_from, v_to);

  update public._lf_mig_views set def = v_def where name = 'v_workbook_student_financials';
end;
$$;

create table public._lf_mig_indexes as
select indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in (
    'v_workbook_installment_balances',
    'v_workbook_student_financials',
    'v_student_financial_state'
  );

-- relacl, not information_schema: the latter does not cover materialized views,
-- and these carry a bespoke notion_fee_sync_role grant.
create table public._lf_mig_acl as
select c.relname::text as name, c.relacl
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'v_workbook_installment_balances',
    'v_workbook_student_financials',
    'v_student_financial_state',
    'v_notion_student_fee_summary',
    'v_notion_daily_collection_summary',
    'v_notion_family_fee_summary',
    'v_student_carry_forward_balances'
  );

-- ---------------------------------------------------------------------------
-- 2. Engine A -- private.workbook_installment_snapshot.
-- ---------------------------------------------------------------------------

create or replace function private.workbook_installment_snapshot(
  p_student_id uuid default null,
  p_as_of_date date default current_date,
  p_include_candidate_late boolean default false
)
returns table (
  installment_id uuid,
  student_id uuid,
  admission_no text,
  student_name text,
  father_name text,
  father_phone text,
  session_label text,
  class_id uuid,
  class_name text,
  class_label text,
  section text,
  stream_name text,
  installment_no smallint,
  installment_label text,
  due_date date,
  base_charge integer,
  paid_amount integer,
  adjustment_amount integer,
  applied_amount integer,
  raw_late_fee integer,
  waiver_applied integer,
  final_late_fee integer,
  total_charge integer,
  pending_amount integer,
  balance_status text,
  last_payment_date date,
  transport_route_id uuid,
  transport_route_name text,
  transport_route_code text
)
language sql
stable
set search_path = public, private
as $fn$
  with session_policy as (
    select distinct on (academic_session_label)
      academic_session_label
    from public.fee_policy_configs
    where calculation_model = 'workbook_v1'
    order by academic_session_label, updated_at desc
  ),
  session_installments as (
    select
      i.id as installment_id,
      i.student_id,
      s.admission_no,
      s.full_name as student_name,
      s.father_name,
      s.primary_phone as father_phone,
      c.session_label,
      i.class_id,
      c.class_name,
      private.normalize_workbook_class_label(c.class_name, c.stream_name) as class_label,
      coalesce(c.section, '') as section,
      coalesce(c.stream_name, '') as stream_name,
      i.installment_no,
      i.installment_label,
      i.due_date,
      i.amount_due as base_charge,
      i.status as installment_status,
      i.late_fee_flat_amount,
      s.transport_route_id,
      route_row.route_name as transport_route_name,
      route_row.route_code as transport_route_code
    from public.installments as i
    join public.students as s
      on s.id = i.student_id
    join public.classes as c
      on c.id = i.class_id
    join session_policy as policy_row
      on policy_row.academic_session_label = c.session_label
    left join public.transport_routes as route_row
      on route_row.id = s.transport_route_id
    where i.status <> 'cancelled'
      and (p_student_id is null or i.student_id = p_student_id)
  ),
  rolled as (
    select
      session_installments.*,
      coalesce(payment_row.paid_amount, 0)::integer as paid_amount,
      coalesce(payment_row.discount_closeout_amount, 0)::integer as discount_closeout_amount,
      coalesce(adjustment_row.adjustment_amount, 0)::integer as adjustment_amount,
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
            and receipt_row.payment_mode <> 'discount'
        ), 0) as paid_by_due_amount,
        coalesce(sum(payment_row.amount) filter (
          where receipt_row.payment_date <= session_installments.due_date
            and receipt_row.payment_mode = 'discount'
        ), 0) as closeout_by_due_amount,
        max(receipt_row.payment_date) as last_payment_date
      from public.payments as payment_row
      join public.receipts as receipt_row
        on receipt_row.id = payment_row.receipt_id
      where payment_row.installment_id = session_installments.installment_id
    ) as payment_row
      on true
    left join lateral (
      select coalesce(sum(adjustment_row.amount_delta), 0) as adjustment_amount
      from public.payment_adjustments as adjustment_row
      where adjustment_row.installment_id = session_installments.installment_id
    ) as adjustment_row
      on true
    left join lateral (
      select coalesce(sum(adj.amount_delta), 0) as adjustment_by_due_amount
      from public.payment_adjustments as adj
      join public.payments as adj_payment
        on adj_payment.id = adj.payment_id
      join public.receipts as adj_receipt
        on adj_receipt.id = adj_payment.receipt_id
      where adj.installment_id = session_installments.installment_id
        and adj_receipt.payment_date <= session_installments.due_date
    ) as adj_by_due_row
      on true
  ),
  late_eval as (
    select
      rolled.*,
      greatest(rolled.paid_amount + rolled.adjustment_amount, 0)::integer as applied_amount,
      greatest(
        rolled.base_charge - greatest(rolled.paid_amount + rolled.adjustment_amount + rolled.discount_closeout_amount, 0),
        0
      )::integer as base_pending_amount,
-- >>> SHARED LATE FEE RULE -- keep byte-identical with v_workbook_installment_balances >>>
      case
        when rolled.installment_status = 'waived' then 0
        when coalesce(rolled.late_fee_flat_amount, 0) <= 0 then 0
        when rolled.base_charge <= 0 then 0
        when rolled.settled_by_due_amount >= rolled.base_charge then 0
        when current_date > rolled.due_date then rolled.late_fee_flat_amount
        else 0
      end::integer as raw_late_fee
-- <<< SHARED LATE FEE RULE <<<
    from rolled
  ),
  waiver_eval as (
    select
      late_eval.*,
      least(
        late_eval.raw_late_fee,
        coalesce(waiver_row.waiver_amount, 0)
      )::integer as waiver_applied
    from late_eval
    left join public.v_effective_late_fee_waivers as waiver_row
      on waiver_row.installment_id = late_eval.installment_id
  )
  select
    waiver_eval.installment_id,
    waiver_eval.student_id,
    waiver_eval.admission_no,
    waiver_eval.student_name,
    waiver_eval.father_name,
    waiver_eval.father_phone,
    waiver_eval.session_label,
    waiver_eval.class_id,
    waiver_eval.class_name,
    waiver_eval.class_label,
    waiver_eval.section,
    waiver_eval.stream_name,
    waiver_eval.installment_no,
    waiver_eval.installment_label,
    waiver_eval.due_date,
    waiver_eval.base_charge,
    waiver_eval.paid_amount,
    waiver_eval.adjustment_amount,
    waiver_eval.applied_amount,
    waiver_eval.raw_late_fee,
    waiver_eval.waiver_applied,
    greatest(waiver_eval.raw_late_fee - waiver_eval.waiver_applied, 0)::integer as final_late_fee,
    greatest(waiver_eval.base_charge + waiver_eval.raw_late_fee - waiver_eval.waiver_applied, 0)::integer as total_charge,
    greatest(
      waiver_eval.base_charge + waiver_eval.raw_late_fee - waiver_eval.waiver_applied
        - waiver_eval.applied_amount - waiver_eval.discount_closeout_amount,
      0
    )::integer as pending_amount,
    case
      when waiver_eval.installment_status = 'waived' then 'waived'
      when greatest(
        waiver_eval.base_charge + waiver_eval.raw_late_fee - waiver_eval.waiver_applied
          - waiver_eval.applied_amount - waiver_eval.discount_closeout_amount,
        0
      ) <= 0 then 'paid'
      when waiver_eval.applied_amount > 0 or waiver_eval.discount_closeout_amount > 0 then 'partial'
      when p_as_of_date > waiver_eval.due_date then 'overdue'
      else 'pending'
    end as balance_status,
    waiver_eval.last_payment_date,
    waiver_eval.transport_route_id,
    waiver_eval.transport_route_name,
    waiver_eval.transport_route_code
  from waiver_eval
  order by waiver_eval.student_id, waiver_eval.installment_no;
$fn$;

grant execute on function private.workbook_installment_snapshot(uuid, date, boolean) to authenticated;
grant execute on function private.workbook_installment_snapshot(uuid, date, boolean) to service_role;

comment on function private.workbook_installment_snapshot(uuid, date, boolean) is
  'Per-installment financial snapshot. p_include_candidate_late is DEPRECATED and ignored: since the late-fee rule was unified an overdue installment always carries its flat late fee, so there is no longer a "candidate" state. The parameter is retained only to keep the signature stable for existing callers. p_as_of_date still drives balance_status; the late fee itself is always evaluated against current_date so this function and v_workbook_installment_balances cannot disagree.';

-- ---------------------------------------------------------------------------
-- 3. Engine B -- v_workbook_installment_balances (triggers the CASCADE).
-- ---------------------------------------------------------------------------

drop materialized view public.v_workbook_installment_balances cascade;

create materialized view public.v_workbook_installment_balances as
with session_policy as (
  select distinct on (academic_session_label)
    academic_session_label
  from public.fee_policy_configs
  where calculation_model = 'workbook_v1'
  order by academic_session_label, updated_at desc
),
session_installments as (
  select
    i.id as installment_id,
    i.student_id,
    s.admission_no,
    s.full_name as student_name,
    s.father_name,
    s.primary_phone as father_phone,
    c.session_label,
    i.class_id,
    c.class_name,
    private.normalize_workbook_class_label(c.class_name, c.stream_name) as class_label,
    coalesce(c.section, '') as section,
    coalesce(c.stream_name, '') as stream_name,
    i.installment_no,
    i.installment_label,
    i.due_date,
    i.amount_due as base_charge,
    i.status as installment_status,
    i.late_fee_flat_amount,
    i.is_carry_forward,
    i.source_session_label,
    s.transport_route_id,
    route_row.route_name as transport_route_name,
    route_row.route_code as transport_route_code
  from public.installments as i
  join public.students as s
    on s.id = i.student_id
  join public.classes as c
    on c.id = i.class_id
  join session_policy as policy_row
    on policy_row.academic_session_label = c.session_label
  left join public.transport_routes as route_row
    on route_row.id = s.transport_route_id
  where i.status <> 'cancelled'
),
rolled as (
  select
    session_installments.*,
    coalesce(payment_row.paid_amount, 0)::integer as paid_amount,
    coalesce(payment_row.discount_closeout_amount, 0)::integer as discount_closeout_amount,
    coalesce(adjustment_row.adjustment_amount, 0)::integer as adjustment_amount,
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
          and receipt_row.payment_mode <> 'discount'
      ), 0) as paid_by_due_amount,
      coalesce(sum(payment_row.amount) filter (
        where receipt_row.payment_date <= session_installments.due_date
          and receipt_row.payment_mode = 'discount'
      ), 0) as closeout_by_due_amount,
      max(receipt_row.payment_date) as last_payment_date
    from public.payments as payment_row
    join public.receipts as receipt_row
      on receipt_row.id = payment_row.receipt_id
    where payment_row.installment_id = session_installments.installment_id
  ) as payment_row
    on true
  left join lateral (
    select coalesce(sum(adjustment_row.amount_delta), 0) as adjustment_amount
    from public.payment_adjustments as adjustment_row
    where adjustment_row.installment_id = session_installments.installment_id
  ) as adjustment_row
    on true
  left join lateral (
    select coalesce(sum(adj.amount_delta), 0) as adjustment_by_due_amount
    from public.payment_adjustments as adj
    join public.payments as adj_payment
      on adj_payment.id = adj.payment_id
    join public.receipts as adj_receipt
      on adj_receipt.id = adj_payment.receipt_id
    where adj.installment_id = session_installments.installment_id
      and adj_receipt.payment_date <= session_installments.due_date
  ) as adj_by_due_row
    on true
),
late_eval as (
  select
    rolled.*,
    greatest(rolled.paid_amount + rolled.adjustment_amount, 0)::integer as applied_amount,
    greatest(
      rolled.base_charge - greatest(rolled.paid_amount + rolled.adjustment_amount + rolled.discount_closeout_amount, 0),
      0
    )::integer as base_pending_amount,
-- >>> SHARED LATE FEE RULE -- keep byte-identical with private.workbook_installment_snapshot >>>
      case
        when rolled.installment_status = 'waived' then 0
        when coalesce(rolled.late_fee_flat_amount, 0) <= 0 then 0
        when rolled.base_charge <= 0 then 0
        when rolled.settled_by_due_amount >= rolled.base_charge then 0
        when current_date > rolled.due_date then rolled.late_fee_flat_amount
        else 0
      end::integer as raw_late_fee
-- <<< SHARED LATE FEE RULE <<<
  from rolled
),
waiver_eval as (
  select
    late_eval.*,
    least(
      late_eval.raw_late_fee,
      coalesce(waiver_row.waiver_amount, 0)
    )::integer as waiver_applied
  from late_eval
  left join public.v_effective_late_fee_waivers as waiver_row
    on waiver_row.installment_id = late_eval.installment_id
)
select
  waiver_eval.installment_id,
  waiver_eval.student_id,
  waiver_eval.admission_no,
  waiver_eval.student_name,
  waiver_eval.father_name,
  waiver_eval.father_phone,
  waiver_eval.session_label,
  waiver_eval.class_id,
  waiver_eval.class_name,
  waiver_eval.class_label,
  waiver_eval.section,
  waiver_eval.stream_name,
  waiver_eval.installment_no,
  waiver_eval.installment_label,
  waiver_eval.due_date,
  waiver_eval.base_charge,
  waiver_eval.paid_amount,
  waiver_eval.discount_closeout_amount,
  waiver_eval.adjustment_amount,
  waiver_eval.applied_amount,
  waiver_eval.raw_late_fee,
  waiver_eval.waiver_applied,
  greatest(waiver_eval.raw_late_fee - waiver_eval.waiver_applied, 0)::integer as final_late_fee,
  greatest(waiver_eval.base_charge + waiver_eval.raw_late_fee - waiver_eval.waiver_applied, 0)::integer as total_charge,
  greatest(
    waiver_eval.base_charge + waiver_eval.raw_late_fee - waiver_eval.waiver_applied
      - waiver_eval.applied_amount - waiver_eval.discount_closeout_amount,
    0
  )::integer as pending_amount,
  case
    when waiver_eval.installment_status = 'waived' then 'waived'
    when greatest(
      waiver_eval.base_charge + waiver_eval.raw_late_fee - waiver_eval.waiver_applied
        - waiver_eval.applied_amount - waiver_eval.discount_closeout_amount,
      0
    ) <= 0 then 'paid'
    when current_date > waiver_eval.due_date then 'overdue'
    when waiver_eval.applied_amount > 0 or waiver_eval.discount_closeout_amount > 0 then 'partial'
    else 'pending'
  end as balance_status,
  waiver_eval.last_payment_date,
  waiver_eval.transport_route_id,
  waiver_eval.transport_route_name,
  waiver_eval.transport_route_code,
  -- New. Every consumer previously re-derived "is this a previous-year row?"
  -- from the installment label (lib/prev-year-dues/display.ts). The dashboard
  -- KPI needs it in SQL, so it is exposed once, here.
  waiver_eval.is_carry_forward,
  waiver_eval.source_session_label
from waiver_eval;

-- ---------------------------------------------------------------------------
-- 4. Backfill: carry the old pool over, then grandfather the rule change.
-- ---------------------------------------------------------------------------
-- At this point the matview is populated with the NEW raw_late_fee and
-- waiver_applied = 0 (the waiver table is still empty), which is exactly the
-- pair of numbers the arithmetic below needs.

insert into public.student_late_fee_waivers (
  student_id, installment_id, session_label, amount, reason, source, waived_at
)
select
  snap.student_id,
  snap.installment_id,
  snap.session_label,
  snap.waiver_applied,
  'Carried over from the student-level late-fee waiver pool when waivers moved to per-installment records. Original reason: '
    || coalesce(nullif(btrim(pool.override_reason), ''), '(none recorded)'),
  'migration',
  coalesce(pool.override_updated_at, now())
from public.late_fee_rule_change_snapshot as snap
left join public.late_fee_waiver_pool_snapshot as pool
  on pool.student_id = snap.student_id
where snap.waiver_applied > 0;

insert into public.student_late_fee_waivers (
  student_id, installment_id, session_label, amount, reason, source
)
select
  bal.student_id,
  bal.installment_id,
  bal.session_label,
  bal.raw_late_fee - snap.raw_late_fee,
  'Grandfathered: this installment was already past its due date when the late-fee rule was unified on '
    || to_char((now() at time zone 'Asia/Kolkata')::date, 'DD-MM-YYYY')
    || '. The school approved the corrected rule but not back-charging families, so the increase is waived. Void this waiver to bill it.',
  'grandfather'
from public.v_workbook_installment_balances as bal
join public.late_fee_rule_change_snapshot as snap
  on snap.installment_id = bal.installment_id
where bal.raw_late_fee > snap.raw_late_fee;

-- Pick up the waivers just written.
refresh materialized view public.v_workbook_installment_balances;

-- ---------------------------------------------------------------------------
-- 5. Replay the dependents, their indexes and their grants.
-- ---------------------------------------------------------------------------

-- Recreate by fixpoint rather than by a hand-written order. These six views
-- form a DAG among THEMSELVES, not just against the base matview -- e.g.
-- v_notion_daily_collection_summary reads v_notion_student_fee_summary, which
-- reads v_workbook_student_financials. Hand-assigning depths got that wrong
-- once already. Attempting each in turn and retrying whatever failed with
-- "relation does not exist" resolves any ordering without encoding it.
-- Only undefined_table is swallowed: a genuine error in a definition (say the
-- patch above referencing a column that is not there) raises undefined_column
-- and propagates, rolling the migration back.
do $$
declare
  r         record;
  v_names   text[];
  v_name    text;
  v_created int;
  v_left    int;
  v_pass    int := 0;
begin
  loop
    v_pass := v_pass + 1;
    if v_pass > 12 then
      raise exception 'Dependent view replay did not converge after % passes', v_pass - 1;
    end if;

    select array_agg(name order by name) into v_names
    from public._lf_mig_views where not created_ok;
    exit when v_names is null;

    v_created := 0;
    foreach v_name in array v_names loop
      select * into r from public._lf_mig_views where name = v_name;
      begin
        execute format(
          'create %s public.%I %s as %s',
          case when r.kind = 'm' then 'materialized view' else 'view' end,
          r.name,
          case
            when r.reloptions is not null
              then 'with (' || array_to_string(r.reloptions, ', ') || ')'
            else ''
          end,
          r.def
        );
        update public._lf_mig_views set created_ok = true where name = v_name;
        v_created := v_created + 1;
      exception when undefined_table then
        null;  -- something it reads is not back yet; retry on the next pass
      end;
    end loop;

    select count(*) into v_left from public._lf_mig_views where not created_ok;
    exit when v_left = 0;

    if v_created = 0 then
      raise exception 'Unresolvable view dependencies; still missing: %',
        (select string_agg(name, ', ') from public._lf_mig_views where not created_ok);
    end if;
  end loop;
end;
$$;

do $$
declare r record;
begin
  for r in select * from public._lf_mig_indexes loop
    execute r.indexdef;
  end loop;
end;
$$;

do $$
declare
  r record;
  a record;
  v_grantee text;
begin
  for r in select * from public._lf_mig_acl where relacl is not null loop
    for a in select * from aclexplode(r.relacl) loop
      v_grantee := case when a.grantee = 0 then 'public' else pg_get_userbyid(a.grantee) end;
      execute format('grant %s on public.%I to %I', a.privilege_type, r.name, v_grantee);
    end loop;
  end loop;
end;
$$;

drop table public._lf_mig_views;
drop table public._lf_mig_indexes;
drop table public._lf_mig_acl;

-- ---------------------------------------------------------------------------
-- 6. Make the due-date rollover self-healing.
-- ---------------------------------------------------------------------------
-- The matview only refreshes when something enqueues a refresh
-- (refresh_workbook_materialized_views_if_requested, drained every 2 minutes).
-- Under the old rule that was enough: a late fee only appeared when a payment
-- posted, and posting enqueues. Under the new rule a late fee appears because
-- A DATE PASSED, and a date passing enqueues nothing -- so on a quiet day the
-- Rs 1,000 would not surface until the next payment anywhere in the school.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'enqueue-workbook-refresh-daily') then
    perform cron.unschedule('enqueue-workbook-refresh-daily');
  end if;
end;
$$;

-- 18:35 UTC = 00:05 IST, just after the date rolls over in Asia/Kolkata.
select cron.schedule(
  'enqueue-workbook-refresh-daily',
  '35 18 * * *',
  $cron$select public.queue_workbook_materialized_view_refresh();$cron$
);

-- ---------------------------------------------------------------------------
-- 7. Prove it. Any failure here rolls the whole migration back.
-- ---------------------------------------------------------------------------

-- (a) The two engines must now agree, exactly, on every installment.
do $$
declare v_mismatch int;
begin
  select count(*) into v_mismatch
  from public.v_workbook_installment_balances as b
  full join private.workbook_installment_snapshot(null, current_date, true) as s
    on s.installment_id = b.installment_id
  where s.installment_id is null
     or b.installment_id is null
     or s.raw_late_fee   is distinct from b.raw_late_fee
     or s.waiver_applied is distinct from b.waiver_applied
     or s.final_late_fee is distinct from b.final_late_fee
     or s.pending_amount is distinct from b.pending_amount;

  if v_mismatch <> 0 then
    raise exception 'Late-fee engines still disagree on % installment(s)', v_mismatch;
  end if;
end;
$$;

-- (b) THE GUARANTEE: no family's late fee went up.
do $$
declare
  v_rows int;
  v_rupees bigint;
begin
  select count(*), coalesce(sum(b.final_late_fee - snap.final_late_fee), 0)
    into v_rows, v_rupees
  from public.v_workbook_installment_balances as b
  join public.late_fee_rule_change_snapshot as snap
    on snap.installment_id = b.installment_id
  where b.final_late_fee > snap.final_late_fee;

  if v_rows <> 0 then
    raise exception
      'Grandfathering incomplete: % installment(s) had their late fee RAISED by Rs % in total', v_rows, v_rupees;
  end if;
end;
$$;

-- (c) A waiver may never exceed the fee it offsets.
do $$
declare v_rows int;
begin
  select count(*) into v_rows
  from public.v_workbook_installment_balances
  where waiver_applied > raw_late_fee or final_late_fee < 0;
  if v_rows <> 0 then
    raise exception 'Waiver exceeds the charge on % installment(s)', v_rows;
  end if;
end;
$$;

-- (d) Carry-forward (previous-year) rows must never carry a late fee.
do $$
declare v_rows int;
begin
  select count(*) into v_rows
  from public.v_workbook_installment_balances
  where is_carry_forward and raw_late_fee <> 0;
  if v_rows <> 0 then
    raise exception 'Carry-forward rows accrued a late fee on % installment(s)', v_rows;
  end if;
end;
$$;

notify pgrst, 'reload schema';
