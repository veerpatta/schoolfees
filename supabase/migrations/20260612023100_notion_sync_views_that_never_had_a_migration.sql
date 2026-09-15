-- The two Notion projection views that no migration ever created.
--
-- 20260612023000_notion_fee_sync.sql creates three views: v_notion_student_fee_summary,
-- v_notion_daily_collection_summary and v_notion_family_fee_summary. Two more —
-- v_notion_student_fee_sync and v_notion_daily_summary — were created by hand in the
-- SQL editor and never written down. Production has them, so nothing noticed.
--
-- 20260718090711_harden_notion_and_financial_permissions.sql revokes on all five, and
-- 20260819120000_restore_view_hardening_lost_to_cascade.sql alters all five. Replaying
-- the history onto an empty database therefore died at the first of those, with
--
--   ERROR: relation "public.v_notion_student_fee_sync" does not exist (SQLSTATE 42P01)
--
-- which made "rebuild the schema from supabase/migrations/" a recovery path that did
-- not work. Found by the School One Phase 0 dev-project bootstrap (P0.2) — the first
-- time anybody had built this schema from nothing.
--
-- The definitions below are copied verbatim from supabase/schema.sql, the snapshot
-- taken from production on 2026-08-09. They read public.v_installment_balances, whose
-- shape is settled by 20260422213000 and never redefined afterwards, so they compile
-- at this point in the history as well as at the end of it.
--
-- Timestamped to sit immediately after the migration that creates their three siblings:
-- late enough that every dependency exists, early enough to precede both migrations
-- that reference them. Because that is before the last version applied on production,
-- a plain "supabase db push" skips this file there — which is correct, since production
-- is where these views already live, and create-or-replace makes it a no-op regardless.
-- The dev bootstrap passes --include-all precisely so a from-scratch build does not
-- skip it.
--
-- Additive only. No fee table, RPC, trigger or policy is touched.

-- public.v_notion_daily_summary
create or replace view public.v_notion_daily_summary as
 SELECT session_label,
    count(DISTINCT student_id) AS total_students,
    sum(amount_due) AS total_due,
    sum(payments_total) AS total_paid,
    sum(outstanding_amount) AS total_pending,
    count(DISTINCT student_id) FILTER (WHERE balance_status = 'overdue'::text) AS defaulter_count,
    ( SELECT COALESCE(sum(p.amount), 0::bigint) AS "coalesce"
           FROM public.payments p
             JOIN public.installments i ON i.id = p.installment_id
          WHERE p.created_at::date = CURRENT_DATE) AS collected_today,
    now() AS computed_at
   FROM public.v_installment_balances b
  GROUP BY session_label;

-- public.v_notion_student_fee_sync
create or replace view public.v_notion_student_fee_sync as
 WITH bal AS (
         SELECT v_installment_balances.installment_id,
            v_installment_balances.student_id,
            v_installment_balances.admission_no,
            v_installment_balances.full_name,
            v_installment_balances.session_label,
            v_installment_balances.class_name,
            v_installment_balances.section,
            v_installment_balances.stream_name,
            v_installment_balances.installment_no,
            v_installment_balances.installment_label,
            v_installment_balances.due_date,
            v_installment_balances.installment_status,
            v_installment_balances.amount_due,
            v_installment_balances.payments_total,
            v_installment_balances.adjustments_total,
            v_installment_balances.outstanding_amount,
            v_installment_balances.balance_status,
            v_installment_balances.transport_route_id,
            v_installment_balances.transport_route_name,
            v_installment_balances.transport_route_code
           FROM public.v_installment_balances
        ), student_rollup AS (
         SELECT b.student_id,
            b.admission_no,
            b.full_name,
            b.session_label,
            b.class_name,
            b.section,
            b.stream_name,
            sum(b.amount_due) AS total_due,
            sum(b.payments_total) AS total_paid,
            sum(b.adjustments_total) AS total_adjustments,
            sum(b.outstanding_amount) AS total_pending,
            count(*) FILTER (WHERE b.outstanding_amount > 0) AS open_installments,
            count(*) FILTER (WHERE b.balance_status = 'overdue'::text) AS overdue_installments,
            jsonb_agg(jsonb_build_object('no', b.installment_no, 'label', b.installment_label, 'due_date', b.due_date, 'due', b.amount_due, 'paid', b.payments_total, 'pending', b.outstanding_amount, 'status', b.balance_status) ORDER BY b.installment_no) AS installments
           FROM bal b
          GROUP BY b.student_id, b.admission_no, b.full_name, b.session_label, b.class_name, b.section, b.stream_name
        ), last_pay AS (
         SELECT p.student_id,
            max(p.created_at) AS last_payment_at
           FROM public.payments p
          GROUP BY p.student_id
        ), last_pay_amt AS (
         SELECT DISTINCT ON (p.student_id) p.student_id,
            p.created_at AS last_payment_at,
            p.amount AS last_payment_amount
           FROM public.payments p
          ORDER BY p.student_id, p.created_at DESC
        ), fam AS (
         SELECT sfm.student_id,
            sfm.academic_session_label,
            sfg.family_label,
            sfg.guardian_name,
            sfg.guardian_phone,
            sfg.id AS family_group_id
           FROM public.student_family_members sfm
             JOIN public.student_family_groups sfg ON sfg.id = sfm.family_group_id
        )
 SELECT sr.student_id,
    sr.admission_no,
    sr.full_name,
    sr.session_label,
    sr.class_name,
    sr.section,
    sr.stream_name,
    sr.total_due,
    sr.total_paid,
    sr.total_adjustments,
    sr.total_pending,
    sr.open_installments,
    sr.overdue_installments,
    sr.installments,
    s.father_name,
    s.primary_phone,
    s.status AS student_status,
    lpa.last_payment_at,
    lpa.last_payment_amount,
    f.family_label,
    f.guardian_name,
    f.guardian_phone,
    f.family_group_id,
    sr.overdue_installments > 0 AS is_defaulter
   FROM student_rollup sr
     JOIN public.students s ON s.id = sr.student_id
     LEFT JOIN last_pay_amt lpa ON lpa.student_id = sr.student_id
     LEFT JOIN fam f ON f.student_id = sr.student_id AND f.academic_session_label = sr.session_label;
