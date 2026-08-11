-- On EMI / EMI due / EMI missed student segments.
--
-- The three facets read v_student_repayment_plan_status, the same view the
-- Student page, Payment Desk, Dashboard and Exports use, so a student cannot
-- be "EMI missed" in the list and "on track" on their own page.
--
-- New columns are appended: `create or replace view` only permits additions at
-- the end of the select list.

create or replace view public.v_student_directory
with (security_invoker = true) as
 SELECT s.id AS student_id,
    s.admission_no,
    s.full_name,
    s.date_of_birth,
    s.father_name,
    s.mother_name,
    s.primary_phone,
    s.secondary_phone,
    s.status AS record_status,
    s.class_id,
    s.transport_route_id,
    s.updated_at,
    s.photo_path,
    c.session_label,
    c.status AS class_status,
    c.sort_order AS class_sort_order,
    array_to_string(array_remove(ARRAY[NULLIF(btrim(c.class_name), ''::text),
        CASE
            WHEN NULLIF(btrim(COALESCE(c.section, ''::text)), ''::text) IS NOT NULL THEN 'Section '::text || btrim(c.section)
            ELSE NULL::text
        END, NULLIF(btrim(COALESCE(c.stream_name, ''::text)), ''::text)], NULL::text), ' - '::text) AS class_label,
    COALESCE(f.status_label, ''::text) AS status_label,
    COALESCE(f.outstanding_amount, 0::bigint) AS outstanding_amount,
    COALESCE(f.base_outstanding_amount, 0::bigint) AS base_outstanding_amount,
    COALESCE(f.late_fee_outstanding_amount, 0) AS late_fee_outstanding_amount,
    COALESCE(i.carry_forward_pending_amount, 0) AS old_balance_amount,
    COALESCE(i.overdue_base_amount, 0) AS overdue_base_amount,
    COALESCE(i.pending_late_fee_amount, 0) AS pending_late_fee_amount,
    COALESCE(f.total_paid, 0) AS total_paid,
    COALESCE(f.base_charge_total, 0::bigint) AS base_charge_total,
    f.last_payment_date,
    COALESCE(i.carry_forward_pending_amount, 0) > 0 AS seg_old_balance_due,
    COALESCE(f.status_label, ''::text) = 'OVERDUE'::text AS seg_overdue,
    COALESCE(f.late_fee_outstanding_amount, 0) > 0 AS seg_late_fee_pending,
    COALESCE(f.total_paid, 0) = 0 AND COALESCE(f.base_charge_total, 0::bigint) > 0 AS seg_never_paid,
    COALESCE(f.total_paid, 0) > 0 AND COALESCE(f.outstanding_amount, 0::bigint) > 0 AS seg_partly_paid,
    COALESCE(f.outstanding_amount, 0::bigint) <= 0 AND (COALESCE(f.total_paid, 0) + COALESCE(f.total_discount_closeouts, 0)) > 0 AND COALESCE(f.base_charge_total, 0::bigint) > 0 AS seg_year_clear,
    COALESCE(f.outstanding_amount, 0::bigint) > 0 AS seg_has_dues,
    s.status = 'active'::student_status AS seg_active,
    s.status = 'left'::student_status AS seg_left,
    s.status = 'graduated'::student_status AS seg_graduated,
    s.status <> 'active'::student_status AND COALESCE(f.outstanding_amount, 0::bigint) > 0 AS seg_left_owing,
    COALESCE(f.student_status_label, 'Old'::text) AS student_status_label,
    COALESCE(f.student_status_label, 'Old'::text) = 'New'::text AS seg_new_this_year,
    COALESCE(NULLIF(btrim(COALESCE(s.primary_phone, ''::text)), ''::text), NULLIF(btrim(COALESCE(s.secondary_phone, ''::text)), ''::text)) IS NULL AS seg_missing_phone,
    COALESCE(i.installment_count, 0) = 0 AS seg_dues_not_prepared,
    COALESCE(f.missing_dob_flag, s.date_of_birth IS NULL) AS seg_missing_dob,
    COALESCE(f.duplicate_sr_flag, false) AS seg_duplicate_sr,
    upper(btrim(COALESCE(s.admission_no, ''::text))) ~~ 'PENDING-%'::text AS seg_pending_sr,
    r.route_name IS NOT NULL AND lower(btrim(r.route_name)) <> 'no transport'::text OR COALESCE(f.transport_fee, 0) > 0 AS seg_on_transport,
    COALESCE(f.transport_fee, 0) AS transport_fee,
    r.route_name AS transport_route_name,
    r.route_code AS transport_route_code,
    COALESCE(f.discount_amount, 0::bigint) AS discount_amount,
    COALESCE(f.discount_amount, 0::bigint) > 0 AS seg_has_discount,
    COALESCE(d.policy_codes, '{}'::text[]) AS conventional_policy_codes,
    d.policy_labels AS conventional_discount_labels,
    'rte'::text = ANY (COALESCE(d.policy_codes, '{}'::text[])) AS seg_discount_rte,
    'staff_child'::text = ANY (COALESCE(d.policy_codes, '{}'::text[])) AS seg_discount_staff_child,
    'third_child'::text = ANY (COALESCE(d.policy_codes, '{}'::text[])) AS seg_discount_third_child,
    o.id IS NOT NULL AND (o.custom_tuition_fee_amount IS NOT NULL OR o.custom_transport_fee_amount IS NOT NULL OR COALESCE(o.discount_amount, 0) > 0 OR COALESCE(o.late_fee_waiver_amount, 0) > 0 OR o.other_adjustment_amount IS NOT NULL OR NULLIF(btrim(COALESCE(o.other_adjustment_head, ''::text)), ''::text) IS NOT NULL) AS seg_fee_exception,
    o.id IS NOT NULL AS has_fee_profile,
    COALESCE(m.manual_waiver_count, 0) > 0 AS seg_late_fee_waived,
    lower(concat_ws(' '::text, s.full_name, s.admission_no, c.class_name, c.section, c.stream_name, s.primary_phone, s.secondary_phone, s.father_name, s.mother_name)) AS search_text,
    COALESCE(m.manual_waiver_amount, 0) AS manual_late_fee_waived_amount,
    COALESCE(i.late_fee_waived_count, 0) AS any_late_fee_waived_count,
    rp.plan_id IS NOT NULL as seg_on_emi,
    COALESCE(rp.payment_status, ''::text) = 'due'::text as seg_emi_due,
    COALESCE(rp.payment_status, ''::text) = 'behind'::text as seg_emi_missed,
    rp.plan_id AS repayment_plan_id,
    rp.scope AS repayment_scope,
    rp.payment_status AS repayment_payment_status,
    COALESCE(rp.monthly_amount, 0) AS repayment_monthly_amount,
    COALESCE(rp.remaining_balance, 0) AS repayment_remaining_balance,
    COALESCE(rp.catch_up_amount, 0) AS repayment_catch_up_amount,
    COALESCE(rp.missed_installment_count, 0) AS repayment_missed_count,
    rp.next_due_date AS repayment_next_due_date,
    rp.end_date AS repayment_end_date,
    COALESCE(rp.plan_review_needed, false) AS repayment_plan_review_needed
   FROM students s
     JOIN classes c ON c.id = s.class_id
     LEFT JOIN transport_routes r ON r.id = s.transport_route_id
     LEFT JOIN v_workbook_student_financials f ON f.student_id = s.id
     LEFT JOIN v_student_installment_facets i ON i.student_id = s.id
     LEFT JOIN v_student_conventional_discounts d ON d.student_id = s.id AND d.session_label = c.session_label
     LEFT JOIN v_student_manual_late_fee_waivers m ON m.student_id = s.id AND m.session_label = c.session_label
     LEFT JOIN student_fee_overrides o ON o.student_id = s.id AND o.is_active
     LEFT JOIN v_student_repayment_plan_status rp ON rp.student_id = s.id AND rp.lifecycle = 'active'::text;

