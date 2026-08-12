-- One round trip for everything the rebuilt dashboard shows below the money band.
--
-- The dashboard already learned this lesson once: 20260726172238 moved
-- get_dashboard_summary into SQL after the old code shipped ~2,100 installment
-- rows from Mumbai on every render to produce seven integers, and got two of
-- them wrong on the way (struck-off students counted, reversals dropped). Same
-- reasoning here -- five analytical panels, one query, no reduction in Node.
--
-- Scope matches get_dashboard_fee_split exactly, and for the same reason:
-- active classes, and students who are either active or have actually paid
-- something. A departed student who never paid has had their installments
-- cancelled and contributes nothing either way.
--
-- Everything money-shaped in here is FEES ONLY unless the field name says late
-- fee. That is the whole point of the split in 20260812120000: a dashboard that
-- adds the two together is the thing this change exists to stop.

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
  -- Buckets by days past the due date, on fees only. With four due dates a
  -- year the buckets cluster hard, which is itself the finding: it says how
  -- much of the debt is stale rather than merely late.
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
  -- Split by who forgave it. 'grandfather' is the 2026-08-08 rule change and
  -- the rate backfill; those are the rows an admin can void to bill the money.
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
  -- What lands on the next due date if nobody pays and nobody waives. Nothing
  -- was pre-waived for the installments still ahead, so this arrives in one
  -- night with nobody deciding anything -- which is exactly why it is on screen.
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
          -- Same exclusion get_dashboard_summary uses: a receipt reversed down
          -- to zero was never collection, and counting it inflates the trend.
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

  -- ── Is the debt concentrated, or is everyone a little behind? ────────────
  -- Decides whether chasing a shortlist clears the year or whether this needs
  -- a broad campaign. Worth knowing before anyone starts dialling.
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
    'concentration',     concentration.data
  )
  into v_result
  from debt_age, late_fee_totals, waiver_sources, next_accrual,
       monthly, class_recovery, concentration;

  return coalesce(v_result, '{}'::jsonb);
end;
$function$;

grant execute on function public.get_dashboard_analytics(text) to authenticated;
grant execute on function public.get_dashboard_analytics(text) to service_role;

comment on function public.get_dashboard_analytics(text) is
  'Everything the dashboard shows below the money band, in one round trip: debt age, the late-fee ledger with its waiver sources and next accrual, monthly collection with payment mix, class recovery and debt concentration. Every money field is FEES ONLY unless its name says late fee.';
