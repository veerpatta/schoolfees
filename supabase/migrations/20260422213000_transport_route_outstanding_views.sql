create or replace view public.v_installment_balances
with (security_invoker = true)
as
with payment_totals as (
  select
    installment_id,
    coalesce(sum(amount), 0) as payments_total
  from public.payments
  group by installment_id
),
adjustment_totals as (
  select
    installment_id,
    coalesce(sum(amount_delta), 0) as adjustments_total
  from public.payment_adjustments
  group by installment_id
)
select
  installments.id as installment_id,
  installments.student_id,
  students.transport_route_id,
  routes.route_name as transport_route_name,
  routes.route_code as transport_route_code,
  students.admission_no,
  students.full_name,
  classes.session_label,
  classes.class_name,
  coalesce(classes.section, '') as section,
  coalesce(classes.stream_name, '') as stream_name,
  installments.installment_no,
  installments.installment_label,
  installments.due_date,
  installments.status as installment_status,
  installments.amount_due,
  coalesce(payment_totals.payments_total, 0) as payments_total,
  coalesce(adjustment_totals.adjustments_total, 0) as adjustments_total,
  case
    when installments.status = 'waived' then 0
    else greatest(
      installments.amount_due
      - (coalesce(payment_totals.payments_total, 0) + coalesce(adjustment_totals.adjustments_total, 0)),
      0
    )
  end as outstanding_amount,
  case
    when installments.status = 'waived' then 'waived'
    when installments.status = 'cancelled' then 'cancelled'
    when greatest(
      installments.amount_due
      - (coalesce(payment_totals.payments_total, 0) + coalesce(adjustment_totals.adjustments_total, 0)),
      0
    ) = 0 then 'paid'
    when coalesce(payment_totals.payments_total, 0) + coalesce(adjustment_totals.adjustments_total, 0) > 0 then 'partial'
    when current_date > installments.due_date then 'overdue'
    else 'pending'
  end as balance_status
from public.installments
join public.students on students.id = installments.student_id
join public.classes on classes.id = installments.class_id
left join public.transport_routes as routes on routes.id = students.transport_route_id
left join payment_totals on payment_totals.installment_id = installments.id
left join adjustment_totals on adjustment_totals.installment_id = installments.id
where installments.status <> 'cancelled';

create or replace view public.v_transport_route_outstanding
with (security_invoker = true)
as
select
  coalesce(transport_route_id::text, 'unassigned') as route_bucket,
  transport_route_id,
  coalesce(transport_route_name, 'No route') as route_name,
  transport_route_code,
  count(distinct student_id) as students_with_dues,
  count(*) as open_installments,
  count(*) filter (where balance_status = 'overdue') as overdue_installments,
  coalesce(sum(outstanding_amount), 0) as outstanding_amount
from public.v_installment_balances
where outstanding_amount > 0
  and balance_status in ('partial', 'overdue', 'pending')
group by
  coalesce(transport_route_id::text, 'unassigned'),
  transport_route_id,
  coalesce(transport_route_name, 'No route'),
  transport_route_code;
