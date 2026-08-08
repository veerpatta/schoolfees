-- Reversing a discount write-off must bring the debt back.
--
-- Found by smoke-testing "Close old balance as discount": write off Rs 5,000,
-- reverse the receipt, and the balance stayed closed. The reversal was recorded
-- correctly -- payment_adjustments held amount_delta = -5000 -- but the view
-- threw it away:
--
--     applied_amount = greatest(paid_amount + adjustment_amount, 0)
--     pending_amount = base + raw - waiver - applied - discount_closeout_amount
--
-- A discount close-out lands in discount_closeout_amount, not in paid_amount, so
-- the row had paid_amount = 0 and adjustment_amount = -5000. greatest(-5000, 0)
-- floored the reversal to zero, while discount_closeout_amount still counted the
-- full 5,000. Net effect: pending stayed at 0 and the money written off could
-- never be un-written.
--
-- The floor itself is right -- a row should not report negative cash applied.
-- The mistake is netting a reversal of a NON-CASH write-off against the CASH
-- bucket. Adjustments are now split by the payment mode of the payment they
-- adjust, and each nets against its own bucket:
--
--     applied_amount           = greatest(paid_amount + cash adjustments, 0)
--     discount_closeout_amount = greatest(closeouts  + closeout adjustments, 0)
--
-- The public `adjustment_amount` column keeps its existing meaning (every
-- adjustment on the row, cash or not) because the ledger surfaces display it;
-- only the arithmetic behind applied/closeout changes. For a cash payment the
-- two are identical, so nothing about ordinary receipts moves.
--
-- Blast radius today is nil: exactly two adjustments in the whole database sit
-- on discount-mode payments, both created by this session's own smoke tests, and
-- the live 2026-27 session has never had a discount close-out reversed. The
-- reason to fix it now is that close-balance-as-discount just moved into the
-- student Danger Zone and gained a previous-year variant, so a mistaken
-- write-off is about to become both easier to make and, without this, permanent.
--
-- settled_by_due deliberately keeps summing ALL adjustments regardless of mode:
-- reversing an on-time payment of either kind should re-expose the installment
-- to its late fee.

create table public._wo_mig_views as
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

alter table public._wo_mig_views add column created_ok boolean not null default false;

do $$
declare v_n int;
begin
  select count(*) into v_n from public._wo_mig_views;
  if v_n <> 6 then raise exception 'Expected to capture 6 dependent views, captured %', v_n; end if;
end;
$$;

create table public._wo_mig_indexes as
select indexdef from pg_indexes
where schemaname = 'public'
  and tablename in ('v_workbook_installment_balances',
                    'v_workbook_student_financials',
                    'v_student_financial_state');

create table public._wo_mig_acl as
select c.relname::text as name, c.relacl
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('v_workbook_installment_balances','v_workbook_student_financials',
                    'v_student_financial_state','v_notion_student_fee_summary',
                    'v_notion_daily_collection_summary','v_notion_family_fee_summary',
                    'v_student_carry_forward_balances');

-- ---------------------------------------------------------------------------
-- Engine A
-- ---------------------------------------------------------------------------

