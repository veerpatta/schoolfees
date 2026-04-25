-- Expose pending vs credit/refund state without rewriting posted receipts or payments.

create or replace view public.v_student_financial_state
with (security_invoker = true)
as
with blocked_rows as (
  select
    student_id,
    count(*)::integer as rows_kept_for_review
  from public.config_change_blocked_installments
  group by student_id
),
financials as (
  select
    student_id,
    greatest(gross_base_before_discount - discount_amount, 0)::integer
      + coalesce(late_fee_total, 0)::integer as revised_total_due,
    coalesce(total_paid, 0)::integer as total_paid,
    coalesce(outstanding_amount, 0)::integer as installment_pending_amount
  from public.v_workbook_student_financials
)
select
  financials.student_id,
  financials.revised_total_due as total_due,
  financials.total_paid,
  greatest(financials.revised_total_due - financials.total_paid, 0)::integer as pending_amount,
  greatest(financials.total_paid - financials.revised_total_due, 0)::integer as credit_balance,
  greatest(financials.total_paid - financials.revised_total_due, 0)::integer as overpaid_amount,
  greatest(financials.total_paid - financials.revised_total_due, 0)::integer as refundable_amount,
  coalesce(blocked_rows.rows_kept_for_review, 0)::integer as rows_kept_for_review,
  financials.installment_pending_amount
from financials
left join blocked_rows
  on blocked_rows.student_id = financials.student_id;

grant select on public.v_student_financial_state to authenticated;
