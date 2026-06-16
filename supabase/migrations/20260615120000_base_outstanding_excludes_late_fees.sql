-- Late fees are fines, not part of "expected" fees. This migration makes the
-- canonical financial projection treat an installment / student as settled once
-- the BASE charge is covered, regardless of any unpaid late fee.
--
-- New, base-only signals added to v_workbook_student_financials:
--   * base_outstanding_amount    sum of per-installment base pending (late-fee free)
--   * late_fee_outstanding_amount the unpaid late-fee remainder (kept VISIBLE so
--                                 collectors still see the money; it just never
--                                 makes a student a fee defaulter)
--
-- Behaviour changes (display / eligibility only):
--   * status_label = 'PAID' once base_outstanding_amount <= 0
--   * next_due_*, inst{1..4}_pending, paid/partly/overdue installment counts all
--     track base pending
--
-- Posting + allocation are deliberately UNCHANGED (they read v_installment_balances
-- and the RPCs), so late fees remain collectable — they simply no longer read as
-- "due / pending / not-paid".
--
-- The dependent chain (v_student_financial_state, v_notion_student_fee_summary)
-- is recreated verbatim because DROP ... CASCADE removes them.

set search_path = public, private;

drop materialized view if exists public.v_workbook_student_financials cascade;

create materialized view public.v_workbook_student_financials as
 WITH session_policy AS (
         SELECT fee_policy_configs.academic_session_label,
            fee_policy_configs.installment_schedule,
            fee_policy_configs.new_student_academic_fee_amount,
            fee_policy_configs.old_student_academic_fee_amount
           FROM fee_policy_configs
          WHERE fee_policy_configs.calculation_model = 'workbook_v1'::text
          ORDER BY fee_policy_configs.academic_session_label, fee_policy_configs.updated_at DESC
        ), school_default AS (
         SELECT school_fee_defaults.tuition_fee_amount,
            school_fee_defaults.transport_fee_amount,
            school_fee_defaults.student_type_default
           FROM school_fee_defaults
          WHERE school_fee_defaults.is_active = true
          ORDER BY school_fee_defaults.updated_at DESC
         LIMIT 1
        ), student_base AS (
         SELECT s.id AS student_id,
            s.admission_no,
            s.full_name AS student_name,
            s.date_of_birth,
            s.father_name,
            s.mother_name,
            s.primary_phone AS father_phone,
            s.secondary_phone AS mother_phone,
            s.status AS record_status,
            s.class_id,
            c.session_label,
            c.class_name,
            private.normalize_workbook_class_label(c.class_name, c.stream_name) AS class_label,
            c.sort_order,
            s.transport_route_id,
            route_row.route_name AS transport_route_name,
            route_row.route_code AS transport_route_code,
            COALESCE(NULLIF(TRIM(BOTH FROM override_row.student_type_override), ''::text), fee_row.student_type_default, school_default.student_type_default, 'existing'::text) AS student_status_code,
            COALESCE(override_row.custom_tuition_fee_amount, fee_row.tuition_fee_amount, school_default.tuition_fee_amount, 0) AS tuition_fee,
                CASE
                    WHEN override_row.custom_transport_fee_amount IS NOT NULL THEN override_row.custom_transport_fee_amount
                    WHEN s.transport_route_id IS NOT NULL THEN COALESCE(route_row.annual_fee_amount, route_row.default_installment_amount * jsonb_array_length(session_policy.installment_schedule))
                    ELSE 0
                END AS transport_fee,
                CASE
                    WHEN override_row.other_adjustment_amount IS NOT NULL THEN override_row.other_adjustment_amount::bigint
                    WHEN override_row.custom_other_fee_heads IS NOT NULL AND override_row.custom_other_fee_heads <> '{}'::jsonb THEN COALESCE(( SELECT sum(jsonb_each_text.value::integer) AS sum
                       FROM jsonb_each_text(override_row.custom_other_fee_heads) jsonb_each_text(key, value)), 0::bigint)
                    ELSE 0::bigint
                END AS other_adjustment_amount,
                CASE
                    WHEN NULLIF(TRIM(BOTH FROM COALESCE(override_row.other_adjustment_head, ''::text)), ''::text) IS NOT NULL THEN NULLIF(TRIM(BOTH FROM COALESCE(override_row.other_adjustment_head, ''::text)), ''::text)
                    WHEN override_row.custom_other_fee_heads IS NOT NULL AND override_row.custom_other_fee_heads <> '{}'::jsonb THEN 'Other fee / adjustment'::text
                    ELSE NULL::text
                END AS other_adjustment_head,
            COALESCE(override_row.discount_amount, 0) AS raw_discount_amount,
            COALESCE(override_row.late_fee_waiver_amount, 0) AS late_fee_waiver_amount,
            override_row.reason AS override_reason,
            count(*) OVER (PARTITION BY (NULLIF(TRIM(BOTH FROM s.admission_no), ''::text))) AS admission_no_count
           FROM students s
             JOIN classes c ON c.id = s.class_id
             JOIN session_policy ON session_policy.academic_session_label = c.session_label
             LEFT JOIN school_default ON true
             LEFT JOIN fee_settings fee_row ON fee_row.class_id = c.id AND fee_row.is_active = true
             LEFT JOIN student_fee_overrides override_row ON override_row.student_id = s.id AND override_row.is_active = true
             LEFT JOIN transport_routes route_row ON route_row.id = s.transport_route_id
        ), student_profile AS (
         SELECT student_base.student_id,
            student_base.admission_no,
            student_base.student_name,
            student_base.date_of_birth,
            student_base.father_name,
            student_base.mother_name,
            student_base.father_phone,
            student_base.mother_phone,
            student_base.record_status,
            student_base.class_id,
            student_base.session_label,
            student_base.class_name,
            student_base.class_label,
            student_base.sort_order,
            student_base.transport_route_id,
            student_base.transport_route_name,
            student_base.transport_route_code,
            student_base.student_status_code,
            student_base.tuition_fee,
            student_base.transport_fee,
            student_base.other_adjustment_amount,
            student_base.other_adjustment_head,
            student_base.raw_discount_amount,
            student_base.late_fee_waiver_amount,
            student_base.override_reason,
            student_base.admission_no_count,
                CASE
                    WHEN student_base.student_status_code = 'new'::text THEN session_policy.new_student_academic_fee_amount
                    ELSE session_policy.old_student_academic_fee_amount
                END AS academic_fee
           FROM student_base
             JOIN session_policy ON session_policy.academic_session_label = student_base.session_label
        ), student_profile_enriched AS (
         SELECT student_profile.student_id,
            student_profile.admission_no,
            student_profile.student_name,
            student_profile.date_of_birth,
            student_profile.father_name,
            student_profile.mother_name,
            student_profile.father_phone,
            student_profile.mother_phone,
            student_profile.record_status,
            student_profile.class_id,
            student_profile.session_label,
            student_profile.class_name,
            student_profile.class_label,
            student_profile.sort_order,
            student_profile.transport_route_id,
            student_profile.transport_route_name,
            student_profile.transport_route_code,
            student_profile.student_status_code,
            student_profile.tuition_fee,
            student_profile.transport_fee,
            student_profile.other_adjustment_amount,
            student_profile.other_adjustment_head,
            student_profile.raw_discount_amount,
            student_profile.late_fee_waiver_amount,
            student_profile.override_reason,
            student_profile.admission_no_count,
            student_profile.academic_fee,
            GREATEST(0::bigint, student_profile.tuition_fee + student_profile.transport_fee + student_profile.academic_fee + student_profile.other_adjustment_amount) AS gross_base_before_discount,
            LEAST(COALESCE(student_profile.raw_discount_amount, 0)::bigint, GREATEST(0::bigint, student_profile.tuition_fee + student_profile.transport_fee + student_profile.academic_fee + student_profile.other_adjustment_amount)) AS discount_amount
           FROM student_profile
        ), installment_summary AS (
         SELECT v_workbook_installment_balances.student_id,
            COALESCE(sum(v_workbook_installment_balances.base_charge), 0::bigint)::integer AS base_charge_total,
            COALESCE(sum(v_workbook_installment_balances.final_late_fee), 0::bigint)::integer AS late_fee_total,
            COALESCE(sum(v_workbook_installment_balances.total_charge), 0::bigint)::integer AS total_due,
            COALESCE(sum(v_workbook_installment_balances.applied_amount), 0::bigint)::integer AS total_paid,
            COALESCE(sum(v_workbook_installment_balances.discount_closeout_amount), 0::bigint)::integer AS total_discount_closeouts,
            COALESCE(sum(v_workbook_installment_balances.pending_amount), 0::bigint)::integer AS outstanding_amount,
            COALESCE(sum(GREATEST(v_workbook_installment_balances.base_charge - v_workbook_installment_balances.applied_amount - v_workbook_installment_balances.discount_closeout_amount, 0)), 0::bigint)::integer AS base_outstanding_amount,
            COALESCE(max(v_workbook_installment_balances.last_payment_date), NULL::date) AS last_payment_date,
            count(*) FILTER (WHERE GREATEST(v_workbook_installment_balances.base_charge - v_workbook_installment_balances.applied_amount - v_workbook_installment_balances.discount_closeout_amount, 0) <= 0) AS paid_installment_count,
            count(*) FILTER (WHERE GREATEST(v_workbook_installment_balances.base_charge - v_workbook_installment_balances.applied_amount - v_workbook_installment_balances.discount_closeout_amount, 0) > 0 AND (v_workbook_installment_balances.applied_amount > 0 OR v_workbook_installment_balances.discount_closeout_amount > 0)) AS partly_paid_installment_count,
            count(*) FILTER (WHERE GREATEST(v_workbook_installment_balances.base_charge - v_workbook_installment_balances.applied_amount - v_workbook_installment_balances.discount_closeout_amount, 0) > 0 AND v_workbook_installment_balances.due_date < CURRENT_DATE) AS overdue_installment_count,
            max(
                CASE
                    WHEN v_workbook_installment_balances.installment_no = 1 THEN v_workbook_installment_balances.base_charge
                    ELSE NULL::integer
                END) AS installment1_base,
            max(
                CASE
                    WHEN v_workbook_installment_balances.installment_no = 2 THEN v_workbook_installment_balances.base_charge
                    ELSE NULL::integer
                END) AS installment2_base,
            max(
                CASE
                    WHEN v_workbook_installment_balances.installment_no = 3 THEN v_workbook_installment_balances.base_charge
                    ELSE NULL::integer
                END) AS installment3_base,
            max(
                CASE
                    WHEN v_workbook_installment_balances.installment_no = 4 THEN v_workbook_installment_balances.base_charge
                    ELSE NULL::integer
                END) AS installment4_base,
            max(
                CASE
                    WHEN v_workbook_installment_balances.installment_no = 1 THEN v_workbook_installment_balances.paid_amount
                    ELSE NULL::integer
                END) AS paid_installment1,
            max(
                CASE
                    WHEN v_workbook_installment_balances.installment_no = 2 THEN v_workbook_installment_balances.paid_amount
                    ELSE NULL::integer
                END) AS paid_installment2,
            max(
                CASE
                    WHEN v_workbook_installment_balances.installment_no = 3 THEN v_workbook_installment_balances.paid_amount
                    ELSE NULL::integer
                END) AS paid_installment3,
            max(
                CASE
                    WHEN v_workbook_installment_balances.installment_no = 4 THEN v_workbook_installment_balances.paid_amount
                    ELSE NULL::integer
                END) AS paid_installment4,
            max(
                CASE
                    WHEN v_workbook_installment_balances.installment_no = 1 THEN v_workbook_installment_balances.raw_late_fee
                    ELSE NULL::integer
                END) AS raw_late_fee1,
            max(
                CASE
                    WHEN v_workbook_installment_balances.installment_no = 2 THEN v_workbook_installment_balances.raw_late_fee
                    ELSE NULL::integer
                END) AS raw_late_fee2,
            max(
                CASE
                    WHEN v_workbook_installment_balances.installment_no = 3 THEN v_workbook_installment_balances.raw_late_fee
                    ELSE NULL::integer
                END) AS raw_late_fee3,
            max(
                CASE
                    WHEN v_workbook_installment_balances.installment_no = 4 THEN v_workbook_installment_balances.raw_late_fee
                    ELSE NULL::integer
                END) AS raw_late_fee4,
            max(
                CASE
                    WHEN v_workbook_installment_balances.installment_no = 1 THEN v_workbook_installment_balances.waiver_applied
                    ELSE NULL::integer
                END) AS waiver_applied1,
            max(
                CASE
                    WHEN v_workbook_installment_balances.installment_no = 2 THEN v_workbook_installment_balances.waiver_applied
                    ELSE NULL::integer
                END) AS waiver_applied2,
            max(
                CASE
                    WHEN v_workbook_installment_balances.installment_no = 3 THEN v_workbook_installment_balances.waiver_applied
                    ELSE NULL::integer
                END) AS waiver_applied3,
            max(
                CASE
                    WHEN v_workbook_installment_balances.installment_no = 4 THEN v_workbook_installment_balances.waiver_applied
                    ELSE NULL::integer
                END) AS waiver_applied4,
            max(
                CASE
                    WHEN v_workbook_installment_balances.installment_no = 1 THEN v_workbook_installment_balances.final_late_fee
                    ELSE NULL::integer
                END) AS final_late_fee1,
            max(
                CASE
                    WHEN v_workbook_installment_balances.installment_no = 2 THEN v_workbook_installment_balances.final_late_fee
                    ELSE NULL::integer
                END) AS final_late_fee2,
            max(
                CASE
                    WHEN v_workbook_installment_balances.installment_no = 3 THEN v_workbook_installment_balances.final_late_fee
                    ELSE NULL::integer
                END) AS final_late_fee3,
            max(
                CASE
                    WHEN v_workbook_installment_balances.installment_no = 4 THEN v_workbook_installment_balances.final_late_fee
                    ELSE NULL::integer
                END) AS final_late_fee4,
            max(
                CASE
                    WHEN v_workbook_installment_balances.installment_no = 1 THEN GREATEST(v_workbook_installment_balances.base_charge - v_workbook_installment_balances.applied_amount - v_workbook_installment_balances.discount_closeout_amount, 0)
                    ELSE NULL::integer
                END) AS inst1_pending,
            max(
                CASE
                    WHEN v_workbook_installment_balances.installment_no = 2 THEN GREATEST(v_workbook_installment_balances.base_charge - v_workbook_installment_balances.applied_amount - v_workbook_installment_balances.discount_closeout_amount, 0)
                    ELSE NULL::integer
                END) AS inst2_pending,
            max(
                CASE
                    WHEN v_workbook_installment_balances.installment_no = 3 THEN GREATEST(v_workbook_installment_balances.base_charge - v_workbook_installment_balances.applied_amount - v_workbook_installment_balances.discount_closeout_amount, 0)
                    ELSE NULL::integer
                END) AS inst3_pending,
            max(
                CASE
                    WHEN v_workbook_installment_balances.installment_no = 4 THEN GREATEST(v_workbook_installment_balances.base_charge - v_workbook_installment_balances.applied_amount - v_workbook_installment_balances.discount_closeout_amount, 0)
                    ELSE NULL::integer
                END) AS inst4_pending
           FROM v_workbook_installment_balances
          GROUP BY v_workbook_installment_balances.student_id
        ), next_due AS (
         SELECT DISTINCT ON (v_workbook_installment_balances.student_id) v_workbook_installment_balances.student_id,
            v_workbook_installment_balances.due_date AS next_due_date,
            GREATEST(v_workbook_installment_balances.base_charge - v_workbook_installment_balances.applied_amount - v_workbook_installment_balances.discount_closeout_amount, 0) AS next_due_amount,
            v_workbook_installment_balances.installment_label AS next_due_label
           FROM v_workbook_installment_balances
          WHERE GREATEST(v_workbook_installment_balances.base_charge - v_workbook_installment_balances.applied_amount - v_workbook_installment_balances.discount_closeout_amount, 0) > 0
          ORDER BY v_workbook_installment_balances.student_id, v_workbook_installment_balances.due_date, v_workbook_installment_balances.installment_no
        ), last_payment AS (
         SELECT DISTINCT ON (receipts.student_id) receipts.student_id,
            receipts.payment_date AS last_payment_date,
            receipts.total_amount AS last_payment_amount
           FROM receipts
          ORDER BY receipts.student_id, receipts.payment_date DESC, receipts.created_at DESC
        )
 SELECT profile.student_id,
        CASE
            WHEN NULLIF(TRIM(BOTH FROM profile.admission_no), ''::text) IS NOT NULL THEN (profile.class_label || '|'::text) || profile.admission_no
            WHEN profile.date_of_birth IS NOT NULL THEN (((profile.class_label || '|'::text) || profile.student_name) || '|'::text) || to_char(profile.date_of_birth::timestamp with time zone, 'DDMMYYYY'::text)
            ELSE (profile.class_label || '|'::text) || profile.student_name
        END AS workbook_student_key,
    profile.admission_no,
    profile.student_name,
    profile.date_of_birth,
    profile.father_name,
    profile.mother_name,
    profile.father_phone,
    profile.mother_phone,
    profile.record_status,
    profile.class_id,
    profile.session_label,
    profile.class_name,
    profile.class_label,
    profile.sort_order,
    profile.transport_route_id,
    profile.transport_route_name,
    profile.transport_route_code,
    profile.student_status_code,
        CASE
            WHEN profile.student_status_code = 'new'::text THEN 'New'::text
            ELSE 'Old'::text
        END AS student_status_label,
    profile.tuition_fee,
    profile.transport_fee,
    profile.academic_fee,
    profile.other_adjustment_head,
    profile.other_adjustment_amount,
    profile.gross_base_before_discount,
    profile.discount_amount,
    profile.late_fee_waiver_amount,
    COALESCE(summary.base_charge_total::bigint, GREATEST(profile.gross_base_before_discount - profile.discount_amount, 0::bigint)) AS base_charge_total,
    COALESCE(summary.base_charge_total::bigint, GREATEST(profile.gross_base_before_discount - profile.discount_amount, 0::bigint)) AS base_total_due,
    COALESCE(summary.installment1_base, 0) AS installment1_base,
    COALESCE(summary.installment2_base, 0) AS installment2_base,
    COALESCE(summary.installment3_base, 0) AS installment3_base,
    COALESCE(summary.installment4_base, 0) AS installment4_base,
    COALESCE(summary.paid_installment1, 0) AS paid_installment1,
    COALESCE(summary.paid_installment2, 0) AS paid_installment2,
    COALESCE(summary.paid_installment3, 0) AS paid_installment3,
    COALESCE(summary.paid_installment4, 0) AS paid_installment4,
    COALESCE(summary.raw_late_fee1, 0) AS raw_late_fee1,
    COALESCE(summary.raw_late_fee2, 0) AS raw_late_fee2,
    COALESCE(summary.raw_late_fee3, 0) AS raw_late_fee3,
    COALESCE(summary.raw_late_fee4, 0) AS raw_late_fee4,
    COALESCE(summary.waiver_applied1, 0) AS waiver_applied1,
    COALESCE(summary.waiver_applied2, 0) AS waiver_applied2,
    COALESCE(summary.waiver_applied3, 0) AS waiver_applied3,
    COALESCE(summary.waiver_applied4, 0) AS waiver_applied4,
    COALESCE(summary.final_late_fee1, 0) AS final_late_fee1,
    COALESCE(summary.final_late_fee2, 0) AS final_late_fee2,
    COALESCE(summary.final_late_fee3, 0) AS final_late_fee3,
    COALESCE(summary.final_late_fee4, 0) AS final_late_fee4,
    COALESCE(summary.inst1_pending, 0) AS inst1_pending,
    COALESCE(summary.inst2_pending, 0) AS inst2_pending,
    COALESCE(summary.inst3_pending, 0) AS inst3_pending,
    COALESCE(summary.inst4_pending, 0) AS inst4_pending,
    COALESCE(summary.late_fee_total, 0) AS late_fee_total,
    COALESCE(summary.total_due::bigint, GREATEST(profile.gross_base_before_discount - profile.discount_amount, 0::bigint)) AS total_due,
    COALESCE(summary.total_paid, 0) AS total_paid,
    COALESCE(summary.total_discount_closeouts, 0) AS total_discount_closeouts,
    COALESCE(summary.outstanding_amount::bigint, GREATEST(profile.gross_base_before_discount - profile.discount_amount, 0::bigint)) AS outstanding_amount,
    COALESCE(summary.base_outstanding_amount::bigint, GREATEST(profile.gross_base_before_discount - profile.discount_amount, 0::bigint)) AS base_outstanding_amount,
    GREATEST(COALESCE(summary.outstanding_amount, 0) - COALESCE(summary.base_outstanding_amount, 0), 0) AS late_fee_outstanding_amount,
    next_due.next_due_date,
    next_due.next_due_amount,
    next_due.next_due_label,
    COALESCE(last_payment.last_payment_date, summary.last_payment_date) AS last_payment_date,
    COALESCE(last_payment.last_payment_amount, 0) AS last_payment_amount,
    COALESCE(summary.paid_installment_count, 0::bigint) AS paid_installment_count,
    COALESCE(summary.partly_paid_installment_count, 0::bigint) AS partly_paid_installment_count,
    COALESCE(summary.overdue_installment_count, 0::bigint) AS overdue_installment_count,
        CASE
            WHEN COALESCE(summary.total_due::bigint, GREATEST(profile.gross_base_before_discount - profile.discount_amount, 0::bigint)) <= 0 THEN ''::text
            WHEN COALESCE(summary.base_outstanding_amount::bigint, GREATEST(profile.gross_base_before_discount - profile.discount_amount, 0::bigint)) <= 0 THEN 'PAID'::text
            WHEN next_due.next_due_date IS NOT NULL AND CURRENT_DATE > next_due.next_due_date THEN 'OVERDUE'::text
            WHEN COALESCE(summary.total_paid, 0) <= 0 AND COALESCE(summary.total_discount_closeouts, 0) <= 0 THEN 'NOT STARTED'::text
            ELSE 'PARTLY PAID'::text
        END AS status_label,
        CASE
            WHEN NULLIF(TRIM(BOTH FROM profile.admission_no), ''::text) IS NOT NULL AND profile.admission_no_count > 1 THEN true
            ELSE false
        END AS duplicate_sr_flag,
        CASE
            WHEN profile.date_of_birth IS NULL THEN true
            ELSE false
        END AS missing_dob_flag,
        CASE
            WHEN NULLIF(TRIM(BOTH FROM profile.class_label), ''::text) IS NULL THEN true
            ELSE false
        END AS missing_class_flag,
        CASE
            WHEN NULLIF(TRIM(BOTH FROM profile.student_status_code), ''::text) IS NULL THEN true
            ELSE false
        END AS missing_status_flag,
    profile.override_reason
   FROM student_profile_enriched profile
     LEFT JOIN installment_summary summary ON summary.student_id = profile.student_id
     LEFT JOIN next_due ON next_due.student_id = profile.student_id
     LEFT JOIN last_payment ON last_payment.student_id = profile.student_id;

