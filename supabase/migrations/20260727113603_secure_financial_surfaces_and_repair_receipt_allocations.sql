-- Lock down public financial projections and repair the May 24 allocation
-- import drift without rewriting any receipt, payment, or audit row.
--
-- The data repair is deliberately guarded. It aborts unless the live database
-- still has the exact six equal-and-opposite receipt pairs reviewed before this
-- migration was written.

revoke all on table public.mv_student_sibling_groups from public, anon;
revoke all on table public.v_student_financial_state from public, anon;
revoke all on table public.v_workbook_installment_balances from public, anon;
revoke all on table public.v_workbook_student_financials from public, anon;

grant select on table public.mv_student_sibling_groups to authenticated, service_role;
grant select on table public.v_student_financial_state to authenticated, service_role;
grant select on table public.v_workbook_installment_balances to authenticated, service_role;
grant select on table public.v_workbook_student_financials to authenticated, service_role;

revoke execute on function public.post_student_payment_with_adjustments(
  uuid, date, public.payment_mode, integer, text, text, text, text, uuid, integer, integer
) from public, anon;
grant execute on function public.post_student_payment_with_adjustments(
  uuid, date, public.payment_mode, integer, text, text, text, text, uuid, integer, integer
) to authenticated, service_role;

revoke execute on function public.waive_late_fee(
  uuid, integer, text, text, uuid
) from public, anon;
grant execute on function public.waive_late_fee(
  uuid, integer, text, text, uuid
) to authenticated, service_role;

revoke execute on function public.post_family_payment(
  uuid, text, date, public.payment_mode, text, text, text, integer, jsonb, text, text
) from public, anon, authenticated;
drop function if exists public.post_family_payment(
  uuid, text, date, public.payment_mode, text, text, text, integer, jsonb, text, text
);
drop function if exists private.derive_family_child_client_request_id(text, uuid);

create or replace view public.v_receipt_effective_allocation_totals
with (security_invoker = true)
as
with payment_effective as (
  select
    payment_row.id as payment_id,
    payment_row.receipt_id,
    payment_row.amount::bigint as original_amount,
    coalesce(sum(adjustment_row.amount_delta), 0)::bigint as adjustment_amount
  from public.payments as payment_row
  left join public.payment_adjustments as adjustment_row
    on adjustment_row.payment_id = payment_row.id
    and adjustment_row.adjustment_type = 'correction'
  group by payment_row.id, payment_row.receipt_id, payment_row.amount
)
select
  receipt_row.id as receipt_id,
  receipt_row.student_id,
  receipt_row.total_amount::bigint as receipt_total,
  coalesce(sum(payment_effective.original_amount), 0)::bigint as original_allocation_total,
  coalesce(sum(payment_effective.adjustment_amount), 0)::bigint as adjustment_total,
  coalesce(
    sum(payment_effective.original_amount + payment_effective.adjustment_amount),
    0
  )::bigint as effective_allocation_total,
  (
    coalesce(
      sum(payment_effective.original_amount + payment_effective.adjustment_amount),
      0
    ) - receipt_row.total_amount
  )::bigint as variance
from public.receipts as receipt_row
left join payment_effective
  on payment_effective.receipt_id = receipt_row.id
group by receipt_row.id, receipt_row.student_id, receipt_row.total_amount;

comment on view public.v_receipt_effective_allocation_totals is
  'Authenticated audit projection reconciling receipt totals to append-only payment allocations and corrections.';

revoke all on table public.v_receipt_effective_allocation_totals from public, anon;
grant select on table public.v_receipt_effective_allocation_totals to authenticated, service_role;

do $repair$
declare
  v_anomaly_count integer;
  v_pair_count integer;
  v_move_count integer;
