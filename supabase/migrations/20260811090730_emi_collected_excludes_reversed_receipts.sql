-- "Collected this month" on the EMI card must not count money that was handed
-- back. The receipt link is append-only and keeps its original contribution
-- after a reversal, which is correct as a record of what the receipt did — but
-- reading it raw made an undone Rs 1,000 keep inflating the month.
--
-- Net each link against the reversal recorded on its receipt, the same way the
-- rest of the dashboard has since 20260726172238.
create or replace function public.get_dashboard_repayment_summary(p_session_label text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'private', 'pg_temp'
as $function$
declare
  v_result jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not public.has_any_permission(array['dashboard:view', 'finance:view', 'defaulters:view'])
  then
    raise exception 'You do not have permission to read EMI plan metrics.';
  end if;

  with scoped as (
    select v.*, s.full_name, s.admission_no
    from public.v_student_repayment_plan_status v
    join public.students s on s.id = v.student_id
    where v.lifecycle = 'active'
      and v.session_label = p_session_label
  ),
  month_window as (
    select
      date_trunc('month', (now() at time zone 'Asia/Kolkata')::date)::date as month_start,
      (date_trunc('month', (now() at time zone 'Asia/Kolkata')::date) + interval '1 month')::date as next_month_start
  ),
  expected_this_month as (
    select coalesce(sum(sch.amount), 0)::integer as expected
    from public.student_repayment_schedule sch
    join scoped on scoped.plan_id = sch.plan_id
    cross join month_window w
    where sch.due_date >= w.month_start and sch.due_date < w.next_month_start
  ),
  collected_this_month as (
    -- A reversal can only claw back what the receipt actually put into the
    -- plan, hence the least(): a partial reversal nets, a full one zeroes.
    select coalesce(
      sum(
        greatest(
          link.contribution_amount
            - least(coalesce(rev.reversed_amount, 0), link.contribution_amount),
          0
        )
      ),
      0
    )::integer as collected
    from public.student_repayment_receipt_links link
    join scoped on scoped.plan_id = link.plan_id
    join public.receipts r on r.id = link.receipt_id
    left join public.v_receipt_reversal_totals rev on rev.receipt_id = link.receipt_id
    cross join month_window w
    where r.payment_date >= w.month_start and r.payment_date < w.next_month_start
  ),
  priority as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'studentId', p.student_id,
          'planId', p.plan_id,
          'studentName', p.full_name,
          'admissionNo', p.admission_no,
          'paymentStatus', p.payment_status,
          'missedInstallmentCount', p.missed_installment_count,
          'catchUpAmount', p.catch_up_amount,
          'remainingBalance', p.remaining_balance,
          'nextDueDate', p.next_due_date
        )
        order by p.missed_installment_count desc, p.catch_up_amount desc, p.remaining_balance desc
      ),
      '[]'::jsonb
    ) as students
    from (
      select * from scoped
      where payment_status in ('due', 'behind')
      order by missed_installment_count desc, catch_up_amount desc, remaining_balance desc
      limit 8
    ) p
  )
  select jsonb_build_object(
    'sessionLabel',       p_session_label,
    'activePlans',        (select count(*) from scoped),
    'onTrack',            (select count(*) from scoped where payment_status in ('on_track', 'upcoming')),
    'dueNow',             (select count(*) from scoped where payment_status = 'due'),
    'missed',             (select count(*) from scoped where payment_status = 'behind'),
    'completed',          (select count(*) from scoped where payment_status = 'completed'),
    'planReviewNeeded',   (select count(*) from scoped where plan_review_needed),
    'openingBalanceTotal',(select coalesce(sum(opening_balance), 0)::integer from scoped),
    'remainingTotal',     (select coalesce(sum(remaining_balance), 0)::integer from scoped),
    'catchUpTotal',       (select coalesce(sum(catch_up_amount), 0)::integer from scoped),
    'expectedThisMonth',  (select expected from expected_this_month),
    'collectedThisMonth', (select collected from collected_this_month),
    'topPriorityStudents',(select students from priority)
  )
  into v_result;

  return v_result;
end;
$function$;
