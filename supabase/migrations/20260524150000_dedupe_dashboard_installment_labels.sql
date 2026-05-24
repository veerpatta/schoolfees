-- P0-2: Fixes the dashboard RPC so that duplicated installment_label
-- variants (e.g. "Installment 1" vs "Installment 1 (20-04-2026)") no
-- longer produce twice the expected rows in the InstallmentSummary and
-- ClassInstallmentMatrix payloads.
--
-- The previous body keyed `distinct_installments` and grouped the
-- installment summary by both installment_no AND installment_label,
-- which yielded one entry per label variant — so a session with 4
-- installments but two label flavors rendered 8 columns and duplicated
-- installment-progress cards.
--
-- This is a literal CREATE OR REPLACE of the body originally defined in
-- 20260523145352_perf_optimization.sql, with the following surgical
-- changes:
--   * v_installment_summary: groups by installment_no/due_date and picks
--     max(installment_label) (the longer/dated variant wins
--     deterministically).
--   * v_class_installment_matrix.distinct_installments: dedupes by
--     installment_no, picking max(installment_label).
--
-- This is non-destructive — no row is touched, only the RPC body changes.

CREATE OR REPLACE FUNCTION public.get_dashboard_summary(p_session_label text, p_today text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
declare
  v_total_students integer;
  v_total_expected_fees integer;
  v_total_collected integer;
  v_total_pending integer;
  v_overdue_amount integer;
  v_todays_collection integer;
  v_receipts_today integer;
  v_this_month_collection integer;
  v_collection_rate integer;
  v_students_with_pending integer;
  v_total_refund_due integer;
  v_paid_students integer;
  v_partly_paid_students integer;
  v_overdue_students integer;
  v_not_started_students integer;
  v_overdue_installment_count integer;

  v_today_payment_mode_breakdown json;
  v_recent_payments json;
  v_follow_up_queue json;
  v_collection_trend json;
  v_collection_heatmap json;
  v_class_summary json;
  v_installment_summary json;
  v_class_installment_matrix json;

  -- Sync health variables
  v_students_missing_installments jsonb;
  v_students_missing_installment_rows integer;
  v_students_with_no_fee_setting integer;
  v_payment_desk_ready boolean;
  v_dashboard_ready boolean;
  v_sync_health json;
begin
  -- A. KPI Calculations
  select count(*)::integer into v_total_students
  from public.students s
  join public.classes c on c.id = s.class_id
  where s.status = 'active' and c.session_label = p_session_label and c.status = 'active';

  select
    coalesce(sum(total_due), 0)::integer,
    coalesce(sum(total_paid), 0)::integer,
    coalesce(sum(outstanding_amount), 0)::integer
  into v_total_expected_fees, v_total_collected, v_total_pending
  from public.v_workbook_student_financials
  where session_label = p_session_label and record_status = 'active';

  select coalesce(sum(pending_amount), 0)::integer into v_overdue_amount
  from public.v_workbook_installment_balances
  where session_label = p_session_label and balance_status = 'overdue';

  select
    coalesce(sum(r.total_amount), 0)::integer,
    count(*)::integer
  into v_todays_collection, v_receipts_today
  from public.receipts r
  join public.students s on s.id = r.student_id
  join public.classes c on c.id = s.class_id
  where r.payment_date = p_today::date and s.status = 'active' and c.session_label = p_session_label and c.status = 'active';

  select coalesce(sum(r.total_amount), 0)::integer into v_this_month_collection
  from public.receipts r
  join public.students s on s.id = r.student_id
  join public.classes c on c.id = s.class_id
  where r.payment_date >= date_trunc('month', p_today::date)::date
    and r.payment_date <= (date_trunc('month', p_today::date) + interval '1 month - 1 day')::date
    and s.status = 'active' and c.session_label = p_session_label and c.status = 'active';

  if v_total_expected_fees > 0 then
    v_collection_rate := round(coalesce(v_total_collected::numeric / v_total_expected_fees, 0) * 100);
  else
    v_collection_rate := 0;
  end if;

  select count(*)::integer into v_students_with_pending
  from public.v_workbook_student_financials
  where session_label = p_session_label and record_status = 'active' and outstanding_amount > 0;

  select coalesce(sum(greatest(refundable_amount, 0)), 0)::integer into v_total_refund_due
  from public.v_student_financial_state fs
  join public.students s on s.id = fs.student_id
  join public.classes c on c.id = s.class_id
  where s.status = 'active' and c.session_label = p_session_label and c.status = 'active';

  select
    count(case when status_label = 'PAID' then 1 end)::integer,
    count(case when status_label = 'PARTLY PAID' then 1 end)::integer,
    count(case when status_label = 'OVERDUE' then 1 end)::integer,
    count(case when status_label = 'NOT STARTED' then 1 end)::integer
  into v_paid_students, v_partly_paid_students, v_overdue_students, v_not_started_students
  from public.v_workbook_student_financials
  where session_label = p_session_label and record_status = 'active';

  select count(*)::integer into v_overdue_installment_count
  from public.v_workbook_installment_balances
  where session_label = p_session_label and balance_status = 'overdue' and pending_amount > 0;

  -- B. Today Payment Mode Breakdown
  select coalesce(json_agg(t), '[]'::json) into v_today_payment_mode_breakdown
  from (
    select
      payment_mode as "paymentMode",
      sum(total_amount)::integer as amount,
      count(*)::integer as "receiptCount"
    from public.receipts r
    join public.students s on s.id = r.student_id
    join public.classes c on c.id = s.class_id
    where r.payment_date = p_today::date and s.status = 'active' and c.session_label = p_session_label and c.status = 'active'
    group by payment_mode
    order by amount desc
  ) t;

  -- C. Recent Payments (Last 8)
  select coalesce(json_agg(t), '[]'::json) into v_recent_payments
  from (
    select
      r.id::text as "receiptId",
      r.receipt_number as "receiptNumber",
      r.payment_date::text as "paymentDate",
      r.student_id::text as "studentId",
      s.full_name as "studentName",
      s.admission_no as "admissionNo",
      private.normalize_workbook_class_label(c.class_name, c.stream_name) as "classLabel",
      r.payment_mode as "paymentMode",
      r.total_amount as amount
    from public.receipts r
    join public.students s on s.id = r.student_id
    join public.classes c on c.id = s.class_id
    where c.session_label = p_session_label
    order by r.payment_date desc, r.created_at desc
    limit 8
  ) t;

  -- D. Follow-up Queue (Top 10)
  select coalesce(json_agg(t), '[]'::json) into v_follow_up_queue
  from (
    select
      student_id::text as "studentId",
      student_name as "studentName",
      admission_no as "admissionNo",
      class_id::text as "classId",
      class_label as "classLabel",
      father_phone as "fatherPhone",
      outstanding_amount as "outstandingAmount",
      next_due_date::text as "nextDueDate",
      next_due_label as "nextDueLabel",
      next_due_amount as "nextDueAmount",
      status_label as "statusLabel"
    from public.v_workbook_student_financials
    where session_label = p_session_label and record_status = 'active' and outstanding_amount > 0
    order by
      case when status_label = 'OVERDUE' then 0 else 1 end,
      outstanding_amount desc
    limit 10
  ) t;

  -- E. Collection Trend (Last 14 days)
  select coalesce(json_agg(t), '[]'::json) into v_collection_trend
  from (
    select
      r.payment_date::text as date,
      sum(r.total_amount)::integer as amount,
      count(*)::integer as "receiptCount"
    from public.receipts r
    join public.students s on s.id = r.student_id
    join public.classes c on c.id = s.class_id
    where s.status = 'active' and c.session_label = p_session_label and c.status = 'active'
    group by r.payment_date
    order by r.payment_date desc
    limit 14
  ) t;

  -- F. Collection Heatmap (Monthly Collections)
  select coalesce(json_agg(t), '[]'::json) into v_collection_heatmap
  from (
    select
      r.payment_date::text as date,
      sum(r.total_amount)::integer as amount
    from public.receipts r
    join public.students s on s.id = r.student_id
    join public.classes c on c.id = s.class_id
    where s.status = 'active' and c.session_label = p_session_label and c.status = 'active'
      and r.payment_date >= date_trunc('month', p_today::date)::date
      and r.payment_date <= (date_trunc('month', p_today::date) + interval '1 month - 1 day')::date
    group by r.payment_date
    order by r.payment_date
  ) t;

  -- G. Class Summary
  select coalesce(json_agg(t), '[]'::json) into v_class_summary
  from (
    with class_students as (
      select
        c.id as class_id,
        c.session_label,
        private.normalize_workbook_class_label(c.class_name, c.stream_name) as class_label,
        count(*)::integer as total_students,
        c.sort_order
      from public.students s
      join public.classes c on c.id = s.class_id
      where s.status = 'active' and c.session_label = p_session_label and c.status = 'active'
      group by c.id, c.session_label, c.class_name, c.stream_name, c.sort_order
    ),
    class_financials as (
      select
        class_id,
        count(*)::integer as students_with_generated_dues,
        sum(total_due)::integer as expected_amount,
        sum(total_paid)::integer as collected_amount,
        sum(outstanding_amount)::integer as pending_amount,
        count(case when status_label = 'OVERDUE' then 1 end)::integer as overdue_students,
        count(case when outstanding_amount > 0 then 1 end)::integer as students_with_pending
      from public.v_workbook_student_financials
      where session_label = p_session_label and record_status = 'active'
      group by class_id
    ),
    class_overdue as (
      select
        class_id,
        sum(greatest(base_charge - (paid_amount + adjustment_amount), 0))::integer as overdue_amount
      from public.v_workbook_installment_balances
      where session_label = p_session_label and balance_status = 'overdue'
      group by class_id
    )
    select
      cs.class_id as "classId",
      cs.session_label as "sessionLabel",
      cs.class_label as "classLabel",
      cs.total_students as "totalStudents",
      coalesce(cf.students_with_generated_dues, 0) as "studentsWithGeneratedDues",
      greatest(cs.total_students - coalesce(cf.students_with_generated_dues, 0), 0) as "missingDuesStudents",
      coalesce(cf.expected_amount, 0) as "expectedAmount",
      coalesce(cf.collected_amount, 0) as "collectedAmount",
      coalesce(cf.pending_amount, 0) as "pendingAmount",
      coalesce(co.overdue_amount, 0) as "overdueAmount",
      coalesce(cf.overdue_students, 0) as "overdueStudents",
      coalesce(cf.students_with_pending, 0) as "studentsWithPending",
      case
        when coalesce(cf.expected_amount, 0) > 0 then
          round(coalesce(cf.collected_amount::numeric / cf.expected_amount, 0) * 100)::integer
        else 0
      end as "collectionRate"
    from class_students cs
    left join class_financials cf on cf.class_id = cs.class_id
    left join class_overdue co on co.class_id = cs.class_id
    order by pending_amount desc, class_label
  ) t;

  -- H. Installment Summary (dedup label variants — group by installment_no/due_date)
  select coalesce(json_agg(t), '[]'::json) into v_installment_summary
  from (
    select
      installment_no as "installmentNo",
      max(installment_label) as "installmentLabel",
      due_date::text as "dueDate",
      count(distinct student_id)::integer as "studentCount",
      sum(total_charge)::integer as "expectedAmount",
      sum(greatest(paid_amount + adjustment_amount, 0))::integer as "collectedAmount",
      sum(pending_amount)::integer as "pendingAmount",
      sum(case when balance_status = 'overdue' then greatest(base_charge - (paid_amount + adjustment_amount), 0) else 0 end)::integer as "overdueAmount",
      case
        when sum(total_charge) > 0 then
          round(coalesce(sum(greatest(paid_amount + adjustment_amount, 0))::numeric / sum(total_charge), 0) * 100)::integer
        else 0
      end as "collectionRate"
    from public.v_workbook_installment_balances
    where session_label = p_session_label
    group by installment_no, due_date
    order by installment_no
  ) t;

  -- I. Class Installment Matrix (dedup label variants — group distinct_installments by installment_no)
  select coalesce(json_agg(t), '[]'::json) into v_class_installment_matrix
  from (
    with distinct_installments as (
      select
        installment_no,
        max(installment_label) as installment_label
      from public.v_workbook_installment_balances
      where session_label = p_session_label
      group by installment_no
    ),
    class_matrix_base as (
      select
        c.id as class_id,
        private.normalize_workbook_class_label(c.class_name, c.stream_name) as class_label
      from public.classes c
      where c.session_label = p_session_label and c.status = 'active'
    ),
    cross_join as (
      select b.class_id, b.class_label, d.installment_no, d.installment_label
      from class_matrix_base b
      cross join distinct_installments d
    ),
    actual_pending as (
      select
        class_id,
        installment_no,
        sum(pending_amount)::integer as pending_amount
      from public.v_workbook_installment_balances
      where session_label = p_session_label
      group by class_id, installment_no
    ),
    assembled as (
      select
        cj.class_id,
        cj.class_label,
        cj.installment_no,
        cj.installment_label,
        coalesce(ap.pending_amount, 0) as pending_amount
      from cross_join cj
      left join actual_pending ap on ap.class_id = cj.class_id and ap.installment_no = cj.installment_no
    ),
    aggregated_installments as (
      select
        class_id,
        class_label,
        jsonb_agg(
          jsonb_build_object(
            'installmentNo', installment_no,
            'installmentLabel', installment_label,
            'pendingAmount', pending_amount
          ) order by installment_no
        ) as installments,
        sum(pending_amount)::integer as total_pending_amount
      from assembled
      group by class_id, class_label
    )
    select
      class_id::text as "classId",
      class_label as "classLabel",
      installments,
      total_pending_amount as "totalPendingAmount"
    from aggregated_installments
    order by total_pending_amount desc, class_label
  ) t;

  -- J. Sync Health Checks
  select coalesce(jsonb_agg(t), '[]'::jsonb) into v_students_missing_installments
  from (
    select
      s.id::text as "studentId",
      s.admission_no as "admissionNo",
      s.full_name as "fullName",
      c.session_label as "sessionLabel"
    from public.students s
    join public.classes c on c.id = s.class_id
    where s.status = 'active' and c.session_label = p_session_label and c.status = 'active'
      and not exists (
        select 1 from public.installments i
        where i.student_id = s.id and i.status <> 'cancelled'
      )
  ) t;

  v_students_missing_installment_rows := jsonb_array_length(v_students_missing_installments);

  select count(*)::integer into v_students_with_no_fee_setting
  from public.students s
  join public.classes c on c.id = s.class_id
  where s.status = 'active' and c.session_label = p_session_label and c.status = 'active'
    and not exists (
      select 1 from public.fee_settings f
      where f.class_id = s.class_id and f.is_active = true
    );

  v_payment_desk_ready := (v_total_students > 0 and v_students_missing_installment_rows = 0 and v_students_with_no_fee_setting = 0);
  v_dashboard_ready := (v_total_students = 0 or v_payment_desk_ready);

  v_sync_health := jsonb_build_object(
    'sessionMismatch', false,
    'studentsMissingInstallmentRows', v_students_missing_installment_rows,
    'studentsMissingInstallments', v_students_missing_installments,
    'studentsMissingFinancialRows', v_students_missing_installment_rows,
    'studentsWithNoFeeSetting', v_students_with_no_fee_setting,
    'paymentPreviewReady', true,
    'paymentDeskReady', v_payment_desk_ready,
    'dashboardReady', v_dashboard_ready,
    'warnings', case when v_students_missing_installment_rows > 0 then jsonb_build_array('Students exist but dues are missing.') else '[]'::jsonb end,
    'errors', '[]'::jsonb
  );

  -- K. Construct the final aggregated JSON
  return json_build_object(
    'kpis', json_build_object(
      'totalStudents', v_total_students,
      'totalExpectedFees', v_total_expected_fees,
      'totalCollected', v_total_collected,
      'totalPending', v_total_pending,
      'overdueAmount', v_overdue_amount,
      'todaysCollection', v_todays_collection,
      'thisMonthCollection', v_this_month_collection,
      'receiptsToday', v_receipts_today,
      'collectionRate', v_collection_rate
    ),
    'todayPaymentModeBreakdown', v_today_payment_mode_breakdown,
    'recentPayments', v_recent_payments,
    'followUpQueue', v_follow_up_queue,
    'collectionTrend', v_collection_trend,
    'collectionHeatmap', v_collection_heatmap,
    'classSummary', v_class_summary,
    'installmentSummary', v_installment_summary,
    'classInstallmentMatrix', v_class_installment_matrix,
    'studentsWithPending', v_students_with_pending,
    'totalRefundDue', v_total_refund_due,
    'paidStudents', v_paid_students,
    'partlyPaidStudents', v_partly_paid_students,
    'overdueStudents', v_overdue_students,
    'notStartedStudents', v_not_started_students,
    'overdueInstallmentCount', v_overdue_installment_count,
    'systemSyncHealth', v_sync_health
  );
end;
$$;

GRANT EXECUTE ON FUNCTION public.get_dashboard_summary(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_summary(text, text) TO service_role;
