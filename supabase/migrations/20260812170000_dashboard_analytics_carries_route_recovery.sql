-- Fold route recovery into the analytics RPC, and stop shipping 507 rows to do it.
--
-- getRouteCollectionSummary selected seven columns for every active student in
-- the session out of v_workbook_student_financials and grouped them by transport
-- route in Node. On live 2026-27 that is 507 rows crossing from Mumbai on every
-- dashboard render, to produce about twenty.
--
-- This is the same mistake 20260726172238 fixed for get_dashboard_summary, which
-- was shipping ~2,100 installment rows to compute seven integers. Grouping in
-- SQL also means route recovery lands in the one cached payload the rest of the
-- boards already share, so switching boards stops re-fetching it.
--
-- expectedAmount is base_charge_total, not total_due: the fee book excludes the
-- late fee, and a recovery percentage that moves because a due date passed would
-- be measuring the calendar rather than the collection.

create or replace function public.get_dashboard_analytics(p_session_label text)
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
     and not public.has_any_permission(array['dashboard:view', 'finance:view'])
  then
    raise exception 'You do not have permission to read dashboard analytics.';
  end if;

  with scoped as (
    select b.*
    from public.v_workbook_installment_balances b
    join public.students s on s.id = b.student_id
    join public.classes  c on c.id = b.class_id
    where b.session_label = p_session_label
      and c.status = 'active'
      and (
        s.status = 'active'
        or exists (
          select 1 from public.payments p
          join public.receipts r on r.id = p.receipt_id
          where p.student_id = s.id and r.payment_mode <> 'discount'
        )
      )
  ),

  -- ── How old is the money? ────────────────────────────────────────────────
  aged as (
    select
      case
        when current_date - due_date <= 30 then '0-30'
        when current_date - due_date <= 60 then '31-60'
        when current_date - due_date <= 90 then '61-90'
        else '90+'
      end as bucket,
      pending_amount,
      student_id
    from scoped
    where pending_amount > 0
      and due_date < current_date
      and not is_carry_forward
  ),
  debt_age as (
    select coalesce(jsonb_agg(row order by sort_key), '[]'::jsonb) as data
    from (
      select
        jsonb_build_object(
          'bucket',      bucket,
          'feesPending', sum(pending_amount)::integer,
          'rows',        count(*)::integer,
          'students',    count(distinct student_id)::integer
        ) as row,
        case bucket when '0-30' then 1 when '31-60' then 2 when '61-90' then 3 else 4 end as sort_key
      from aged
      group by bucket
    ) t
  ),

  -- ── The late fee, on its own ─────────────────────────────────────────────
  late_fee_totals as (
    select
      coalesce(sum(raw_late_fee), 0)::integer     as charged,
      coalesce(sum(waiver_applied), 0)::integer   as waived,
      coalesce(sum(late_fee_pending), 0)::integer as pending,
      count(distinct student_id) filter (where late_fee_pending > 0)::integer as students_with_pending
    from scoped
  ),
  waiver_sources as (
    select coalesce(jsonb_agg(row order by amount desc), '[]'::jsonb) as data
    from (
      select
        jsonb_build_object(
          'source',   w.source,
          'rows',     count(*)::integer,
          'students', count(distinct w.student_id)::integer,
          'amount',   sum(w.amount)::integer
        ) as row,
        sum(w.amount) as amount
      from public.student_late_fee_waivers w
      join scoped b on b.installment_id = w.installment_id
      where w.voided_at is null
      group by w.source
    ) t
  ),
  next_accrual as (
    select
      min(due_date) as due_date,
      coalesce(sum(late_fee_flat) filter (where due_date = min_due), 0)::integer as amount,
      count(*) filter (where due_date = min_due)::integer as installments
    from (
      select s.due_date,
             coalesce(i.late_fee_flat_amount, 0) as late_fee_flat,
             min(s.due_date) over () as min_due
      from scoped s
      join public.installments i on i.id = s.installment_id
      where s.due_date >= current_date
        and s.pending_amount > 0
        and not s.is_carry_forward
    ) t
  ),

  -- ── Collection over time, with the payment mix ───────────────────────────
  monthly as (
    select coalesce(jsonb_agg(row order by month), '[]'::jsonb) as data
    from (
      select
        to_char(r.payment_date, 'YYYY-MM') as month,
        jsonb_build_object(
          'month',    to_char(r.payment_date, 'YYYY-MM'),
          'amount',   sum(r.total_amount)::integer,
          'receipts', count(*)::integer,
          'students', count(distinct r.student_id)::integer,
          'byMode',   jsonb_object_agg(r.payment_mode, mode_amount)
        ) as row
      from (
        select r.payment_date, r.total_amount, r.student_id, r.payment_mode,
               sum(r.total_amount) over (
                 partition by to_char(r.payment_date, 'YYYY-MM'), r.payment_mode
               ) as mode_amount
        from public.receipts r
        join public.students s on s.id = r.student_id
        join public.classes c on c.id = s.class_id and c.session_label = p_session_label
        where r.payment_mode <> 'discount'
          and not exists (
            select 1 from public.v_receipt_reversal_totals rr
            where rr.receipt_id = r.id and rr.reversed_amount >= r.total_amount
          )
      ) r
      group by to_char(r.payment_date, 'YYYY-MM')
    ) t
  ),

  -- ── Class recovery, one ranked list ──────────────────────────────────────
  class_rows as (
    select
      class_id,
      class_label,
      coalesce(sum(base_charge), 0)::integer                            as expected,
      coalesce(sum(least(greatest(applied_amount, 0), base_charge)), 0)::integer as collected,
      coalesce(sum(pending_amount), 0)::integer                         as fees_pending,
      coalesce(sum(late_fee_pending), 0)::integer                       as late_fee_pending,
      count(distinct student_id) filter (where pending_amount > 0 and due_date < current_date)::integer as students_at_risk,
      count(distinct student_id)::integer                               as students
    from scoped
    where not is_carry_forward
    group by class_id, class_label
  ),
  class_recovery as (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'classId',        class_id,
        'classLabel',     class_label,
        'expected',       expected,
        'collected',      collected,
        'feesPending',    fees_pending,
        'lateFeePending', late_fee_pending,
        'studentsAtRisk', students_at_risk,
        'students',       students,
        'recoveryRate',   case when expected > 0
                               then round(collected::numeric / expected * 100)::integer
                               else 0 end
      ) order by fees_pending desc
    ), '[]'::jsonb) as data
    from class_rows
  ),

  -- ── Route recovery ───────────────────────────────────────────────────────
  -- Reads the student rollup rather than scoped: one row per student, so the
  -- student count is a count and not a count(distinct) over installments.
  route_rows as (
    select
      f.transport_route_id                                     as route_id,
      coalesce(
        nullif(trim(coalesce(f.transport_route_name, '')), ''),
        'No transport'
      )                                                        as route_label,
      count(*)::integer                                        as students,
      coalesce(sum(f.base_charge_total), 0)::integer           as expected,
      coalesce(sum(f.total_paid), 0)::integer                  as collected,
      coalesce(sum(f.outstanding_amount), 0)::integer          as fees_pending
    from public.v_workbook_student_financials f
    where f.session_label = p_session_label
      and f.record_status = 'active'
    group by f.transport_route_id, 2
  ),
  route_recovery as (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'routeId',         route_id,
        'routeLabel',      route_label,
        'studentCount',    students,
        'expectedAmount',  expected,
        'collectedAmount', collected,
        'pendingAmount',   fees_pending,
        'collectionRate',  case when expected > 0
                                then round(collected::numeric / expected * 100)::integer
                                else 0 end
      ) order by fees_pending desc
    ), '[]'::jsonb) as data
    from route_rows
  ),

  -- ── Is the debt concentrated, or is everyone a little behind? ────────────
  per_student as (
    select student_id, sum(pending_amount)::integer as fees_pending
    from scoped
    where not is_carry_forward
    group by student_id
    having sum(pending_amount) > 0
  ),
  ranked as (
    select fees_pending,
           row_number() over (order by fees_pending desc) as rn,
           sum(fees_pending) over () as total
    from per_student
  ),
  concentration as (
    select jsonb_build_object(
      'studentsWithDues', count(*)::integer,
      'totalPending',     coalesce(max(total), 0)::integer,
      'top10Amount',      coalesce(sum(fees_pending) filter (where rn <= 10), 0)::integer,
      'top50Amount',      coalesce(sum(fees_pending) filter (where rn <= 50), 0)::integer,
      'top10Pct',         case when coalesce(max(total), 0) > 0
                               then round(100.0 * coalesce(sum(fees_pending) filter (where rn <= 10), 0) / max(total))::integer
                               else 0 end,
      'top50Pct',         case when coalesce(max(total), 0) > 0
                               then round(100.0 * coalesce(sum(fees_pending) filter (where rn <= 50), 0) / max(total))::integer
                               else 0 end
    ) as data
    from ranked
  )

  select jsonb_build_object(
    'sessionLabel', p_session_label,
    'debtAge',      debt_age.data,
    'lateFee', jsonb_build_object(
      'charged',             late_fee_totals.charged,
      'waived',              late_fee_totals.waived,
      'pending',             late_fee_totals.pending,
      'studentsWithPending', late_fee_totals.students_with_pending,
      'byWaiverSource',      waiver_sources.data,
      'nextAccrual', jsonb_build_object(
        'dueDate',      next_accrual.due_date,
        'amount',       next_accrual.amount,
        'installments', next_accrual.installments
      )
    ),
    'monthlyCollection', monthly.data,
    'classRecovery',     class_recovery.data,
    'routeRecovery',     route_recovery.data,
    'concentration',     concentration.data
  )
  into v_result
  from debt_age, late_fee_totals, waiver_sources, next_accrual,
       monthly, class_recovery, route_recovery, concentration;

  return coalesce(v_result, '{}'::jsonb);
end;
$function$;

grant execute on function public.get_dashboard_analytics(text) to authenticated;
grant execute on function public.get_dashboard_analytics(text) to service_role;

comment on function public.get_dashboard_analytics(text) is
  'Everything the dashboard shows below the money band, in one round trip: debt age, the late-fee ledger with its waiver sources and next accrual, monthly collection with payment mix, class recovery, route recovery and debt concentration. Every money field is FEES ONLY unless its name says late fee.';