create unique index v_workbook_student_financials_idx on public.v_workbook_student_financials using btree (student_id);
create index idx_v_workbook_financials_session_status on public.v_workbook_student_financials using btree (session_label, record_status);

grant all on public.v_workbook_student_financials to anon, authenticated, service_role;

-- Recreated verbatim (dropped by CASCADE above).
create materialized view public.v_student_financial_state as
 WITH blocked_rows AS (
         SELECT config_change_blocked_installments.student_id,
            count(*)::integer AS rows_kept_for_review
           FROM config_change_blocked_installments
          GROUP BY config_change_blocked_installments.student_id
        ), financials AS (
         SELECT v_workbook_student_financials.student_id,
            COALESCE(v_workbook_student_financials.total_due, GREATEST(v_workbook_student_financials.gross_base_before_discount - v_workbook_student_financials.discount_amount, 0::bigint) + COALESCE(v_workbook_student_financials.late_fee_total, 0))::integer AS revised_total_due,
            COALESCE(v_workbook_student_financials.total_paid, 0) AS total_paid,
            COALESCE(v_workbook_student_financials.outstanding_amount, 0::bigint)::integer AS installment_pending_amount
           FROM v_workbook_student_financials
        )
 SELECT financials.student_id,
    financials.revised_total_due AS total_due,
    financials.total_paid,
    GREATEST(financials.revised_total_due - financials.total_paid, 0) AS pending_amount,
    GREATEST(financials.total_paid - financials.revised_total_due, 0) AS credit_balance,
    GREATEST(financials.total_paid - financials.revised_total_due, 0) AS overpaid_amount,
    GREATEST(financials.total_paid - financials.revised_total_due, 0) AS refundable_amount,
    COALESCE(blocked_rows.rows_kept_for_review, 0) AS rows_kept_for_review,
    financials.installment_pending_amount
   FROM financials
     LEFT JOIN blocked_rows ON blocked_rows.student_id = financials.student_id;

