-- Phase 2 (perf) — index hygiene + audit_logs read path.
--
-- Safe DB subset of the perf pass: the inline materialized-view refresh path
-- (hardened in 20260530073353_refresh_backstop_on_skip) is deliberately left
-- untouched. This migration only:
--   1. Adds a (table_name, created_at DESC) index on audit_logs to back the
--      fee-setup time-travel query (the one measured slowdown: 855 ms).
--   2. Drops three provably-redundant indexes whose coverage is fully retained
--      by another, actively-used index (write-amplification hygiene).
--   3. Does NOT add covering indexes for the cold unindexed FKs — see section 3
--      (PERFORMANCE_PLAN: "no mass index-adding"; no evidence it helps here).
--
-- All DDL is plain (non-CONCURRENT): every affected table is small (audit_logs
-- ~21k rows, the rest far smaller), so index build/drop takes a sub-second lock
-- at deploy time. No data is read or written; payment/receipt rows are untouched.

-- ---------------------------------------------------------------------------
-- 1. audit_logs time-travel read path
--
-- loadAuditTrailUpTo() (lib/fees/time-travel.ts) runs:
--   WHERE table_name = $1 AND created_at <= $2 ORDER BY created_at DESC LIMIT 4000
-- The existing idx_audit_logs_record is (table_name, record_id, created_at DESC):
-- record_id sits between table_name and created_at, so this query cannot use it
-- for an ordered range scan and instead seq-scans + sorts on disk (~855 ms for
-- table_name='installments' on prod). A (table_name, created_at DESC) index
-- supports the seek + ordered walk directly.
-- ---------------------------------------------------------------------------
create index if not exists idx_audit_logs_table_created
  on public.audit_logs using btree (table_name, created_at desc);

-- ---------------------------------------------------------------------------
-- 2. Drop redundant indexes (0 scans over 23 days of live traffic; coverage
--    retained by the noted index). None backs a constraint.
-- ---------------------------------------------------------------------------
-- (installment_id, created_at DESC) — installment_id lookups/FK covered by
-- idx_payments_installment_student (installment_id, student_id), heavily used.
drop index if exists public.idx_payments_installment;

-- (payment_id, created_at DESC) — payment_id lookups/FK covered by
-- idx_payment_adjustments_payment_student_installment (payment_id, student_id, installment_id).
drop index if exists public.idx_payment_adjustments_payment;

-- (student_id, payment_date DESC) — strict prefix of
-- idx_receipts_student_payment_date_created_at (student_id, payment_date DESC, created_at DESC).
drop index if exists public.idx_receipts_student_payment_date;

-- NOTE: idx_receipts_duplicate_guard_lookup is also redundant — it is an exact
-- column-set twin of idx_receipts_duplicate_check (only the trailing created_at
-- sort direction differs) and has 0 scans, while duplicate_check has ~15.7k.
-- It is intentionally LEFT IN PLACE here because performance-guardrails.test.ts
-- enshrines it as a documented office-filter index; removing it is a separate,
-- team-reviewed decision rather than part of this safe perf pass.

-- ---------------------------------------------------------------------------
-- 3. Unindexed foreign keys — intentionally NOT indexed here.
--
-- The Supabase performance advisor flags 46 unindexed FKs, but every one is on
-- a COLD config/log table (academic_sessions, collection_closures,
-- config_change_*, conventional_discount_policies, family_payments,
-- import_*, ledger_regeneration_*, promotion_*, refund_requests,
-- session_reconcile_log, student_collection_flags, whatsapp_templates, …) or
-- the test.* isolation schema. None is on the hot write path
-- (payments / receipts / installments / payment_adjustments) — those FKs are
-- already covered.
--
-- PERFORMANCE_PLAN_2026-05-31.md ("What I deliberately did not recommend")
-- is explicit: "No mass index-adding — the dataset is too small to benefit and
-- it would slow writes." At 560 students these audit-column FKs would add write
-- amplification (every insert/update maintains another index) for no measurable
-- read benefit, and there's no evidence such an index helps — so per the
-- "no change ships without evidence it helped" rule, they are left unindexed.
-- (Parent-side user deletes are rare and scan tiny tables.)
-- ---------------------------------------------------------------------------