create or replace function public.get_student_segment_counts(p_session_label text, p_class_id uuid DEFAULT NULL::uuid, p_route_id uuid DEFAULT NULL::uuid, p_query text DEFAULT NULL::text, p_statuses text[] DEFAULT NULL::text[], p_active_classes_only boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with population as (
    select d.*
    from public.v_student_directory as d
    where d.session_label = p_session_label
      and (not p_active_classes_only or d.class_status = 'active')
      and (p_class_id is null or d.class_id = p_class_id)
      and (p_route_id is null or d.transport_route_id = p_route_id)
      and (
        p_query is null or btrim(p_query) = ''
        or d.search_text like '%' || lower(btrim(p_query)) || '%'
      )
  ),
  scoped as (
    select * from population
    where p_statuses is null or record_status::text = any(p_statuses)
  )
  select jsonb_build_object(
    'scopeTotal',      (select count(*) from scoped),
    'populationTotal', (select count(*) from population),
    'enrolment', (
      select jsonb_build_object(
        'active',      count(*) filter (where seg_active),
        'left',        count(*) filter (where seg_left),
        'leftOwing',   count(*) filter (where seg_left_owing),
        'graduated',   count(*) filter (where seg_graduated),
        'newThisYear', count(*) filter (where seg_new_this_year)
      ) from population
    ),
    'counts', (
      select jsonb_build_object(
        'oldBalanceDue',       count(*) filter (where seg_old_balance_due),
        'overdue',             count(*) filter (where seg_overdue),
        'lateFeePending',      count(*) filter (where seg_late_fee_pending),
        'partlyPaid',          count(*) filter (where seg_partly_paid),
        'yearClear',           count(*) filter (where seg_year_clear),
        'neverPaid',           count(*) filter (where seg_never_paid),
        'hasDues',             count(*) filter (where seg_has_dues),
        'missingPhone',        count(*) filter (where seg_missing_phone),
        'duesNotPrepared',     count(*) filter (where seg_dues_not_prepared),
        'missingDob',          count(*) filter (where seg_missing_dob),
        'duplicateSr',         count(*) filter (where seg_duplicate_sr),
        'pendingSr',           count(*) filter (where seg_pending_sr),
        'onTransport',         count(*) filter (where seg_on_transport),
        'hasDiscount',         count(*) filter (where seg_has_discount),
        'discountRte',         count(*) filter (where seg_discount_rte),
        'discountStaffChild',  count(*) filter (where seg_discount_staff_child),
        'discountThirdChild',  count(*) filter (where seg_discount_third_child),
        'feeException',        count(*) filter (where seg_fee_exception),
        'lateFeeWaived',       count(*) filter (where seg_late_fee_waived),
        'onEmi',               count(*) filter (where seg_on_emi),
        'emiDue',              count(*) filter (where seg_emi_due),
        'emiMissed',           count(*) filter (where seg_emi_missed)
      ) from scoped
    )
  );
$function$;