create unique index v_student_financial_state_idx on public.v_student_financial_state using btree (student_id);

grant all on public.v_student_financial_state to anon, authenticated, service_role;

-- Recreated verbatim (dropped by CASCADE above).
create view public.v_notion_student_fee_summary as
 WITH explicit_family AS (
         SELECT DISTINCT ON (member.student_id, member.academic_session_label) member.student_id,
            member.academic_session_label AS session_label,
            group_record.id AS family_group_id,
            group_record.family_label,
            group_record.guardian_phone
           FROM student_family_members member
             JOIN student_family_groups group_record ON group_record.id = member.family_group_id
          ORDER BY member.student_id, member.academic_session_label, group_record.updated_at DESC NULLS LAST, group_record.created_at DESC
        ), student_keys AS (
         SELECT financials.student_id,
            financials.workbook_student_key,
            financials.admission_no,
            financials.student_name,
            financials.date_of_birth,
            financials.father_name,
            financials.mother_name,
            financials.father_phone,
            financials.mother_phone,
            financials.record_status,
            financials.class_id,
            financials.session_label,
            financials.class_name,
            financials.class_label,
            financials.sort_order,
            financials.transport_route_id,
            financials.transport_route_name,
            financials.transport_route_code,
            financials.student_status_code,
            financials.student_status_label,
            financials.tuition_fee,
            financials.transport_fee,
            financials.academic_fee,
            financials.other_adjustment_head,
            financials.other_adjustment_amount,
            financials.gross_base_before_discount,
            financials.discount_amount,
            financials.late_fee_waiver_amount,
            financials.base_charge_total,
            financials.base_total_due,
            financials.installment1_base,
            financials.installment2_base,
            financials.installment3_base,
            financials.installment4_base,
            financials.paid_installment1,
            financials.paid_installment2,
            financials.paid_installment3,
            financials.paid_installment4,
            financials.raw_late_fee1,
            financials.raw_late_fee2,
            financials.raw_late_fee3,
            financials.raw_late_fee4,
            financials.waiver_applied1,
            financials.waiver_applied2,
            financials.waiver_applied3,
            financials.waiver_applied4,
            financials.final_late_fee1,
            financials.final_late_fee2,
            financials.final_late_fee3,
            financials.final_late_fee4,
            financials.inst1_pending,
            financials.inst2_pending,
            financials.inst3_pending,
            financials.inst4_pending,
            financials.late_fee_total,
            financials.total_due,
            financials.total_paid,
            financials.total_discount_closeouts,
            financials.outstanding_amount,
            financials.next_due_date,
            financials.next_due_amount,
            financials.next_due_label,
            financials.last_payment_date,
            financials.last_payment_amount,
            financials.paid_installment_count,
            financials.partly_paid_installment_count,
            financials.overdue_installment_count,
            financials.status_label,
            financials.duplicate_sr_flag,
            financials.missing_dob_flag,
            financials.missing_class_flag,
            financials.missing_status_flag,
            financials.override_reason,
            COALESCE(NULLIF(regexp_replace(financials.father_phone, '[^0-9]'::text, ''::text, 'g'::text), ''::text), NULLIF(regexp_replace(financials.mother_phone, '[^0-9]'::text, ''::text, 'g'::text), ''::text)) AS normalized_phone,
            explicit_family.family_group_id,
            explicit_family.family_label
           FROM v_workbook_student_financials financials
             LEFT JOIN explicit_family ON explicit_family.student_id = financials.student_id AND explicit_family.session_label = financials.session_label
        ), last_receipt AS (
         SELECT DISTINCT ON (receipt_row.student_id) receipt_row.student_id,
            receipt_row.payment_date AS last_payment_date,
            receipt_row.total_amount AS last_payment_amount,
            receipt_row.payment_mode::text AS last_payment_mode,
            receipt_row.receipt_number AS last_receipt_no
           FROM receipts receipt_row
          ORDER BY receipt_row.student_id, receipt_row.payment_date DESC, receipt_row.created_at DESC
        ), installment_rollup AS (
         SELECT balances.student_id,
            max(balances.due_date) FILTER (WHERE balances.installment_no = 1) AS inst1_due_date,
            max(balances.total_charge) FILTER (WHERE balances.installment_no = 1) AS inst1_due_amount,
            max(balances.paid_amount) FILTER (WHERE balances.installment_no = 1) AS inst1_paid_amount,
            max(
                CASE
                    WHEN balances.installment_no = 1 AND balances.pending_amount <= 0 THEN 'Paid'::text
                    WHEN balances.installment_no = 1 AND (balances.paid_amount > 0 OR balances.discount_closeout_amount > 0) THEN 'Partial'::text
                    WHEN balances.installment_no = 1 THEN 'Pending'::text
                    ELSE NULL::text
                END) AS inst1_status,
            max(balances.due_date) FILTER (WHERE balances.installment_no = 2) AS inst2_due_date,
            max(balances.total_charge) FILTER (WHERE balances.installment_no = 2) AS inst2_due_amount,
            max(balances.paid_amount) FILTER (WHERE balances.installment_no = 2) AS inst2_paid_amount,
            max(
                CASE
                    WHEN balances.installment_no = 2 AND balances.pending_amount <= 0 THEN 'Paid'::text
                    WHEN balances.installment_no = 2 AND (balances.paid_amount > 0 OR balances.discount_closeout_amount > 0) THEN 'Partial'::text
                    WHEN balances.installment_no = 2 THEN 'Pending'::text
                    ELSE NULL::text
                END) AS inst2_status,
            max(balances.due_date) FILTER (WHERE balances.installment_no = 3) AS inst3_due_date,
            max(balances.total_charge) FILTER (WHERE balances.installment_no = 3) AS inst3_due_amount,
            max(balances.paid_amount) FILTER (WHERE balances.installment_no = 3) AS inst3_paid_amount,
            max(
                CASE
                    WHEN balances.installment_no = 3 AND balances.pending_amount <= 0 THEN 'Paid'::text
                    WHEN balances.installment_no = 3 AND (balances.paid_amount > 0 OR balances.discount_closeout_amount > 0) THEN 'Partial'::text
                    WHEN balances.installment_no = 3 THEN 'Pending'::text
                    ELSE NULL::text
                END) AS inst3_status,
            max(balances.due_date) FILTER (WHERE balances.installment_no = 4) AS inst4_due_date,
            max(balances.total_charge) FILTER (WHERE balances.installment_no = 4) AS inst4_due_amount,
            max(balances.paid_amount) FILTER (WHERE balances.installment_no = 4) AS inst4_paid_amount,
            max(
                CASE
                    WHEN balances.installment_no = 4 AND balances.pending_amount <= 0 THEN 'Paid'::text
                    WHEN balances.installment_no = 4 AND (balances.paid_amount > 0 OR balances.discount_closeout_amount > 0) THEN 'Partial'::text
                    WHEN balances.installment_no = 4 THEN 'Pending'::text
                    ELSE NULL::text
                END) AS inst4_status
           FROM v_workbook_installment_balances balances
          GROUP BY balances.student_id
        )
 SELECT student_keys.student_id,
    student_keys.admission_no AS sr_no,
    student_keys.student_name,
    student_keys.class_label AS class,
    student_keys.session_label AS session,
    student_keys.father_name,
    student_keys.father_phone AS phone,
    COALESCE('family:'::text || student_keys.family_group_id::text,
        CASE
            WHEN student_keys.normalized_phone ~ '^[0-9]{10,}$'::text THEN 'phone:'::text || "right"(student_keys.normalized_phone, 10)
            ELSE 'fallback:'::text || md5((lower(COALESCE(student_keys.father_name, 'unknown'::text)) || '|'::text) || lower(COALESCE(student_keys.transport_route_name, student_keys.class_label, 'unknown'::text)))
        END) AS family_key,
    student_keys.transport_route_name AS transport_route,
    student_keys.student_status_label AS new_or_old,
    COALESCE(student_keys.base_total_due, student_keys.total_due, 0::bigint)::integer AS total_annual_fees_due,
    COALESCE(student_keys.total_paid, 0) AS total_paid_to_date,
    COALESCE(student_keys.outstanding_amount, 0::bigint)::integer AS total_pending,
    COALESCE(installment_rollup.inst1_due_amount, 0) AS inst1_due_amount,
    COALESCE(installment_rollup.inst1_paid_amount, 0) AS inst1_paid_amount,
    COALESCE(installment_rollup.inst1_status, 'Pending'::text) AS inst1_status,
    installment_rollup.inst1_due_date,
    COALESCE(installment_rollup.inst2_due_amount, 0) AS inst2_due_amount,
    COALESCE(installment_rollup.inst2_paid_amount, 0) AS inst2_paid_amount,
    COALESCE(installment_rollup.inst2_status, 'Pending'::text) AS inst2_status,
    installment_rollup.inst2_due_date,
    COALESCE(installment_rollup.inst3_due_amount, 0) AS inst3_due_amount,
    COALESCE(installment_rollup.inst3_paid_amount, 0) AS inst3_paid_amount,
    COALESCE(installment_rollup.inst3_status, 'Pending'::text) AS inst3_status,
    installment_rollup.inst3_due_date,
    COALESCE(installment_rollup.inst4_due_amount, 0) AS inst4_due_amount,
    COALESCE(installment_rollup.inst4_paid_amount, 0) AS inst4_paid_amount,
    COALESCE(installment_rollup.inst4_status, 'Pending'::text) AS inst4_status,
    installment_rollup.inst4_due_date,
    COALESCE(student_keys.late_fee_total, 0) > 0 AS late_fee_applied,
    last_receipt.last_payment_date,
    COALESCE(last_receipt.last_payment_amount, 0) AS last_payment_amount,
    last_receipt.last_payment_mode,
    last_receipt.last_receipt_no
   FROM student_keys
     LEFT JOIN installment_rollup ON installment_rollup.student_id = student_keys.student_id
     LEFT JOIN last_receipt ON last_receipt.student_id = student_keys.student_id
  WHERE student_keys.record_status = 'active'::student_status;