create or replace function private.workbook_installment_snapshot(
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
  balance_status text, last_payment_date date, transport_route_id uuid,
  transport_route_name text, transport_route_code text
)
language sql
stable
set search_path = public, private
as $fn$
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
      i.late_fee_flat_amount, s.transport_route_id,
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
      -- Each bucket nets only the adjustments belonging to it, so reversing a
      -- non-cash write-off cannot be swallowed by the cash floor.
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
      greatest(rolled.base_charge - greatest(rolled.applied_amount + rolled.discount_closeout_amount, 0), 0)::integer as base_pending_amount,
      case
        when rolled.installment_status = 'waived' then 0
        when coalesce(rolled.late_fee_flat_amount, 0) <= 0 then 0
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
  )
  select
    waiver_eval.installment_id, waiver_eval.student_id, waiver_eval.admission_no,
    waiver_eval.student_name, waiver_eval.father_name, waiver_eval.father_phone,
    waiver_eval.session_label, waiver_eval.class_id, waiver_eval.class_name,
    waiver_eval.class_label, waiver_eval.section, waiver_eval.stream_name,
    waiver_eval.installment_no, waiver_eval.installment_label, waiver_eval.due_date,
    waiver_eval.base_charge, waiver_eval.paid_amount, waiver_eval.adjustment_amount,
    waiver_eval.applied_amount, waiver_eval.raw_late_fee, waiver_eval.waiver_applied,
    greatest(waiver_eval.raw_late_fee - waiver_eval.waiver_applied, 0)::integer as final_late_fee,
    greatest(waiver_eval.base_charge + waiver_eval.raw_late_fee - waiver_eval.waiver_applied, 0)::integer as total_charge,
    greatest(
      waiver_eval.base_charge + waiver_eval.raw_late_fee - waiver_eval.waiver_applied
        - waiver_eval.applied_amount - waiver_eval.discount_closeout_amount, 0
    )::integer as pending_amount,
    case
      when waiver_eval.installment_status = 'waived' then 'waived'
      when greatest(
        waiver_eval.base_charge + waiver_eval.raw_late_fee - waiver_eval.waiver_applied
          - waiver_eval.applied_amount - waiver_eval.discount_closeout_amount, 0) <= 0 then 'paid'
      when waiver_eval.applied_amount > 0 or waiver_eval.discount_closeout_amount > 0 then 'partial'
      when p_as_of_date > waiver_eval.due_date then 'overdue'
      else 'pending'
    end as balance_status,
    waiver_eval.last_payment_date, waiver_eval.transport_route_id,
    waiver_eval.transport_route_name, waiver_eval.transport_route_code
  from waiver_eval
  order by waiver_eval.student_id, waiver_eval.installment_no;
$fn$;

grant execute on function private.workbook_installment_snapshot(uuid, date, boolean) to authenticated;
grant execute on function private.workbook_installment_snapshot(uuid, date, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- Engine B
-- ---------------------------------------------------------------------------

drop materialized view public.v_workbook_installment_balances cascade;

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
    i.late_fee_flat_amount, i.is_carry_forward, i.source_session_label,
    s.transport_route_id, route_row.route_name as transport_route_name,
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
    greatest(rolled.base_charge - greatest(rolled.applied_amount + rolled.discount_closeout_amount, 0), 0)::integer as base_pending_amount,
      case
        when rolled.installment_status = 'waived' then 0
        when coalesce(rolled.late_fee_flat_amount, 0) <= 0 then 0
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
)
select
  waiver_eval.installment_id, waiver_eval.student_id, waiver_eval.admission_no,
  waiver_eval.student_name, waiver_eval.father_name, waiver_eval.father_phone,
  waiver_eval.session_label, waiver_eval.class_id, waiver_eval.class_name,
  waiver_eval.class_label, waiver_eval.section, waiver_eval.stream_name,
  waiver_eval.installment_no, waiver_eval.installment_label, waiver_eval.due_date,
  waiver_eval.base_charge, waiver_eval.paid_amount,
  waiver_eval.discount_closeout_amount, waiver_eval.adjustment_amount,
  waiver_eval.applied_amount, waiver_eval.raw_late_fee, waiver_eval.waiver_applied,
  greatest(waiver_eval.raw_late_fee - waiver_eval.waiver_applied, 0)::integer as final_late_fee,
  greatest(waiver_eval.base_charge + waiver_eval.raw_late_fee - waiver_eval.waiver_applied, 0)::integer as total_charge,
  greatest(
    waiver_eval.base_charge + waiver_eval.raw_late_fee - waiver_eval.waiver_applied
      - waiver_eval.applied_amount - waiver_eval.discount_closeout_amount, 0
  )::integer as pending_amount,
  case
    when waiver_eval.installment_status = 'waived' then 'waived'
    when greatest(
      waiver_eval.base_charge + waiver_eval.raw_late_fee - waiver_eval.waiver_applied
        - waiver_eval.applied_amount - waiver_eval.discount_closeout_amount, 0) <= 0 then 'paid'
    when current_date > waiver_eval.due_date then 'overdue'
    when waiver_eval.applied_amount > 0 or waiver_eval.discount_closeout_amount > 0 then 'partial'
    else 'pending'
  end as balance_status,
  waiver_eval.last_payment_date, waiver_eval.transport_route_id,
  waiver_eval.transport_route_name, waiver_eval.transport_route_code,
  waiver_eval.is_carry_forward, waiver_eval.source_session_label