begin
  create temporary table tmp_receipt_allocation_repair_pairs
  on commit drop
  as
  with raw_allocations as (
    select
      receipt_row.id as receipt_id,
      receipt_row.student_id,
      receipt_row.total_amount,
      receipt_row.payment_date,
      receipt_row.created_at,
      coalesce(sum(payment_row.amount), 0)::integer as payment_total,
      (
        coalesce(sum(payment_row.amount), 0) - receipt_row.total_amount
      )::integer as variance
    from public.receipts as receipt_row
    left join public.payments as payment_row
      on payment_row.receipt_id = receipt_row.id
    group by receipt_row.id
  ),
  anomalies as (
    select *
    from raw_allocations
    where variance <> 0
  ),
  paired as (
    select
      student_id,
      count(*)::integer as anomaly_count,
      sum(variance)::integer as net_variance,
      min(created_at) as first_created_at,
      max(created_at) as last_created_at,
      (max(receipt_id::text) filter (where variance > 0))::uuid as source_receipt_id,
      (max(receipt_id::text) filter (where variance < 0))::uuid as target_receipt_id,
      max(variance) filter (where variance > 0) as move_amount,
      max(payment_total) filter (where variance > 0) as source_payment_total,
      max(total_amount) filter (where variance > 0) as source_receipt_total,
      max(payment_total) filter (where variance < 0) as target_payment_total,
      max(total_amount) filter (where variance < 0) as target_receipt_total,
      max(payment_date) filter (where variance > 0) as source_payment_date,
      max(payment_date) filter (where variance < 0) as target_payment_date
    from anomalies
    group by student_id
  )
  select
    student_id,
    source_receipt_id,
    target_receipt_id,
    move_amount
  from paired
  where anomaly_count = 2
    and net_variance = 0
    and source_receipt_id is not null
    and target_receipt_id is not null
    and move_amount > 0
    and source_payment_total - source_receipt_total = move_amount
    and target_payment_total = 0
    and target_receipt_total = move_amount
    and source_payment_date <= target_payment_date
    and first_created_at >= timestamptz '2026-05-24 05:55:00+00'
    and last_created_at < timestamptz '2026-05-24 05:57:00+00';

  select count(*)
  into v_anomaly_count
  from (
    select receipt_row.id
    from public.receipts as receipt_row
    left join public.payments as payment_row
      on payment_row.receipt_id = receipt_row.id
    group by receipt_row.id, receipt_row.total_amount
    having coalesce(sum(payment_row.amount), 0) <> receipt_row.total_amount
  ) as anomaly_rows;

  select count(*) into v_pair_count
  from tmp_receipt_allocation_repair_pairs;

  if v_anomaly_count <> 12 or v_pair_count <> 6 then
    raise exception
      'Receipt allocation repair aborted: expected 12 anomalies in 6 guarded pairs, found % anomalies in % pairs.',
      v_anomaly_count,
      v_pair_count;
  end if;

  if exists (
    select 1
    from tmp_receipt_allocation_repair_pairs as pair_row
    join public.payments as payment_row
      on payment_row.receipt_id = pair_row.source_receipt_id
    join public.payment_adjustments as adjustment_row
      on adjustment_row.payment_id = payment_row.id
  ) then
    raise exception
      'Receipt allocation repair aborted: a source payment already has an adjustment.';
  end if;

  create temporary table tmp_receipt_allocation_repair_moves
  on commit drop
  as
  with ranked_payments as (
    select
      pair_row.student_id,
      pair_row.source_receipt_id,
      pair_row.target_receipt_id,
      pair_row.move_amount as pair_move_amount,
      payment_row.id as source_payment_id,
      payment_row.installment_id,
      payment_row.amount as source_payment_amount,
      coalesce(
        sum(payment_row.amount) over (
          partition by pair_row.source_receipt_id
          order by installment_row.due_date desc, installment_row.installment_no desc, payment_row.id
          rows between unbounded preceding and 1 preceding
        ),
        0
      )::integer as allocated_before
    from tmp_receipt_allocation_repair_pairs as pair_row
    join public.payments as payment_row
      on payment_row.receipt_id = pair_row.source_receipt_id
    join public.installments as installment_row
      on installment_row.id = payment_row.installment_id
  )
  select
    student_id,
    source_receipt_id,
    target_receipt_id,
    source_payment_id,
    installment_id,
    least(
      source_payment_amount,
      greatest(pair_move_amount - allocated_before, 0)
    )::integer as move_amount
  from ranked_payments
  where allocated_before < pair_move_amount;

  select count(*) into v_move_count
  from tmp_receipt_allocation_repair_moves
  where move_amount > 0;

  if v_move_count = 0 or exists (
    select 1
    from tmp_receipt_allocation_repair_pairs as pair_row
    left join (
      select source_receipt_id, sum(move_amount)::integer as move_total
      from tmp_receipt_allocation_repair_moves
      group by source_receipt_id
    ) as move_row
      on move_row.source_receipt_id = pair_row.source_receipt_id
    where coalesce(move_row.move_total, 0) <> pair_row.move_amount
  ) then
    raise exception
      'Receipt allocation repair aborted: installment moves do not reconcile to every target receipt.';
  end if;

  insert into public.payment_adjustments (
    payment_id,
    student_id,
    installment_id,
    adjustment_type,
    amount_delta,
    reason,
    notes
  )
  select
    move_row.source_payment_id,
    move_row.student_id,
    move_row.installment_id,
    'correction',
    -move_row.move_amount,
    'Historical receipt allocation correction',
    'Migration 20260727113603: moved allocation to its original receipt without rewriting history.'
  from tmp_receipt_allocation_repair_moves as move_row
  where move_row.move_amount > 0;

  insert into public.payments (
    receipt_id,
    student_id,
    installment_id,
    amount,
    notes,
    discount_applied_at_posting,
    waiver_applied_at_posting,
    pending_before_posting,
    pending_after_posting
  )
  select
    move_row.target_receipt_id,
    move_row.student_id,
    move_row.installment_id,
    move_row.move_amount,
    'Historical allocation correction 20260727113603',
    0,
    0,
    null,
    null
  from tmp_receipt_allocation_repair_moves as move_row
  where move_row.move_amount > 0;

  insert into public.audit_logs (
    table_name,
    record_id,
    action,
    after_data,
    changed_by
  )
  select
    'receipt_allocation_corrections',
    pair_row.target_receipt_id,
    'insert',
    jsonb_build_object(
      'migration_id', '20260727113603',
      'actor', 'production_migration',
      'reason', 'Historical receipt allocation correction',
      'student_id', pair_row.student_id,
      'source_receipt_id', pair_row.source_receipt_id,
      'target_receipt_id', pair_row.target_receipt_id,
      'moved_amount', pair_row.move_amount,
      'method', 'append_only_payment_adjustment_and_allocation'
    ),
    null
  from tmp_receipt_allocation_repair_pairs as pair_row;

  if exists (
    select 1
    from public.v_receipt_effective_allocation_totals as allocation_row
    join (
      select source_receipt_id as receipt_id
      from tmp_receipt_allocation_repair_pairs
      union all
      select target_receipt_id
      from tmp_receipt_allocation_repair_pairs
    ) as repaired_receipt
      on repaired_receipt.receipt_id = allocation_row.receipt_id
    where allocation_row.variance <> 0
  ) then
    raise exception
      'Receipt allocation repair aborted: an effective receipt variance remains after repair.';
  end if;
end;
$repair$;

notify pgrst, 'reload schema';