grant all on public.v_notion_student_fee_summary to anon, authenticated, service_role;
grant select on public.v_notion_student_fee_summary to notion_fee_sync_role;

-- Recreated verbatim from the live definitions: these two Notion sync views
-- depend on v_notion_student_fee_summary and were therefore dropped by the
-- DROP ... CASCADE above. They are unchanged — only v_workbook_student_financials
-- gains the base-outstanding columns/semantics. Restoring them keeps the Notion
-- daily-collection and family-fee sync intact.
create view public.v_notion_daily_collection_summary as
 WITH sessions AS (
         SELECT DISTINCT classes.session_label AS session
           FROM classes
        ), summary_dates AS (
         SELECT sessions.session,
            CURRENT_DATE AS summary_date
           FROM sessions
        UNION
         SELECT class_row.session_label AS session,
            receipt_row.payment_date AS summary_date
           FROM receipts receipt_row
             JOIN students student_row ON student_row.id = receipt_row.student_id
             JOIN classes class_row ON class_row.id = student_row.class_id
        ), receipt_facts AS (
         SELECT class_row.session_label AS session,
            receipt_row.payment_date,
            receipt_row.id AS receipt_id,
                CASE
                    WHEN receipt_row.payment_mode::text = 'discount'::text THEN 0
                    ELSE receipt_row.total_amount
                END AS collected_amount
           FROM receipts receipt_row
             JOIN students student_row ON student_row.id = receipt_row.student_id
             JOIN classes class_row ON class_row.id = student_row.class_id
        ), class_dues AS (
         SELECT student_summary.session,
            student_summary.class,
            COALESCE(sum(student_summary.total_pending), 0::bigint)::integer AS pending_amount
           FROM v_notion_student_fee_summary student_summary
          GROUP BY student_summary.session, student_summary.class
        ), class_dues_json AS (
         SELECT class_dues.session,
            jsonb_object_agg(class_dues.class, class_dues.pending_amount ORDER BY class_dues.class) AS dues_by_class
           FROM class_dues
          GROUP BY class_dues.session
        ), defaulters AS (
         SELECT balances.session_label AS session,
            count(DISTINCT balances.student_id)::integer AS defaulter_count
           FROM v_workbook_installment_balances balances
          WHERE balances.pending_amount > 0 AND balances.due_date < CURRENT_DATE
          GROUP BY balances.session_label
        )
 SELECT summary_dates.session,
    summary_dates.summary_date,
    COALESCE(sum(receipt_facts.collected_amount) FILTER (WHERE receipt_facts.payment_date = summary_dates.summary_date), 0::bigint)::integer AS total_collected_today,
    COALESCE(sum(receipt_facts.collected_amount) FILTER (WHERE receipt_facts.payment_date >= date_trunc('month'::text, summary_dates.summary_date::timestamp with time zone)::date AND receipt_facts.payment_date <= summary_dates.summary_date), 0::bigint)::integer AS collection_month_to_date,
    COALESCE(sum(receipt_facts.collected_amount) FILTER (WHERE receipt_facts.payment_date <= summary_dates.summary_date), 0::bigint)::integer AS collection_session_to_date,
    count(DISTINCT receipt_facts.receipt_id) FILTER (WHERE receipt_facts.payment_date = summary_dates.summary_date)::integer AS payments_count_today,
    COALESCE(defaulters.defaulter_count, 0) AS defaulter_count,
    COALESCE(class_dues_json.dues_by_class, '{}'::jsonb) AS dues_by_class
   FROM summary_dates
     LEFT JOIN receipt_facts ON receipt_facts.session = summary_dates.session
     LEFT JOIN class_dues_json ON class_dues_json.session = summary_dates.session
     LEFT JOIN defaulters ON defaulters.session = summary_dates.session
  GROUP BY summary_dates.session, summary_dates.summary_date, defaulters.defaulter_count, class_dues_json.dues_by_class;

grant all on public.v_notion_daily_collection_summary to anon, authenticated, service_role;
grant select on public.v_notion_daily_collection_summary to notion_fee_sync_role;

create view public.v_notion_family_fee_summary as
 SELECT session,
    family_key,
    count(*)::integer AS sibling_count,
    COALESCE(sum(total_annual_fees_due), 0::bigint)::integer AS family_total_due,
    COALESCE(sum(total_paid_to_date), 0::bigint)::integer AS family_total_paid,
    COALESCE(sum(total_pending), 0::bigint)::integer AS family_total_pending,
    string_agg(student_name, ', '::text ORDER BY class, student_name) AS student_names
   FROM v_notion_student_fee_summary student_summary
  GROUP BY session, family_key;

grant all on public.v_notion_family_fee_summary to anon, authenticated, service_role;
grant select on public.v_notion_family_fee_summary to notion_fee_sync_role;