from waiver_eval;

-- ---------------------------------------------------------------------------
-- Replay dependents, indexes, grants.
-- ---------------------------------------------------------------------------

do $$
declare
  r record; v_names text[]; v_name text; v_created int; v_left int; v_pass int := 0;
begin
  loop
    v_pass := v_pass + 1;
    if v_pass > 12 then raise exception 'Dependent view replay did not converge'; end if;
    select array_agg(name order by name) into v_names from public._wo_mig_views where not created_ok;
    exit when v_names is null;
    v_created := 0;
    foreach v_name in array v_names loop
      select * into r from public._wo_mig_views where name = v_name;
      begin
        execute format('create %s public.%I %s as %s',
          case when r.kind = 'm' then 'materialized view' else 'view' end,
          r.name,
          case when r.reloptions is not null
               then 'with (' || array_to_string(r.reloptions, ', ') || ')' else '' end,
          r.def);
        update public._wo_mig_views set created_ok = true where name = v_name;
        v_created := v_created + 1;
      exception when undefined_table then null;
      end;
    end loop;
    select count(*) into v_left from public._wo_mig_views where not created_ok;
    exit when v_left = 0;
    if v_created = 0 then
      raise exception 'Unresolvable view dependencies; still missing: %',
        (select string_agg(name, ', ') from public._wo_mig_views where not created_ok);
    end if;
  end loop;
end;
$$;

do $$
declare r record;
begin
  for r in select * from public._wo_mig_indexes loop execute r.indexdef; end loop;
end;
$$;

do $$
declare r record; a record; v_grantee text;
begin
  for r in select * from public._wo_mig_acl where relacl is not null loop
    for a in select * from aclexplode(r.relacl) loop
      v_grantee := case when a.grantee = 0 then 'public' else pg_get_userbyid(a.grantee) end;
      execute format('grant %s on public.%I to %I', a.privilege_type, r.name, v_grantee);
    end loop;
  end loop;
end;
$$;

drop table public._wo_mig_views;
drop table public._wo_mig_indexes;
drop table public._wo_mig_acl;

-- ---------------------------------------------------------------------------
-- Prove it.
-- ---------------------------------------------------------------------------

-- (a) Engines still agree, exactly.
do $$
declare v_n int;
begin
  select count(*) into v_n
  from public.v_workbook_installment_balances b
  full join private.workbook_installment_snapshot(null, current_date, true) s
    on s.installment_id = b.installment_id
  where s.installment_id is null or b.installment_id is null
     or s.raw_late_fee is distinct from b.raw_late_fee
     or s.waiver_applied is distinct from b.waiver_applied
     or s.final_late_fee is distinct from b.final_late_fee
     or s.applied_amount is distinct from b.applied_amount
     or s.pending_amount is distinct from b.pending_amount;
  if v_n <> 0 then raise exception 'Late-fee engines disagree on % installment(s)', v_n; end if;
end;
$$;

-- (b) A fully reversed write-off must leave nothing closed out.
do $$
declare v_n int;
begin
  select count(*) into v_n
  from public.v_workbook_installment_balances
  where discount_closeout_amount > 0
    and adjustment_amount <= -discount_closeout_amount;
  if v_n <> 0 then
    raise exception 'A reversed write-off is still counted as closed out on % row(s)', v_n;
  end if;
end;
$$;

-- (c) The live session must not have moved.
do $$
declare v_n int;
begin
  select count(*) into v_n
  from public.v_workbook_installment_balances b
  join public.late_fee_rule_change_snapshot s on s.installment_id = b.installment_id
  where b.session_label = '2026-27'
    and (b.final_late_fee <> s.final_late_fee or b.pending_amount <> s.pending_amount);
  if v_n <> 0 then raise exception 'Live 2026-27 moved on % installment(s)', v_n; end if;
end;
$$;

notify pgrst, 'reload schema';
