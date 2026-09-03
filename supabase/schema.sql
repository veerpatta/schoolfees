-- Shri Veer Patta Senior Secondary School — fee management schema
--
-- GENERATED ARTIFACT. Do not hand-edit, and do not treat it as the source of
-- truth — `supabase/migrations/` is. This is a readable snapshot of what those
-- migrations add up to, for reading and for grepping.
--
-- Regenerate with:  node scripts/generate-schema-snapshot.mjs
--
-- Built by introspecting pg_catalog, NOT by pg_dump: `supabase db dump` needs
-- Docker, and on a machine without it that command truncates its own target
-- file to zero bytes. Every object definition below is the server's own text,
-- so it is exact. Objects are grouped by kind and views are emitted in
-- dependency order; this has NOT been verified to replay top-to-bottom into an
-- empty database, and `supabase db push` is the supported way to build one.
--
-- Schema version: 20260903131911
-- Objects: 88 tables/views, 60 functions


-- ══ Extensions ══════════════════════════════════════════════════════════

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_stat_statements with schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists supabase_vault with schema vault;
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists wrappers with schema extensions;

-- ══ Schemas ═════════════════════════════════════════════════════════════

create schema if not exists private;

-- ══ Types ═══════════════════════════════════════════════════════════════

create type public.adjustment_type as enum ('reversal', 'correction', 'discount', 'writeoff');
create type public.audit_action as enum ('insert', 'update', 'delete');
create type public.cash_deposit_status as enum ('pending', 'deposited', 'carried_forward', 'not_applicable');
create type public.class_status as enum ('active', 'inactive', 'archived');
create type public.collection_close_status as enum ('draft', 'pending_approval', 'closed', 'reopened');
create type public.correction_review_status as enum ('reviewed', 'flagged', 'needs_followup');
create type public.installment_status as enum ('scheduled', 'waived', 'cancelled');
create type public.payment_mode as enum ('cash', 'upi', 'bank_transfer', 'cheque', 'discount');
create type public.reconciliation_status as enum ('pending', 'in_review', 'cleared', 'issue_found');
create type public.refund_request_status as enum ('pending_approval', 'approved', 'processed', 'rejected');
create type public.staff_role as enum ('admin', 'accountant', 'view_only', 'teacher', 'fee_collector');
create type public.student_status as enum ('active', 'inactive', 'left', 'graduated');

-- ══ Tables ══════════════════════════════════════════════════════════════

-- private.vpps_direct_import_backups
create table if not exists private.vpps_direct_import_backups (
  id uuid default gen_random_uuid() not null,
  backup_label text not null,
  created_at timestamp with time zone default now() not null,
  table_counts jsonb not null,
  checksum_summary jsonb not null,
  snapshot jsonb not null
);

-- private.vpps_direct_import_stage_dues
create table if not exists private.vpps_direct_import_stage_dues (
  import_name text not null,
  source_key text not null,
  payload jsonb not null,
  created_at timestamp with time zone default now() not null
);

-- private.vpps_direct_import_stage_skipped
create table if not exists private.vpps_direct_import_stage_skipped (
  import_name text not null,
  source text not null,
  source_row_number integer not null,
  status text not null,
  payload jsonb not null,
  created_at timestamp with time zone default now() not null
);

-- private.vpps_direct_import_stage_students
create table if not exists private.vpps_direct_import_stage_students (
  import_name text not null,
  source_key text not null,
  payload jsonb not null,
  created_at timestamp with time zone default now() not null
);

-- private.vpps_student_source_mapping
create table if not exists private.vpps_student_source_mapping (
  source_student_uid text not null,
  import_name text not null,
  student_id uuid not null,
  workbook_filename text,
  matched_via text not null,
  notes text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

-- public.academic_sessions
create table if not exists public.academic_sessions (
  id uuid default gen_random_uuid() not null,
  session_label text not null,
  status public.class_status default 'active'::public.class_status not null,
  is_current boolean default false not null,
  notes text,
  created_by uuid,
  updated_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

-- public.app_settings
create table if not exists public.app_settings (
  key text not null,
  value text not null,
  updated_at timestamp with time zone default now() not null
);

-- public.audit_logs
create table if not exists public.audit_logs (
  id uuid default gen_random_uuid() not null,
  table_name text not null,
  record_id uuid not null,
  action public.audit_action not null,
  before_data jsonb,
  after_data jsonb,
  changed_by uuid,
  created_at timestamp with time zone default now() not null
);

-- public.classes
create table if not exists public.classes (
  id uuid default gen_random_uuid() not null,
  session_label text not null,
  class_name text not null,
  section text,
  stream_name text,
  sort_order integer default 0 not null,
  status public.class_status default 'active'::public.class_status not null,
  notes text,
  created_by uuid,
  updated_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

-- public.collection_closures
create table if not exists public.collection_closures (
  id uuid default gen_random_uuid() not null,
  payment_date date not null,
  status public.collection_close_status default 'draft'::public.collection_close_status not null,
  cash_deposit_status public.cash_deposit_status default 'pending'::public.cash_deposit_status not null,
  reconciliation_status public.reconciliation_status default 'pending'::public.reconciliation_status not null,
  bank_deposit_reference text,
  close_note text,
  summary_snapshot jsonb default '{}'::jsonb not null,
  approved_at timestamp with time zone,
  approved_by uuid,
  closed_at timestamp with time zone,
  closed_by uuid,
  created_by uuid,
  updated_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

-- public.config_change_batches
create table if not exists public.config_change_batches (
  id uuid default gen_random_uuid() not null,
  change_scope text not null,
  target_ref text,
  target_label text not null,
  status text default 'preview_ready'::text not null,
  before_payload jsonb default '{}'::jsonb not null,
  proposed_payload jsonb default '{}'::jsonb not null,
  changed_fields jsonb default '[]'::jsonb not null,
  preview_summary jsonb default '{}'::jsonb not null,
  apply_summary jsonb,
  apply_notes text,
  previewed_at timestamp with time zone default now() not null,
  applied_at timestamp with time zone,
  created_by uuid,
  updated_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

-- public.config_change_blocked_installments
create table if not exists public.config_change_blocked_installments (
  id uuid default gen_random_uuid() not null,
  batch_id uuid not null,
  student_id uuid not null,
  installment_id uuid not null,
  installment_label text not null,
  due_date date not null,
  amount_due integer default 0 not null,
  paid_amount integer default 0 not null,
  adjustment_amount integer default 0 not null,
  outstanding_amount integer default 0 not null,
  reason_code text not null,
  reason_label text not null,
  action_needed text not null,
  review_status text default 'pending'::text not null,
  review_notes text,
  created_by uuid,
  updated_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

-- public.conventional_discount_policies
create table if not exists public.conventional_discount_policies (
  id uuid default gen_random_uuid() not null,
  academic_session_label text not null,
  code text not null,
  display_name text not null,
  calculation_type text not null,
  fixed_tuition_amount integer,
  percentage numeric(5,2),
  is_active boolean default true not null,
  sort_order integer default 100 not null,
  created_by uuid,
  updated_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  is_builtin boolean default false not null
);

-- public.defaulter_contacts
create table if not exists public.defaulter_contacts (
  id uuid default gen_random_uuid() not null,
  student_id uuid not null,
  session_label text not null,
  contacted_at timestamp with time zone default now() not null,
  contacted_by uuid,
  channel text not null,
  outcome text not null,
  snooze_until date,
  note text,
  created_at timestamp with time zone default now() not null,
  voice_note_path text,
  contacted_phone text,
  phone_label text
);

-- public.defaulter_recovery_state
create table if not exists public.defaulter_recovery_state (
  id uuid default gen_random_uuid() not null,
  student_id uuid not null,
  session_label text not null,
  family_group_id uuid,
  recovery_stage text default 'standard'::text not null,
  promise_resolved_outcome text,
  promise_resolved_at timestamp with time zone,
  last_resolved_contact_id uuid,
  promise_kept_count integer default 0 not null,
  promise_broken_count integer default 0 not null,
  created_by uuid,
  updated_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

-- public.family_payments
create table if not exists public.family_payments (
  id uuid default gen_random_uuid() not null,
  family_group_id uuid not null,
  academic_session_label text not null,
  payment_date date not null,
  total_amount integer not null,
  received_by text,
  notes text,
  posted_by uuid,
  posted_at timestamp with time zone default now() not null,
  client_request_id text not null
);

-- public.fee_policy_configs
create table if not exists public.fee_policy_configs (
  id uuid default gen_random_uuid() not null,
  academic_session_label text not null,
  installment_schedule jsonb default '[]'::jsonb not null,
  late_fee_flat_amount integer default 1000 not null,
  custom_fee_heads jsonb default '[]'::jsonb not null,
  accepted_payment_modes public.payment_mode[] default ARRAY['cash'::public.payment_mode, 'upi'::public.payment_mode, 'bank_transfer'::public.payment_mode, 'cheque'::public.payment_mode] not null,
  receipt_prefix text default 'SVP'::text not null,
  notes text,
  is_active boolean default true not null,
  created_by uuid,
  updated_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  calculation_model text default 'standard'::text not null,
  new_student_academic_fee_amount integer default 1100 not null,
  old_student_academic_fee_amount integer default 500 not null,
  academic_fee_distribution text default 'first_only'::text not null
);

-- public.fee_settings
create table if not exists public.fee_settings (
  id uuid default gen_random_uuid() not null,
  class_id uuid not null,
  annual_base_amount integer not null,
  late_fee_flat_amount integer default 1000 not null,
  installment_count integer default 4 not null,
  is_active boolean default true not null,
  notes text,
  created_by uuid,
  updated_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  tuition_fee_amount integer default 0 not null,
  transport_fee_amount integer default 0 not null,
  books_fee_amount integer default 0 not null,
  admission_activity_misc_fee_amount integer default 0 not null,
  other_fee_heads jsonb default '{}'::jsonb not null,
  student_type_default text default 'existing'::text not null,
  transport_applies_default boolean default false not null
);

-- public.import_batches
create table if not exists public.import_batches (
  id uuid default gen_random_uuid() not null,
  filename text not null,
  source_format text not null,
  worksheet_name text,
  file_size_bytes integer default 0 not null,
  status text default 'uploaded'::text not null,
  detected_headers jsonb default '[]'::jsonb not null,
  column_mapping jsonb default '{}'::jsonb not null,
  total_rows integer default 0 not null,
  valid_rows integer default 0 not null,
  invalid_rows integer default 0 not null,
  duplicate_rows integer default 0 not null,
  imported_rows integer default 0 not null,
  skipped_rows integer default 0 not null,
  failed_rows integer default 0 not null,
  summary jsonb default '{}'::jsonb not null,
  validation_completed_at timestamp with time zone,
  import_completed_at timestamp with time zone,
  error_message text,
  created_by uuid,
  updated_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  import_mode text default 'add'::text not null,
  target_session_label text
);

-- public.import_rows
create table if not exists public.import_rows (
  id uuid default gen_random_uuid() not null,
  batch_id uuid not null,
  row_index integer not null,
  raw_payload jsonb not null,
  normalized_payload jsonb,
  status text default 'pending'::text not null,
  errors jsonb default '[]'::jsonb not null,
  warnings jsonb default '[]'::jsonb not null,
  duplicate_student_id uuid,
  imported_student_id uuid,
  imported_override_id uuid,
  created_by uuid,
  updated_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  review_status text default 'pending'::text not null,
  review_note text,
  reviewed_at timestamp with time zone,
  anomaly_categories jsonb default '[]'::jsonb not null,
  import_operation text default 'create'::text not null,
  target_student_id uuid,
  changed_fields jsonb default '[]'::jsonb not null,
  duplicate_audit_decision text,
  duplicate_audit_target_student_id uuid
);

-- public.installments
create table if not exists public.installments (
  id uuid default gen_random_uuid() not null,
  student_id uuid not null,
  class_id uuid not null,
  fee_setting_id uuid not null,
  student_fee_override_id uuid,
  installment_no smallint not null,
  installment_label text not null,
  due_date date not null,
  base_amount integer default 0 not null,
  transport_amount integer default 0 not null,
  discount_amount integer default 0 not null,
  amount_due integer generated always as (((base_amount + transport_amount) - discount_amount)) stored,
  late_fee_flat_amount integer default 1000 not null,
  status public.installment_status default 'scheduled'::public.installment_status not null,
  notes text,
  created_by uuid,
  updated_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  is_carry_forward boolean default false not null,
  carry_forward_balance_id uuid,
  source_session_label text,
  target_session_label text,
  carry_forward_fee_head text,
  is_emi_late_fee boolean default false not null
);

-- public.late_fee_rule_change_snapshot
create table if not exists public.late_fee_rule_change_snapshot (
  installment_id uuid not null,
  student_id uuid not null,
  session_label text not null,
  installment_no smallint,
  due_date date,
  base_charge integer not null,
  applied_amount integer not null,
  raw_late_fee integer not null,
  waiver_applied integer not null,
  final_late_fee integer not null,
  pending_amount integer not null,
  captured_at timestamp with time zone default now() not null
);

-- public.late_fee_waiver_pool_snapshot
create table if not exists public.late_fee_waiver_pool_snapshot (
  student_id uuid not null,
  pool_amount integer not null,
  override_reason text,
  override_updated_at timestamp with time zone,
  captured_at timestamp with time zone default now() not null
);

-- public.ledger_regeneration_batches
create table if not exists public.ledger_regeneration_batches (
  id uuid default gen_random_uuid() not null,
  policy_revision_id uuid,
  policy_revision_label text not null,
  reason text not null,
  status text default 'preview_ready'::text not null,
  source_snapshot jsonb default '{}'::jsonb not null,
  preview_summary jsonb default '{}'::jsonb not null,
  apply_summary jsonb,
  apply_notes text,
  previewed_at timestamp with time zone default now() not null,
  applied_at timestamp with time zone,
  created_by uuid,
  updated_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

-- public.ledger_regeneration_rows
create table if not exists public.ledger_regeneration_rows (
  id uuid default gen_random_uuid() not null,
  batch_id uuid not null,
  student_id uuid not null,
  installment_id uuid,
  class_id uuid not null,
  fee_setting_id uuid not null,
  student_fee_override_id uuid,
  student_label text not null,
  class_label text not null,
  installment_no smallint not null,
  installment_label text not null,
  due_date date not null,
  base_amount integer default 0 not null,
  transport_amount integer default 0 not null,
  discount_amount integer default 0 not null,
  late_fee_flat_amount integer default 0 not null,
  amount_due integer default 0 not null,
  paid_amount integer default 0 not null,
  adjustment_amount integer default 0 not null,
  outstanding_amount integer default 0 not null,
  balance_status text not null,
  action_needed text not null,
  reason_code text not null,
  reason_label text not null,
  review_status text default 'pending'::text not null,
  review_notes text,
  created_by uuid,
  updated_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

-- public.notion_sync_log
create table if not exists public.notion_sync_log (
  id uuid default gen_random_uuid() not null,
  run_started_at timestamp with time zone default now() not null,
  run_finished_at timestamp with time zone,
  session_label text,
  mode text default 'full'::text not null,
  students_synced integer default 0,
  summary_synced boolean default false,
  status text default 'running'::text not null,
  error_detail text,
  triggered_by text default 'cron'::text,
  families_synced integer default 0,
  daily_summaries_synced integer default 0,
  tracker_rows_synced integer default 0,
  errors_count integer default 0,
  dry_run boolean default false,
  created_at timestamp with time zone default now()
);

-- public.office_sync_events
create table if not exists public.office_sync_events (
  id uuid default gen_random_uuid() not null,
  session_label text not null,
  entity_type text not null,
  entity_id text,
  action text not null,
  affected_student_ids uuid[] default '{}'::uuid[] not null,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  created_by uuid default auth.uid()
);

-- public.payment_adjustment_reviews
create table if not exists public.payment_adjustment_reviews (
  id uuid default gen_random_uuid() not null,
  payment_adjustment_id uuid not null,
  review_status public.correction_review_status not null,
  review_note text,
  created_by uuid,
  created_at timestamp with time zone default now() not null
);

-- public.payment_adjustments
create table if not exists public.payment_adjustments (
  id uuid default gen_random_uuid() not null,
  payment_id uuid not null,
  student_id uuid not null,
  installment_id uuid not null,
  adjustment_type public.adjustment_type not null,
  amount_delta integer not null,
  reason text not null,
  notes text,
  created_by uuid,
  created_at timestamp with time zone default now() not null
);

-- public.payment_import_batches
create table if not exists public.payment_import_batches (
  id uuid default gen_random_uuid() not null,
  session_label text not null,
  file_name text not null,
  source_format text not null,
  status text default 'uploaded'::text not null,
  total_rows integer default 0 not null,
  valid_rows integer default 0 not null,
  warning_rows integer default 0 not null,
  error_rows integer default 0 not null,
  posted_rows integer default 0 not null,
  created_by uuid default auth.uid(),
  created_at timestamp with time zone default now() not null
);

-- public.payment_import_rows
create table if not exists public.payment_import_rows (
  id uuid default gen_random_uuid() not null,
  batch_id uuid not null,
  row_number integer not null,
  raw_payload jsonb not null,
  admission_no text,
  student_id uuid,
  student_name text,
  payment_date date,
  payment_mode public.payment_mode,
  amount integer,
  remarks text,
  validation_status text default 'pending'::text not null,
  validation_messages jsonb default '[]'::jsonb not null,
  duplicate_acknowledged boolean default false not null,
  client_request_id uuid default gen_random_uuid() not null,
  receipt_id uuid,
  receipt_number text,
  posted_at timestamp with time zone,
  post_error text,
  created_at timestamp with time zone default now() not null,
  intra_file_duplicate boolean default false not null,
  existing_receipt_duplicate boolean default false not null
);

-- public.payments
create table if not exists public.payments (
  id uuid default gen_random_uuid() not null,
  receipt_id uuid not null,
  student_id uuid not null,
  installment_id uuid not null,
  amount integer not null,
  notes text,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  family_payment_id uuid,
  discount_applied_at_posting integer default 0 not null,
  waiver_applied_at_posting integer default 0 not null,
  pending_before_posting integer,
  pending_after_posting integer
);

-- public.prev_year_import_batches
create table if not exists public.prev_year_import_batches (
  id uuid default gen_random_uuid() not null,
  session_label text not null,
  file_name text not null,
  file_sha256 text not null,
  source_sheet text,
  candidate_row_count integer default 0 not null,
  confirmed_row_count integer default 0 not null,
  confirmed_subtotal integer default 0 not null,
  applied_row_count integer default 0 not null,
  applied_subtotal integer default 0 not null,
  status text default 'dry_run'::text not null,
  dry_run_summary jsonb default '{}'::jsonb not null,
  apply_summary jsonb,
  apply_notes text,
  applied_at timestamp with time zone,
  created_by uuid,
  updated_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

-- public.prev_year_import_rows
create table if not exists public.prev_year_import_rows (
  id uuid default gen_random_uuid() not null,
  batch_id uuid not null,
  row_index integer not null,
  raw_row jsonb default '{}'::jsonb not null,
  source_admission_no text,
  source_name text,
  prev_year_due integer,
  owner_decision text default 'pending'::text not null,
  match_method text default 'unmatched'::text not null,
  matched_student_id uuid,
  matched_admission_no text,
  applied_installment_id uuid,
  applied_amount integer,
  skip_reason text,
  status text default 'pending'::text not null,
  notes text,
  created_by uuid,
  updated_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

-- public.promotion_run_entries
create table if not exists public.promotion_run_entries (
  id uuid default gen_random_uuid() not null,
  run_id uuid not null,
  student_id uuid not null,
  previous_class_id uuid,
  new_class_id uuid,
  previous_status public.student_status,
  new_status public.student_status,
  credit_balance integer default 0 not null,
  opening_credit_amount integer default 0 not null,
  applied boolean default false not null,
  decision text default 'pending'::text not null,
  reason text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

-- public.promotion_runs
create table if not exists public.promotion_runs (
  id uuid default gen_random_uuid() not null,
  source_session_label text not null,
  target_session_label text not null,
  status text default 'preview'::text not null,
  triggered_by uuid,
  triggered_at timestamp with time zone default now() not null,
  applied_at timestamp with time zone,
  rolled_back_at timestamp with time zone,
  preview_count integer default 0 not null,
  applied_count integer default 0 not null,
  graduated_count integer default 0 not null,
  credit_carry_forward_count integer default 0 not null,
  credit_carry_forward_total integer default 0 not null,
  notes text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

-- public.receipt_adjustments
create table if not exists public.receipt_adjustments (
  id uuid default gen_random_uuid() not null,
  receipt_id uuid not null,
  student_id uuid not null,
  installment_id uuid not null,
  adjustment_type public.adjustment_type not null,
  amount_delta integer not null,
  reason text not null,
  notes text,
  created_by uuid,
  created_at timestamp with time zone default now() not null
);

-- public.receipt_finance_adjustments
create table if not exists public.receipt_finance_adjustments (
  id uuid default gen_random_uuid() not null,
  receipt_id uuid not null,
  student_id uuid not null,
  quick_discount_amount integer default 0 not null,
  quick_late_fee_waiver_amount integer default 0 not null,
  created_by uuid,
  created_at timestamp with time zone default now() not null
);

-- public.receipts
create table if not exists public.receipts (
  id uuid default gen_random_uuid() not null,
  receipt_number text not null,
  student_id uuid not null,
  payment_date date default CURRENT_DATE not null,
  payment_mode public.payment_mode not null,
  total_amount integer not null,
  reference_number text,
  notes text,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  received_by text,
  client_request_id uuid,
  family_payment_id uuid
);

-- public.refund_requests
create table if not exists public.refund_requests (
  id uuid default gen_random_uuid() not null,
  refund_date date default CURRENT_DATE not null,
  receipt_id uuid not null,
  student_id uuid not null,
  requested_amount integer not null,
  refund_method public.payment_mode not null,
  refund_reference text,
  reason text not null,
  notes text,
  status public.refund_request_status default 'pending_approval'::public.refund_request_status not null,
  approval_note text,
  processing_note text,
  approved_at timestamp with time zone,
  approved_by uuid,
  processed_at timestamp with time zone,
  processed_by uuid,
  created_by uuid,
  updated_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

-- public.school_fee_defaults
create table if not exists public.school_fee_defaults (
  id uuid default gen_random_uuid() not null,
  tuition_fee_amount integer default 0 not null,
  transport_fee_amount integer default 0 not null,
  books_fee_amount integer default 0 not null,
  admission_activity_misc_fee_amount integer default 0 not null,
  other_fee_heads jsonb default '{}'::jsonb not null,
  late_fee_flat_amount integer default 1000 not null,
  installment_count integer default 4 not null,
  installment_due_dates text[] default ARRAY['20 April'::text, '20 July'::text, '20 October'::text, '20 January'::text] not null,
  student_type_default text default 'existing'::text not null,
  transport_applies_default boolean default false not null,
  notes text,
  is_active boolean default true not null,
  created_by uuid,
  updated_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

-- public.session_reconcile_log
create table if not exists public.session_reconcile_log (
  id uuid default gen_random_uuid() not null,
  session_label text not null,
  started_at timestamp with time zone default now() not null,
  finished_at timestamp with time zone,
  prepared_count integer default 0 not null,
  updated_count integer default 0 not null,
  locked_count integer default 0 not null,
  attention_count integer default 0 not null,
  error_message text,
  run_by uuid
);

-- public.setup_progress
create table if not exists public.setup_progress (
  id uuid default gen_random_uuid() not null,
  setup_completed_at timestamp with time zone,
  completion_notes text,
  is_active boolean default true not null,
  created_by uuid,
  updated_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

-- public.student_carry_forward_balances
create table if not exists public.student_carry_forward_balances (
  id uuid default gen_random_uuid() not null,
  student_id uuid not null,
  source_session_label text not null,
  target_session_label text not null,
  fee_head text default 'tuition'::text not null,
  original_amount integer not null,
  backing_installment_id uuid,
  import_batch_id uuid,
  import_row_id uuid,
  status text default 'active'::text not null,
  notes text,
  created_by uuid,
  updated_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

-- public.student_collection_flags
create table if not exists public.student_collection_flags (
  id uuid default gen_random_uuid() not null,
  student_id uuid not null,
  session_label text not null,
  no_call boolean default true not null,
  reason text,
  created_by uuid,
  updated_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  whatsapp_cadence text default 'every_run'::text not null,
  whatsapp_snoozed_until date,
  whatsapp_language text
);

-- public.student_conventional_discount_assignments
create table if not exists public.student_conventional_discount_assignments (
  id uuid default gen_random_uuid() not null,
  student_id uuid not null,
  policy_id uuid not null,
  academic_session_label text not null,
  is_active boolean default true not null,
  applied_by uuid,
  applied_at timestamp with time zone default now() not null,
  reason text not null,
  notes text,
  before_tuition_amount integer not null,
  resulting_tuition_amount integer not null,
  calculation_snapshot jsonb default '{}'::jsonb not null,
  family_group_id uuid,
  is_manual_override boolean default false not null,
  manual_override_reason text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

-- public.student_family_groups
create table if not exists public.student_family_groups (
  id uuid default gen_random_uuid() not null,
  academic_session_label text not null,
  family_label text not null,
  guardian_name text,
  guardian_phone text,
  notes text,
  created_by uuid,
  updated_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

-- public.student_family_members
create table if not exists public.student_family_members (
  id uuid default gen_random_uuid() not null,
  family_group_id uuid not null,
  student_id uuid not null,
  academic_session_label text not null,
  sibling_order integer,
  is_policy_candidate boolean default false not null,
  manual_order_override boolean default false not null,
  notes text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

-- public.student_fee_overrides
create table if not exists public.student_fee_overrides (
  id uuid default gen_random_uuid() not null,
  student_id uuid not null,
  fee_setting_id uuid not null,
  custom_annual_base_amount integer,
  custom_transport_installment_amount integer,
  custom_late_fee_flat_amount integer,
  discount_amount integer default 0 not null,
  reason text not null,
  is_active boolean default true not null,
  created_by uuid,
  updated_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  custom_tuition_fee_amount integer,
  custom_transport_fee_amount integer,
  custom_books_fee_amount integer,
  custom_admission_activity_misc_fee_amount integer,
  custom_other_fee_heads jsonb,
  student_type_override text,
  transport_applies_override boolean,
  notes text,
  other_adjustment_head text,
  other_adjustment_amount integer,
  late_fee_waiver_amount integer default 0 not null,
  custom_other_fee_head_labels jsonb
);

-- public.student_late_fee_waivers
create table if not exists public.student_late_fee_waivers (
  id uuid default gen_random_uuid() not null,
  student_id uuid not null,
  installment_id uuid not null,
  session_label text not null,
  amount integer not null,
  reason text not null,
  source text default 'manual'::text not null,
  client_request_id uuid,
  waived_by uuid,
  waived_by_label text,
  waived_at timestamp with time zone default now() not null,
  voided_at timestamp with time zone,
  voided_by uuid,
  void_reason text,
  created_at timestamp with time zone default now() not null
);

-- public.student_repayment_emi_late_fees
create table if not exists public.student_repayment_emi_late_fees (
  id uuid default gen_random_uuid() not null,
  plan_id uuid not null,
  student_id uuid not null,
  session_label text not null,
  sequence_no smallint not null,
  emi_due_date date not null,
  amount integer not null,
  backing_installment_id uuid not null,
  charged_at timestamp with time zone default now() not null
);

-- public.student_repayment_plan_items
create table if not exists public.student_repayment_plan_items (
  id uuid default gen_random_uuid() not null,
  plan_id uuid not null,
  student_id uuid not null,
  installment_id uuid not null,
  installment_no smallint,
  installment_label text,
  due_date date not null,
  is_carry_forward boolean default false not null,
  snapshot_base_charge integer not null,
  included_base_balance integer not null,
  waived_late_fee integer default 0 not null,
  created_at timestamp with time zone default now() not null
);

-- public.student_repayment_plans
create table if not exists public.student_repayment_plans (
  id uuid default gen_random_uuid() not null,
  student_id uuid not null,
  session_label text not null,
  scope text not null,
  opening_balance integer not null,
  monthly_amount integer not null,
  first_due_date date not null,
  term_months smallint not null,
  final_installment_amount integer not null,
  waived_late_fee_total integer default 0 not null,
  reason text not null,
  client_request_id uuid,
  lifecycle text default 'active'::text not null,
  supersedes_plan_id uuid,
  superseded_by_plan_id uuid,
  activated_by uuid,
  activated_by_label text,
  activated_at timestamp with time zone default now() not null,
  cancelled_by uuid,
  cancelled_at timestamp with time zone,
  cancellation_reason text,
  created_by uuid,
  updated_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

-- public.student_repayment_receipt_links
create table if not exists public.student_repayment_receipt_links (
  id uuid default gen_random_uuid() not null,
  plan_id uuid not null,
  student_id uuid not null,
  receipt_id uuid not null,
  contribution_amount integer not null,
  spillover_amount integer default 0 not null,
  plan_balance_before integer not null,
  plan_balance_after integer not null,
  created_at timestamp with time zone default now() not null
);

-- public.student_repayment_schedule
create table if not exists public.student_repayment_schedule (
  id uuid default gen_random_uuid() not null,
  plan_id uuid not null,
  student_id uuid not null,
  sequence_no smallint not null,
  due_date date not null,
  amount integer not null,
  created_at timestamp with time zone default now() not null
);

-- public.student_session_reanchor_log
create table if not exists public.student_session_reanchor_log (
  id uuid default gen_random_uuid() not null,
  student_id uuid not null,
  from_session text not null,
  to_session text not null,
  batch_id uuid,
  run_by uuid,
  run_at timestamp with time zone default now() not null
);

-- public.student_share_links
create table if not exists public.student_share_links (
  id uuid default gen_random_uuid() not null,
  student_id uuid not null,
  token text not null,
  expires_at timestamp with time zone not null,
  revoked_at timestamp with time zone,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  last_viewed_at timestamp with time zone,
  view_count integer default 0 not null
);

-- public.students
create table if not exists public.students (
  id uuid default gen_random_uuid() not null,
  admission_no text not null,
  full_name text not null,
  date_of_birth date,
  father_name text,
  mother_name text,
  primary_phone text,
  secondary_phone text,
  address text,
  class_id uuid not null,
  transport_route_id uuid,
  status public.student_status default 'active'::public.student_status not null,
  joined_on date,
  left_on date,
  notes text,
  created_by uuid,
  updated_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  email text,
  photo_path text,
  gender text,
  blood_group text,
  category text,
  religion text,
  caste text,
  nationality text,
  mother_tongue text,
  aadhaar_no text,
  jan_aadhaar_no text,
  apaar_id text,
  house text,
  roll_no text,
  previous_school text,
  tc_number text,
  board_registration_no text,
  village_city text,
  tehsil text,
  district text,
  state text,
  pincode text,
  guardian_name text,
  guardian_relation text,
  guardian_phone text,
  emergency_contact_name text,
  emergency_contact_phone text
);

-- public.transport_routes
create table if not exists public.transport_routes (
  id uuid default gen_random_uuid() not null,
  route_code text,
  route_name text not null,
  default_installment_amount integer default 0 not null,
  is_active boolean default true not null,
  notes text,
  created_by uuid,
  updated_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  annual_fee_amount integer
);

-- public.user_activity_events
create table if not exists public.user_activity_events (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  kind text not null,
  ref_id uuid,
  payload jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null
);

-- public.users
create table if not exists public.users (
  id uuid not null,
  full_name text not null,
  role public.staff_role default 'view_only'::public.staff_role not null,
  phone text,
  is_active boolean default true not null,
  last_login_at timestamp with time zone,
  notes text,
  created_by uuid,
  updated_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  preferred_locale text
);

-- public.whatsapp_campaign_runs
create table if not exists public.whatsapp_campaign_runs (
  id uuid default gen_random_uuid() not null,
  campaign_id uuid,
  session_label text not null,
  campaign_name text not null,
  situation text not null,
  language text not null,
  filters jsonb default '{}'::jsonb not null,
  last_date date,
  late_fee_phrase text,
  started_at timestamp with time zone default now() not null,
  finished_at timestamp with time zone,
  started_by uuid,
  selected_count integer default 0 not null,
  sent_count integer default 0 not null,
  failed_count integer default 0 not null,
  already_count integer default 0 not null,
  money_quoted bigint default 0 not null,
  created_at timestamp with time zone default now() not null
);

-- public.whatsapp_campaigns
create table if not exists public.whatsapp_campaigns (
  id uuid default gen_random_uuid() not null,
  session_label text not null,
  name text not null,
  situation text not null,
  language text not null,
  filters jsonb default '{}'::jsonb not null,
  last_date date,
  late_fee_amount integer default 0 not null,
  late_fee_basis text default 'per_installment'::text not null,
  archived_at timestamp with time zone,
  created_by uuid,
  updated_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

-- public.whatsapp_reminder_sends
create table if not exists public.whatsapp_reminder_sends (
  id uuid default gen_random_uuid() not null,
  student_id uuid not null,
  session_label text not null,
  sent_on date default ((now() AT TIME ZONE 'Asia/Kolkata'::text))::date not null,
  campaign_name text not null,
  destination text not null,
  due_amount integer not null,
  template_params jsonb default '[]'::jsonb not null,
  status text default 'pending'::text not null,
  provider_message_id text,
  error_message text,
  sent_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  run_id uuid,
  language text,
  destination_role text default 'primary'::text not null
);

-- public.whatsapp_templates
create table if not exists public.whatsapp_templates (
  id uuid default gen_random_uuid() not null,
  name text not null,
  body text not null,
  placeholders text[] default '{}'::text[] not null,
  category text default 'reminder'::text not null,
  is_active boolean default true not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  created_by uuid
);

-- public.workbook_materialized_view_refresh_queue
create table if not exists public.workbook_materialized_view_refresh_queue (
  queue_key text default 'workbook'::text not null,
  pending boolean default true not null,
  requested_at timestamp with time zone default now() not null,
  request_count bigint default 1 not null,
  last_refreshed_at timestamp with time zone
);


-- ══ Constraints ═════════════════════════════════════════════════════════

alter table private.vpps_direct_import_backups add constraint vpps_direct_import_backups_pkey PRIMARY KEY (id);
alter table private.vpps_direct_import_stage_dues add constraint vpps_direct_import_stage_dues_pkey PRIMARY KEY (import_name, source_key);
alter table private.vpps_direct_import_stage_skipped add constraint vpps_direct_import_stage_skipped_pkey PRIMARY KEY (import_name, source, source_row_number, status);
alter table private.vpps_direct_import_stage_students add constraint vpps_direct_import_stage_students_pkey PRIMARY KEY (import_name, source_key);
alter table private.vpps_student_source_mapping add constraint vpps_student_source_mapping_pkey PRIMARY KEY (source_student_uid, import_name);
alter table public.academic_sessions add constraint academic_sessions_pkey PRIMARY KEY (id);
alter table public.app_settings add constraint app_settings_pkey PRIMARY KEY (key);
alter table public.audit_logs add constraint audit_logs_pkey PRIMARY KEY (id);
alter table public.classes add constraint classes_pkey PRIMARY KEY (id);
alter table public.collection_closures add constraint collection_closures_pkey PRIMARY KEY (id);
alter table public.config_change_batches add constraint config_change_batches_pkey PRIMARY KEY (id);
alter table public.config_change_blocked_installments add constraint config_change_blocked_installments_pkey PRIMARY KEY (id);
alter table public.conventional_discount_policies add constraint conventional_discount_policies_pkey PRIMARY KEY (id);
alter table public.defaulter_contacts add constraint defaulter_contacts_pkey PRIMARY KEY (id);
alter table public.defaulter_recovery_state add constraint defaulter_recovery_state_pkey PRIMARY KEY (id);
alter table public.family_payments add constraint family_payments_pkey PRIMARY KEY (id);
alter table public.fee_policy_configs add constraint fee_policy_configs_pkey PRIMARY KEY (id);
alter table public.fee_settings add constraint fee_settings_pkey PRIMARY KEY (id);
alter table public.import_batches add constraint import_batches_pkey PRIMARY KEY (id);
alter table public.import_rows add constraint import_rows_pkey PRIMARY KEY (id);
alter table public.installments add constraint installments_pkey PRIMARY KEY (id);
alter table public.late_fee_rule_change_snapshot add constraint late_fee_rule_change_snapshot_pkey PRIMARY KEY (installment_id);
alter table public.late_fee_waiver_pool_snapshot add constraint late_fee_waiver_pool_snapshot_pkey PRIMARY KEY (student_id);
alter table public.ledger_regeneration_batches add constraint ledger_regeneration_batches_pkey PRIMARY KEY (id);
alter table public.ledger_regeneration_rows add constraint ledger_regeneration_rows_pkey PRIMARY KEY (id);
alter table public.notion_sync_log add constraint notion_sync_log_pkey PRIMARY KEY (id);
alter table public.office_sync_events add constraint office_sync_events_pkey PRIMARY KEY (id);
alter table public.payment_adjustment_reviews add constraint payment_adjustment_reviews_pkey PRIMARY KEY (id);
alter table public.payment_adjustments add constraint payment_adjustments_pkey PRIMARY KEY (id);
alter table public.payment_import_batches add constraint payment_import_batches_pkey PRIMARY KEY (id);
alter table public.payment_import_rows add constraint payment_import_rows_pkey PRIMARY KEY (id);
alter table public.payments add constraint payments_pkey PRIMARY KEY (id);
alter table public.prev_year_import_batches add constraint prev_year_import_batches_pkey PRIMARY KEY (id);
alter table public.prev_year_import_rows add constraint prev_year_import_rows_pkey PRIMARY KEY (id);
alter table public.promotion_run_entries add constraint promotion_run_entries_pkey PRIMARY KEY (id);
alter table public.promotion_runs add constraint promotion_runs_pkey PRIMARY KEY (id);
alter table public.receipt_adjustments add constraint receipt_adjustments_pkey PRIMARY KEY (id);
alter table public.receipt_finance_adjustments add constraint receipt_finance_adjustments_pkey PRIMARY KEY (id);
alter table public.receipts add constraint receipts_pkey PRIMARY KEY (id);
alter table public.refund_requests add constraint refund_requests_pkey PRIMARY KEY (id);
alter table public.school_fee_defaults add constraint school_fee_defaults_pkey PRIMARY KEY (id);
alter table public.session_reconcile_log add constraint session_reconcile_log_pkey PRIMARY KEY (id);
alter table public.setup_progress add constraint setup_progress_pkey PRIMARY KEY (id);
alter table public.student_carry_forward_balances add constraint student_carry_forward_balances_pkey PRIMARY KEY (id);
alter table public.student_collection_flags add constraint student_collection_flags_pkey PRIMARY KEY (id);
alter table public.student_conventional_discount_assignments add constraint student_conventional_discount_assignments_pkey PRIMARY KEY (id);
alter table public.student_family_groups add constraint student_family_groups_pkey PRIMARY KEY (id);
alter table public.student_family_members add constraint student_family_members_pkey PRIMARY KEY (id);
alter table public.student_fee_overrides add constraint student_fee_overrides_pkey PRIMARY KEY (id);
alter table public.student_late_fee_waivers add constraint student_late_fee_waivers_pkey PRIMARY KEY (id);
alter table public.student_repayment_emi_late_fees add constraint student_repayment_emi_late_fees_pkey PRIMARY KEY (id);
alter table public.student_repayment_plan_items add constraint student_repayment_plan_items_pkey PRIMARY KEY (id);
alter table public.student_repayment_plans add constraint student_repayment_plans_pkey PRIMARY KEY (id);
alter table public.student_repayment_receipt_links add constraint student_repayment_receipt_links_pkey PRIMARY KEY (id);
alter table public.student_repayment_schedule add constraint student_repayment_schedule_pkey PRIMARY KEY (id);
alter table public.student_session_reanchor_log add constraint student_session_reanchor_log_pkey PRIMARY KEY (id);
alter table public.student_share_links add constraint student_share_links_pkey PRIMARY KEY (id);
alter table public.students add constraint students_pkey PRIMARY KEY (id);
alter table public.transport_routes add constraint transport_routes_pkey PRIMARY KEY (id);
alter table public.user_activity_events add constraint user_activity_events_pkey PRIMARY KEY (id);
alter table public.users add constraint users_pkey PRIMARY KEY (id);
alter table public.whatsapp_campaign_runs add constraint whatsapp_campaign_runs_pkey PRIMARY KEY (id);
alter table public.whatsapp_campaigns add constraint whatsapp_campaigns_pkey PRIMARY KEY (id);
alter table public.whatsapp_reminder_sends add constraint whatsapp_reminder_sends_pkey PRIMARY KEY (id);
alter table public.whatsapp_templates add constraint whatsapp_templates_pkey PRIMARY KEY (id);
alter table public.workbook_materialized_view_refresh_queue add constraint workbook_materialized_view_refresh_queue_pkey PRIMARY KEY (queue_key);
alter table private.vpps_direct_import_backups add constraint vpps_direct_import_backups_backup_label_key UNIQUE (backup_label);
alter table public.academic_sessions add constraint academic_sessions_session_label_key UNIQUE (session_label);
alter table public.collection_closures add constraint collection_closures_payment_date_key UNIQUE (payment_date);
alter table public.config_change_blocked_installments add constraint config_change_blocked_unique UNIQUE (batch_id, installment_id, action_needed);
alter table public.conventional_discount_policies add constraint conventional_discount_policies_academic_session_label_code_key UNIQUE (academic_session_label, code);
alter table public.defaulter_recovery_state add constraint defaulter_recovery_state_student_id_session_label_key UNIQUE (student_id, session_label);
alter table public.family_payments add constraint family_payments_client_request_id_key UNIQUE (client_request_id);
alter table public.import_rows add constraint import_rows_batch_row_unique UNIQUE (batch_id, row_index);
alter table public.installments add constraint installments_id_student_unique UNIQUE (id, student_id);
alter table public.installments add constraint installments_student_class_installment_unique UNIQUE (student_id, class_id, installment_no);
alter table public.payment_adjustment_reviews add constraint payment_adjustment_reviews_unique UNIQUE (payment_adjustment_id);
alter table public.payments add constraint payments_id_student_installment_unique UNIQUE (id, student_id, installment_id);
alter table public.payments add constraint payments_receipt_installment_unique UNIQUE (receipt_id, installment_id);
alter table public.prev_year_import_rows add constraint prev_year_import_rows_batch_id_row_index_key UNIQUE (batch_id, row_index);
alter table public.promotion_run_entries add constraint promotion_run_entries_run_id_student_id_key UNIQUE (run_id, student_id);
alter table public.receipt_finance_adjustments add constraint receipt_finance_adjustments_receipt_id_key UNIQUE (receipt_id);
alter table public.receipts add constraint receipts_id_student_unique UNIQUE (id, student_id);
alter table public.receipts add constraint receipts_receipt_number_key UNIQUE (receipt_number);
alter table public.student_collection_flags add constraint student_collection_flags_student_id_session_label_key UNIQUE (student_id, session_label);
alter table public.student_family_groups add constraint student_family_groups_academic_session_label_family_label_key UNIQUE (academic_session_label, family_label);
alter table public.student_family_members add constraint student_family_members_family_group_id_student_id_academic__key UNIQUE (family_group_id, student_id, academic_session_label);
alter table public.student_repayment_emi_late_fees add constraint student_repayment_emi_late_fees_one_per_emi UNIQUE (plan_id, sequence_no);
alter table public.student_repayment_emi_late_fees add constraint student_repayment_emi_late_fees_one_per_installment UNIQUE (backing_installment_id);
alter table public.student_repayment_plan_items add constraint student_repayment_plan_items_unique UNIQUE (plan_id, installment_id);
alter table public.student_repayment_receipt_links add constraint student_repayment_receipt_links_unique UNIQUE (plan_id, receipt_id);
alter table public.student_repayment_schedule add constraint student_repayment_schedule_unique UNIQUE (plan_id, sequence_no);
alter table public.student_share_links add constraint student_share_links_token_key UNIQUE (token);
alter table public.students add constraint students_admission_no_key UNIQUE (admission_no);
alter table public.transport_routes add constraint transport_routes_route_code_key UNIQUE (route_code);
alter table public.whatsapp_campaigns add constraint whatsapp_campaigns_session_label_name_key UNIQUE (session_label, name);
alter table private.vpps_direct_import_stage_dues add constraint vpps_direct_import_stage_dues_payload_object CHECK ((jsonb_typeof(payload) = 'object'::text));
alter table private.vpps_direct_import_stage_skipped add constraint vpps_direct_import_stage_skipped_payload_object CHECK ((jsonb_typeof(payload) = 'object'::text));
alter table private.vpps_direct_import_stage_students add constraint vpps_direct_import_stage_students_payload_object CHECK ((jsonb_typeof(payload) = 'object'::text));
alter table private.vpps_student_source_mapping add constraint vpps_student_source_mapping_matched_via_check CHECK ((matched_via = ANY (ARRAY['source_student_uid'::text, 'admission_no'::text, 'name_class_phone_fallback'::text, 'created_new'::text])));
alter table public.academic_sessions add constraint academic_sessions_check CHECK (((NOT is_current) OR (status = 'active'::public.class_status)));
alter table public.academic_sessions add constraint academic_sessions_session_label_check CHECK ((length(TRIM(BOTH FROM session_label)) > 0));
alter table public.audit_logs add constraint audit_logs_check CHECK (((before_data IS NOT NULL) OR (after_data IS NOT NULL)));
alter table public.classes add constraint classes_sort_order_check CHECK ((sort_order >= 0));
alter table public.collection_closures add constraint collection_closures_summary_snapshot_check CHECK ((jsonb_typeof(summary_snapshot) = 'object'::text));
alter table public.config_change_batches add constraint config_change_batches_apply_summary_check CHECK (((apply_summary IS NULL) OR (jsonb_typeof(apply_summary) = 'object'::text)));
alter table public.config_change_batches add constraint config_change_batches_before_payload_check CHECK ((jsonb_typeof(before_payload) = 'object'::text));
alter table public.config_change_batches add constraint config_change_batches_change_scope_check CHECK ((change_scope = ANY (ARRAY['global_policy'::text, 'school_defaults'::text, 'class_defaults'::text, 'transport_defaults'::text, 'student_override'::text, 'workbook_setup'::text])));
alter table public.config_change_batches add constraint config_change_batches_changed_fields_check CHECK ((jsonb_typeof(changed_fields) = 'array'::text));
alter table public.config_change_batches add constraint config_change_batches_preview_summary_check CHECK ((jsonb_typeof(preview_summary) = 'object'::text));
alter table public.config_change_batches add constraint config_change_batches_proposed_payload_check CHECK ((jsonb_typeof(proposed_payload) = 'object'::text));
alter table public.config_change_batches add constraint config_change_batches_status_check CHECK ((status = ANY (ARRAY['preview_ready'::text, 'applied'::text, 'stale'::text, 'failed'::text, 'cancelled'::text])));
alter table public.config_change_blocked_installments add constraint config_change_blocked_installments_action_needed_check CHECK ((action_needed = ANY (ARRAY['update'::text, 'cancel'::text])));
alter table public.config_change_blocked_installments add constraint config_change_blocked_installments_amount_due_check CHECK ((amount_due >= 0));
alter table public.config_change_blocked_installments add constraint config_change_blocked_installments_outstanding_amount_check CHECK ((outstanding_amount >= 0));
alter table public.config_change_blocked_installments add constraint config_change_blocked_installments_paid_amount_check CHECK ((paid_amount >= 0));
alter table public.config_change_blocked_installments add constraint config_change_blocked_installments_reason_code_check CHECK ((reason_code = ANY (ARRAY['fully_paid'::text, 'partially_paid'::text, 'adjustment_posted'::text, 'in_repayment_plan'::text])));
alter table public.config_change_blocked_installments add constraint config_change_blocked_installments_review_status_check CHECK ((review_status = ANY (ARRAY['pending'::text, 'reviewed'::text])));
alter table public.conventional_discount_policies add constraint conventional_discount_policies_calculation_type_check CHECK ((calculation_type = ANY (ARRAY['tuition_zero'::text, 'tuition_percentage'::text, 'tuition_fixed_amount'::text])));
alter table public.conventional_discount_policies add constraint conventional_discount_policies_code_check CHECK ((code ~ '^[a-z][a-z0-9_]{1,47}$'::text));
alter table public.conventional_discount_policies add constraint conventional_discount_policies_fixed_tuition_amount_check CHECK (((fixed_tuition_amount IS NULL) OR (fixed_tuition_amount >= 0)));
alter table public.conventional_discount_policies add constraint conventional_discount_policies_percentage_check CHECK (((percentage IS NULL) OR ((percentage >= (0)::numeric) AND (percentage <= (100)::numeric))));
alter table public.defaulter_contacts add constraint defaulter_contacts_channel_check CHECK ((channel = ANY (ARRAY['call'::text, 'whatsapp'::text, 'sms'::text, 'in_person'::text, 'email'::text])));
alter table public.defaulter_contacts add constraint defaulter_contacts_outcome_check CHECK ((outcome = ANY (ARRAY['reached'::text, 'no_answer'::text, 'promised_pay'::text, 'dispute'::text, 'other'::text])));
alter table public.defaulter_recovery_state add constraint defaulter_recovery_state_promise_broken_count_check CHECK ((promise_broken_count >= 0));
alter table public.defaulter_recovery_state add constraint defaulter_recovery_state_promise_kept_count_check CHECK ((promise_kept_count >= 0));
alter table public.defaulter_recovery_state add constraint defaulter_recovery_state_promise_resolved_outcome_check CHECK ((promise_resolved_outcome = ANY (ARRAY['kept'::text, 'broken'::text])));
alter table public.defaulter_recovery_state add constraint defaulter_recovery_state_recovery_stage_check CHECK ((recovery_stage = ANY (ARRAY['standard'::text, 'watch'::text, 'promise_due'::text, 'escalated'::text, 'no_call'::text])));
alter table public.family_payments add constraint family_payments_total_amount_check CHECK ((total_amount >= 0));
alter table public.fee_policy_configs add constraint fee_policy_configs_academic_fee_distribution_check CHECK ((academic_fee_distribution = ANY (ARRAY['first_only'::text, 'equal'::text])));
alter table public.fee_policy_configs add constraint fee_policy_configs_academic_session_label_check CHECK ((academic_session_label <> ''::text));
alter table public.fee_policy_configs add constraint fee_policy_configs_accepted_payment_modes_check CHECK ((COALESCE(array_length(accepted_payment_modes, 1), 0) >= 1));
alter table public.fee_policy_configs add constraint fee_policy_configs_calculation_model_check CHECK ((calculation_model = ANY (ARRAY['standard'::text, 'workbook_v1'::text])));
alter table public.fee_policy_configs add constraint fee_policy_configs_custom_fee_heads_check CHECK ((jsonb_typeof(custom_fee_heads) = 'array'::text));
alter table public.fee_policy_configs add constraint fee_policy_configs_installment_schedule_check CHECK ((jsonb_typeof(installment_schedule) = 'array'::text));
alter table public.fee_policy_configs add constraint fee_policy_configs_late_fee_flat_amount_check CHECK ((late_fee_flat_amount >= 0));
alter table public.fee_policy_configs add constraint fee_policy_configs_new_student_academic_fee_amount_check CHECK ((new_student_academic_fee_amount >= 0));
alter table public.fee_policy_configs add constraint fee_policy_configs_old_student_academic_fee_amount_check CHECK ((old_student_academic_fee_amount >= 0));
alter table public.fee_policy_configs add constraint fee_policy_configs_receipt_prefix_check CHECK ((receipt_prefix = upper(receipt_prefix)));
alter table public.fee_policy_configs add constraint fee_policy_configs_receipt_prefix_check1 CHECK ((receipt_prefix ~ '^[A-Z0-9][A-Z0-9-]{1,11}$'::text));
alter table public.fee_settings add constraint fee_settings_admission_activity_misc_fee_amount_check CHECK ((admission_activity_misc_fee_amount >= 0));
alter table public.fee_settings add constraint fee_settings_annual_base_amount_check CHECK ((annual_base_amount >= 0));
alter table public.fee_settings add constraint fee_settings_books_fee_amount_check CHECK ((books_fee_amount >= 0));
alter table public.fee_settings add constraint fee_settings_installment_count_check CHECK ((installment_count > 0));
alter table public.fee_settings add constraint fee_settings_late_fee_flat_amount_check CHECK ((late_fee_flat_amount >= 0));
alter table public.fee_settings add constraint fee_settings_other_fee_heads_object CHECK ((jsonb_typeof(other_fee_heads) = 'object'::text));
alter table public.fee_settings add constraint fee_settings_student_type_default_check CHECK ((student_type_default = ANY (ARRAY['new'::text, 'existing'::text])));
alter table public.fee_settings add constraint fee_settings_transport_fee_amount_check CHECK ((transport_fee_amount >= 0));
alter table public.fee_settings add constraint fee_settings_tuition_fee_amount_check CHECK ((tuition_fee_amount >= 0));
alter table public.import_batches add constraint import_batches_column_mapping_object CHECK ((jsonb_typeof(column_mapping) = 'object'::text));
alter table public.import_batches add constraint import_batches_detected_headers_array CHECK ((jsonb_typeof(detected_headers) = 'array'::text));
alter table public.import_batches add constraint import_batches_duplicate_rows_check CHECK ((duplicate_rows >= 0));
alter table public.import_batches add constraint import_batches_failed_rows_check CHECK ((failed_rows >= 0));
alter table public.import_batches add constraint import_batches_file_size_bytes_check CHECK ((file_size_bytes >= 0));
alter table public.import_batches add constraint import_batches_import_mode_check CHECK ((import_mode = ANY (ARRAY['add'::text, 'update'::text])));
alter table public.import_batches add constraint import_batches_imported_rows_check CHECK ((imported_rows >= 0));
alter table public.import_batches add constraint import_batches_invalid_rows_check CHECK ((invalid_rows >= 0));
alter table public.import_batches add constraint import_batches_skipped_rows_check CHECK ((skipped_rows >= 0));
alter table public.import_batches add constraint import_batches_source_format_check CHECK ((source_format = ANY (ARRAY['csv'::text, 'xlsx'::text])));
alter table public.import_batches add constraint import_batches_status_check CHECK ((status = ANY (ARRAY['uploaded'::text, 'validated'::text, 'importing'::text, 'completed'::text, 'failed'::text])));
alter table public.import_batches add constraint import_batches_summary_object CHECK ((jsonb_typeof(summary) = 'object'::text));
alter table public.import_batches add constraint import_batches_total_rows_check CHECK ((total_rows >= 0));
alter table public.import_batches add constraint import_batches_valid_rows_check CHECK ((valid_rows >= 0));
alter table public.import_rows add constraint import_rows_anomaly_categories_array CHECK ((jsonb_typeof(anomaly_categories) = 'array'::text));
alter table public.import_rows add constraint import_rows_changed_fields_array CHECK ((jsonb_typeof(changed_fields) = 'array'::text));
alter table public.import_rows add constraint import_rows_duplicate_audit_decision_check CHECK (((duplicate_audit_decision IS NULL) OR (duplicate_audit_decision = ANY (ARRAY['proceed_new'::text, 'mark_duplicate'::text, 'mark_update'::text]))));
alter table public.import_rows add constraint import_rows_errors_array CHECK ((jsonb_typeof(errors) = 'array'::text));
alter table public.import_rows add constraint import_rows_import_operation_check CHECK ((import_operation = ANY (ARRAY['create'::text, 'update'::text])));
alter table public.import_rows add constraint import_rows_normalized_payload_object CHECK (((normalized_payload IS NULL) OR (jsonb_typeof(normalized_payload) = 'object'::text)));
alter table public.import_rows add constraint import_rows_raw_payload_object CHECK ((jsonb_typeof(raw_payload) = 'object'::text));
alter table public.import_rows add constraint import_rows_review_status_check CHECK ((review_status = ANY (ARRAY['pending'::text, 'approved'::text, 'hold'::text, 'skipped'::text])));
alter table public.import_rows add constraint import_rows_row_index_check CHECK ((row_index > 0));
alter table public.import_rows add constraint import_rows_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'valid'::text, 'invalid'::text, 'duplicate'::text, 'imported'::text, 'skipped'::text])));
alter table public.import_rows add constraint import_rows_warnings_array CHECK ((jsonb_typeof(warnings) = 'array'::text));
alter table public.installments add constraint installments_base_amount_check CHECK ((base_amount >= 0));
alter table public.installments add constraint installments_discount_amount_check CHECK ((discount_amount >= 0));
alter table public.installments add constraint installments_installment_no_check CHECK ((installment_no > 0));
alter table public.installments add constraint installments_late_fee_flat_amount_check CHECK ((late_fee_flat_amount >= 0));
alter table public.installments add constraint installments_non_negative_due CHECK (((base_amount + transport_amount) >= discount_amount));
alter table public.installments add constraint installments_transport_amount_check CHECK ((transport_amount >= 0));
alter table public.ledger_regeneration_batches add constraint ledger_regeneration_batches_apply_summary_check CHECK (((apply_summary IS NULL) OR (jsonb_typeof(apply_summary) = 'object'::text)));
alter table public.ledger_regeneration_batches add constraint ledger_regeneration_batches_policy_revision_label_check CHECK ((TRIM(BOTH FROM policy_revision_label) <> ''::text));
alter table public.ledger_regeneration_batches add constraint ledger_regeneration_batches_preview_summary_check CHECK ((jsonb_typeof(preview_summary) = 'object'::text));
alter table public.ledger_regeneration_batches add constraint ledger_regeneration_batches_reason_check CHECK ((TRIM(BOTH FROM reason) <> ''::text));
alter table public.ledger_regeneration_batches add constraint ledger_regeneration_batches_source_snapshot_check CHECK ((jsonb_typeof(source_snapshot) = 'object'::text));
alter table public.ledger_regeneration_batches add constraint ledger_regeneration_batches_status_check CHECK ((status = ANY (ARRAY['preview_ready'::text, 'applied'::text, 'stale'::text, 'failed'::text, 'cancelled'::text])));
alter table public.ledger_regeneration_rows add constraint ledger_regeneration_rows_action_needed_check CHECK ((action_needed = ANY (ARRAY['insert'::text, 'update'::text, 'cancel'::text, 'skip'::text, 'review'::text])));
alter table public.ledger_regeneration_rows add constraint ledger_regeneration_rows_amount_due_check CHECK ((amount_due >= 0));
alter table public.ledger_regeneration_rows add constraint ledger_regeneration_rows_balance_status_check CHECK ((balance_status = ANY (ARRAY['paid'::text, 'partial'::text, 'unpaid'::text, 'future'::text, 'waived'::text, 'cancelled'::text])));
alter table public.ledger_regeneration_rows add constraint ledger_regeneration_rows_base_amount_check CHECK ((base_amount >= 0));
alter table public.ledger_regeneration_rows add constraint ledger_regeneration_rows_discount_amount_check CHECK ((discount_amount >= 0));
alter table public.ledger_regeneration_rows add constraint ledger_regeneration_rows_installment_no_check CHECK ((installment_no > 0));
alter table public.ledger_regeneration_rows add constraint ledger_regeneration_rows_late_fee_flat_amount_check CHECK ((late_fee_flat_amount >= 0));
alter table public.ledger_regeneration_rows add constraint ledger_regeneration_rows_outstanding_amount_check CHECK ((outstanding_amount >= 0));
alter table public.ledger_regeneration_rows add constraint ledger_regeneration_rows_paid_amount_check CHECK ((paid_amount >= 0));
alter table public.ledger_regeneration_rows add constraint ledger_regeneration_rows_reason_code_check CHECK ((reason_code = ANY (ARRAY['missing_installment'::text, 'already_in_sync'::text, 'fully_paid'::text, 'partially_paid'::text, 'adjustment_posted'::text, 'existing_waived'::text, 'existing_cancelled'::text, 'extra_installment'::text, 'missing_settings'::text, 'discount_reduces_unpaid'::text, 'charge_rise_on_unsettled'::text])));
alter table public.ledger_regeneration_rows add constraint ledger_regeneration_rows_review_status_check CHECK ((review_status = ANY (ARRAY['pending'::text, 'reviewed'::text])));
alter table public.ledger_regeneration_rows add constraint ledger_regeneration_rows_transport_amount_check CHECK ((transport_amount >= 0));
alter table public.payment_adjustments add constraint payment_adjustments_amount_delta_check CHECK ((amount_delta <> 0));
alter table public.payment_import_batches add constraint payment_import_batches_source_format_check CHECK ((source_format = ANY (ARRAY['csv'::text, 'xlsx'::text])));
alter table public.payment_import_batches add constraint payment_import_batches_status_check CHECK ((status = ANY (ARRAY['uploaded'::text, 'validated'::text, 'committing'::text, 'committed'::text, 'failed'::text, 'cancelled'::text])));
alter table public.payment_import_rows add constraint payment_import_rows_validation_status_check CHECK ((validation_status = ANY (ARRAY['pending'::text, 'valid'::text, 'warning'::text, 'error'::text])));
alter table public.payments add constraint payments_amount_check CHECK ((amount > 0));
alter table public.payments add constraint payments_discount_applied_at_posting_check CHECK ((discount_applied_at_posting >= 0));
alter table public.payments add constraint payments_pending_after_posting_check CHECK (((pending_after_posting IS NULL) OR (pending_after_posting >= 0)));
alter table public.payments add constraint payments_pending_before_posting_check CHECK (((pending_before_posting IS NULL) OR (pending_before_posting >= 0)));
alter table public.payments add constraint payments_waiver_applied_at_posting_check CHECK ((waiver_applied_at_posting >= 0));
alter table public.prev_year_import_batches add constraint prev_year_import_batches_applied_row_count_check CHECK ((applied_row_count >= 0));
alter table public.prev_year_import_batches add constraint prev_year_import_batches_applied_subtotal_check CHECK ((applied_subtotal >= 0));
alter table public.prev_year_import_batches add constraint prev_year_import_batches_apply_summary_check CHECK (((apply_summary IS NULL) OR (jsonb_typeof(apply_summary) = 'object'::text)));
alter table public.prev_year_import_batches add constraint prev_year_import_batches_candidate_row_count_check CHECK ((candidate_row_count >= 0));
alter table public.prev_year_import_batches add constraint prev_year_import_batches_confirmed_row_count_check CHECK ((confirmed_row_count >= 0));
alter table public.prev_year_import_batches add constraint prev_year_import_batches_confirmed_subtotal_check CHECK ((confirmed_subtotal >= 0));
alter table public.prev_year_import_batches add constraint prev_year_import_batches_dry_run_summary_check CHECK ((jsonb_typeof(dry_run_summary) = 'object'::text));
alter table public.prev_year_import_batches add constraint prev_year_import_batches_file_name_check CHECK ((TRIM(BOTH FROM file_name) <> ''::text));
alter table public.prev_year_import_batches add constraint prev_year_import_batches_file_sha256_check CHECK ((TRIM(BOTH FROM file_sha256) <> ''::text));
alter table public.prev_year_import_batches add constraint prev_year_import_batches_session_label_check CHECK ((TRIM(BOTH FROM session_label) <> ''::text));
alter table public.prev_year_import_batches add constraint prev_year_import_batches_status_check CHECK ((status = ANY (ARRAY['dry_run'::text, 'applied'::text, 'rolled_back'::text, 'failed'::text, 'cancelled'::text])));
alter table public.prev_year_import_rows add constraint prev_year_import_rows_applied_amount_check CHECK (((applied_amount IS NULL) OR (applied_amount >= 0)));
alter table public.prev_year_import_rows add constraint prev_year_import_rows_match_method_check CHECK ((match_method = ANY (ARRAY['admission_no'::text, 'name_phone'::text, 'manual'::text, 'unmatched'::text, 'ambiguous'::text])));
alter table public.prev_year_import_rows add constraint prev_year_import_rows_owner_decision_check CHECK ((owner_decision = ANY (ARRAY['confirm'::text, 'write_off'::text, 'reject'::text, 'pending'::text])));
alter table public.prev_year_import_rows add constraint prev_year_import_rows_prev_year_due_check CHECK (((prev_year_due IS NULL) OR (prev_year_due >= 0)));
alter table public.prev_year_import_rows add constraint prev_year_import_rows_raw_row_check CHECK ((jsonb_typeof(raw_row) = 'object'::text));
alter table public.prev_year_import_rows add constraint prev_year_import_rows_row_index_check CHECK ((row_index >= 0));
alter table public.prev_year_import_rows add constraint prev_year_import_rows_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'matched'::text, 'applied'::text, 'skipped'::text, 'error'::text])));
alter table public.promotion_run_entries add constraint promotion_run_entries_credit_balance_check CHECK ((credit_balance >= 0));
alter table public.promotion_run_entries add constraint promotion_run_entries_decision_check CHECK ((decision = ANY (ARRAY['pending'::text, 'promote'::text, 'graduate'::text, 'skip'::text, 'manual'::text])));
alter table public.promotion_run_entries add constraint promotion_run_entries_opening_credit_amount_check CHECK ((opening_credit_amount >= 0));
alter table public.promotion_runs add constraint promotion_runs_status_check CHECK ((status = ANY (ARRAY['preview'::text, 'applied'::text, 'rolled_back'::text])));
alter table public.receipt_adjustments add constraint receipt_adjustments_adjustment_type_check CHECK ((adjustment_type = ANY (ARRAY['discount'::public.adjustment_type, 'writeoff'::public.adjustment_type])));
alter table public.receipt_adjustments add constraint receipt_adjustments_amount_delta_check CHECK ((amount_delta > 0));
alter table public.receipt_finance_adjustments add constraint receipt_finance_adjustments_quick_discount_amount_check CHECK ((quick_discount_amount >= 0));
alter table public.receipt_finance_adjustments add constraint receipt_finance_adjustments_quick_late_fee_waiver_amount_check CHECK ((quick_late_fee_waiver_amount >= 0));
alter table public.receipts add constraint receipts_total_amount_check CHECK ((total_amount > 0));
alter table public.refund_requests add constraint refund_requests_requested_amount_check CHECK ((requested_amount > 0));
alter table public.school_fee_defaults add constraint school_fee_defaults_admission_activity_misc_fee_amount_check CHECK ((admission_activity_misc_fee_amount >= 0));
alter table public.school_fee_defaults add constraint school_fee_defaults_books_fee_amount_check CHECK ((books_fee_amount >= 0));
alter table public.school_fee_defaults add constraint school_fee_defaults_installment_count_check CHECK ((installment_count > 0));
alter table public.school_fee_defaults add constraint school_fee_defaults_installment_due_dates_check CHECK ((array_length(installment_due_dates, 1) >= 1));
alter table public.school_fee_defaults add constraint school_fee_defaults_late_fee_flat_amount_check CHECK ((late_fee_flat_amount >= 0));
alter table public.school_fee_defaults add constraint school_fee_defaults_other_fee_heads_check CHECK ((jsonb_typeof(other_fee_heads) = 'object'::text));
alter table public.school_fee_defaults add constraint school_fee_defaults_student_type_default_check CHECK ((student_type_default = ANY (ARRAY['new'::text, 'existing'::text])));
alter table public.school_fee_defaults add constraint school_fee_defaults_transport_fee_amount_check CHECK ((transport_fee_amount >= 0));
alter table public.school_fee_defaults add constraint school_fee_defaults_tuition_fee_amount_check CHECK ((tuition_fee_amount >= 0));
alter table public.setup_progress add constraint setup_progress_is_active_check CHECK ((is_active = true));
alter table public.student_carry_forward_balances add constraint student_carry_forward_balances_check CHECK ((source_session_label <> target_session_label));
alter table public.student_carry_forward_balances add constraint student_carry_forward_balances_fee_head_check CHECK ((fee_head = 'tuition'::text));
alter table public.student_carry_forward_balances add constraint student_carry_forward_balances_original_amount_check CHECK ((original_amount > 0));
alter table public.student_carry_forward_balances add constraint student_carry_forward_balances_source_session_label_check CHECK ((TRIM(BOTH FROM source_session_label) <> ''::text));
alter table public.student_carry_forward_balances add constraint student_carry_forward_balances_status_check CHECK ((status = ANY (ARRAY['active'::text, 'collected'::text, 'cancelled'::text])));
alter table public.student_carry_forward_balances add constraint student_carry_forward_balances_target_session_label_check CHECK ((TRIM(BOTH FROM target_session_label) <> ''::text));
alter table public.student_collection_flags add constraint student_collection_flags_whatsapp_cadence_check CHECK ((whatsapp_cadence = ANY (ARRAY['every_run'::text, 'weekly'::text, 'fortnightly'::text, 'monthly'::text, 'never'::text])));
alter table public.student_collection_flags add constraint student_collection_flags_whatsapp_language_check CHECK (((whatsapp_language IS NULL) OR (whatsapp_language = ANY (ARRAY['hi'::text, 'en'::text]))));
alter table public.student_conventional_discount_assignments add constraint student_conventional_discount_as_resulting_tuition_amount_check CHECK ((resulting_tuition_amount >= 0));
alter table public.student_conventional_discount_assignments add constraint student_conventional_discount_assig_before_tuition_amount_check CHECK ((before_tuition_amount >= 0));
alter table public.student_fee_overrides add constraint student_fee_overrides_custom_admission_activity_misc_fee__check CHECK ((custom_admission_activity_misc_fee_amount >= 0));
alter table public.student_fee_overrides add constraint student_fee_overrides_custom_annual_base_amount_check CHECK ((custom_annual_base_amount >= 0));
alter table public.student_fee_overrides add constraint student_fee_overrides_custom_books_fee_amount_check CHECK ((custom_books_fee_amount >= 0));
alter table public.student_fee_overrides add constraint student_fee_overrides_custom_late_fee_flat_amount_check CHECK ((custom_late_fee_flat_amount >= 0));
alter table public.student_fee_overrides add constraint student_fee_overrides_custom_other_fee_head_labels_object CHECK (((custom_other_fee_head_labels IS NULL) OR (jsonb_typeof(custom_other_fee_head_labels) = 'object'::text)));
alter table public.student_fee_overrides add constraint student_fee_overrides_custom_other_fee_heads_object CHECK (((custom_other_fee_heads IS NULL) OR (jsonb_typeof(custom_other_fee_heads) = 'object'::text)));
alter table public.student_fee_overrides add constraint student_fee_overrides_custom_transport_fee_amount_check CHECK ((custom_transport_fee_amount >= 0));
alter table public.student_fee_overrides add constraint student_fee_overrides_custom_transport_installment_amount_check CHECK ((custom_transport_installment_amount >= 0));
alter table public.student_fee_overrides add constraint student_fee_overrides_custom_tuition_fee_amount_check CHECK ((custom_tuition_fee_amount >= 0));
alter table public.student_fee_overrides add constraint student_fee_overrides_discount_amount_check CHECK ((discount_amount >= 0));
alter table public.student_fee_overrides add constraint student_fee_overrides_late_fee_waiver_amount_check CHECK ((late_fee_waiver_amount >= 0));
alter table public.student_fee_overrides add constraint student_fee_overrides_override_payload_check CHECK (((custom_annual_base_amount IS NOT NULL) OR (custom_transport_installment_amount IS NOT NULL) OR (custom_late_fee_flat_amount IS NOT NULL) OR (discount_amount > 0) OR (custom_tuition_fee_amount IS NOT NULL) OR (custom_transport_fee_amount IS NOT NULL) OR (custom_books_fee_amount IS NOT NULL) OR (custom_admission_activity_misc_fee_amount IS NOT NULL) OR ((custom_other_fee_heads IS NOT NULL) AND (custom_other_fee_heads <> '{}'::jsonb)) OR (student_type_override IS NOT NULL) OR (transport_applies_override IS NOT NULL) OR (COALESCE(other_adjustment_amount, 0) <> 0) OR (NULLIF(TRIM(BOTH FROM COALESCE(other_adjustment_head, ''::text)), ''::text) IS NOT NULL) OR (late_fee_waiver_amount > 0)));
alter table public.student_fee_overrides add constraint student_fee_overrides_student_type_override_check CHECK ((student_type_override = ANY (ARRAY['new'::text, 'existing'::text])));
alter table public.student_late_fee_waivers add constraint student_late_fee_waivers_amount_check CHECK ((amount > 0));
alter table public.student_late_fee_waivers add constraint student_late_fee_waivers_reason_check CHECK ((length(btrim(reason)) >= 4));
alter table public.student_late_fee_waivers add constraint student_late_fee_waivers_source_check CHECK ((source = ANY (ARRAY['manual'::text, 'payment_desk'::text, 'migration'::text, 'grandfather'::text, 'repayment_plan'::text, 'manual_collected'::text])));
alter table public.student_late_fee_waivers add constraint student_late_fee_waivers_void_complete CHECK ((((voided_at IS NULL) AND (voided_by IS NULL) AND (void_reason IS NULL)) OR ((voided_at IS NOT NULL) AND (length(btrim(COALESCE(void_reason, ''::text))) >= 4))));
alter table public.student_repayment_emi_late_fees add constraint student_repayment_emi_late_fees_amount_check CHECK ((amount > 0));
alter table public.student_repayment_plan_items add constraint student_repayment_plan_items_included_base_balance_check CHECK ((included_base_balance >= 0));
alter table public.student_repayment_plan_items add constraint student_repayment_plan_items_snapshot_base_charge_check CHECK ((snapshot_base_charge >= 0));
alter table public.student_repayment_plan_items add constraint student_repayment_plan_items_waived_late_fee_check CHECK ((waived_late_fee >= 0));
alter table public.student_repayment_plans add constraint student_repayment_plans_cancel_complete CHECK ((((lifecycle = 'cancelled'::text) AND (cancelled_at IS NOT NULL) AND (length(btrim(COALESCE(cancellation_reason, ''::text))) >= 4)) OR ((lifecycle <> 'cancelled'::text) AND (cancelled_at IS NULL) AND (cancellation_reason IS NULL))));
alter table public.student_repayment_plans add constraint student_repayment_plans_final_installment_amount_check CHECK ((final_installment_amount > 0));
alter table public.student_repayment_plans add constraint student_repayment_plans_final_within_monthly CHECK ((final_installment_amount <= monthly_amount));
alter table public.student_repayment_plans add constraint student_repayment_plans_lifecycle_check CHECK ((lifecycle = ANY (ARRAY['active'::text, 'cancelled'::text, 'superseded'::text])));
alter table public.student_repayment_plans add constraint student_repayment_plans_monthly_amount_check CHECK ((monthly_amount > 0));
alter table public.student_repayment_plans add constraint student_repayment_plans_no_self_supersede CHECK (((superseded_by_plan_id IS NULL) OR (superseded_by_plan_id <> id)));
alter table public.student_repayment_plans add constraint student_repayment_plans_opening_balance_check CHECK ((opening_balance > 0));
alter table public.student_repayment_plans add constraint student_repayment_plans_reason_check CHECK ((length(btrim(reason)) >= 4));
alter table public.student_repayment_plans add constraint student_repayment_plans_schedule_totals CHECK ((((monthly_amount * (term_months - 1)) + final_installment_amount) = opening_balance));
alter table public.student_repayment_plans add constraint student_repayment_plans_scope_check CHECK ((scope = ANY (ARRAY['old_balance_only'::text, 'current_year_only'::text, 'old_and_current'::text])));
alter table public.student_repayment_plans add constraint student_repayment_plans_supersede_complete CHECK (((lifecycle <> 'superseded'::text) OR (superseded_by_plan_id IS NOT NULL)));
alter table public.student_repayment_plans add constraint student_repayment_plans_term_months_check CHECK (((term_months >= 1) AND (term_months <= 12)));
alter table public.student_repayment_plans add constraint student_repayment_plans_waived_late_fee_total_check CHECK ((waived_late_fee_total >= 0));
alter table public.student_repayment_receipt_links add constraint student_repayment_receipt_links_balance_moves CHECK ((plan_balance_after = (plan_balance_before - contribution_amount)));
alter table public.student_repayment_receipt_links add constraint student_repayment_receipt_links_contribution_amount_check CHECK ((contribution_amount >= 0));
alter table public.student_repayment_receipt_links add constraint student_repayment_receipt_links_plan_balance_after_check CHECK ((plan_balance_after >= 0));
alter table public.student_repayment_receipt_links add constraint student_repayment_receipt_links_plan_balance_before_check CHECK ((plan_balance_before >= 0));
alter table public.student_repayment_receipt_links add constraint student_repayment_receipt_links_spillover_amount_check CHECK ((spillover_amount >= 0));
alter table public.student_repayment_schedule add constraint student_repayment_schedule_amount_check CHECK ((amount > 0));
alter table public.student_repayment_schedule add constraint student_repayment_schedule_sequence_no_check CHECK ((sequence_no > 0));
alter table public.students add constraint students_check CHECK (((left_on IS NULL) OR (joined_on IS NULL) OR (left_on >= joined_on)));
alter table public.transport_routes add constraint transport_routes_annual_fee_amount_check CHECK ((annual_fee_amount >= 0));
alter table public.transport_routes add constraint transport_routes_default_installment_amount_check CHECK ((default_installment_amount >= 0));
alter table public.users add constraint users_preferred_locale_check CHECK (((preferred_locale IS NULL) OR (preferred_locale = ANY (ARRAY['en'::text, 'hi'::text, 'hi-en'::text]))));
alter table public.whatsapp_campaigns add constraint whatsapp_campaigns_language_check CHECK ((language = ANY (ARRAY['hi'::text, 'en'::text])));
alter table public.whatsapp_campaigns add constraint whatsapp_campaigns_late_fee_amount_check CHECK ((late_fee_amount >= 0));
alter table public.whatsapp_campaigns add constraint whatsapp_campaigns_late_fee_basis_check CHECK ((late_fee_basis = ANY (ARRAY['per_installment'::text, 'per_day'::text, 'flat'::text, 'none'::text])));
alter table public.whatsapp_campaigns add constraint whatsapp_campaigns_situation_check CHECK ((situation = ANY (ARRAY['fee_due'::text, 'balance'::text, 'prevyear'::text, 'upcoming'::text, 'upcoming_final'::text, 'late_fee_applied'::text, 'promise_lapsed'::text])));
alter table public.whatsapp_reminder_sends add constraint whatsapp_reminder_sends_destination_role_check CHECK ((destination_role = ANY (ARRAY['primary'::text, 'secondary'::text])));
alter table public.whatsapp_reminder_sends add constraint whatsapp_reminder_sends_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'sent'::text, 'failed'::text, 'covered_by_sibling'::text])));
alter table public.whatsapp_templates add constraint whatsapp_templates_category_check CHECK ((category = ANY (ARRAY['reminder'::text, 'final_reminder'::text, 'receipt'::text, 'custom'::text])));
alter table public.workbook_materialized_view_refresh_queue add constraint workbook_materialized_view_refresh_queue_singleton CHECK ((queue_key = ANY (ARRAY['workbook'::text, 'sibling_groups'::text])));
alter table private.vpps_student_source_mapping add constraint vpps_student_source_mapping_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;
alter table public.academic_sessions add constraint academic_sessions_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.academic_sessions add constraint academic_sessions_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.audit_logs add constraint audit_logs_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.classes add constraint classes_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.classes add constraint classes_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.collection_closures add constraint collection_closures_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.collection_closures add constraint collection_closures_closed_by_fkey FOREIGN KEY (closed_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.collection_closures add constraint collection_closures_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.collection_closures add constraint collection_closures_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.config_change_batches add constraint config_change_batches_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.config_change_batches add constraint config_change_batches_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.config_change_blocked_installments add constraint config_change_blocked_installments_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.config_change_batches(id) ON DELETE CASCADE;
alter table public.config_change_blocked_installments add constraint config_change_blocked_installments_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.config_change_blocked_installments add constraint config_change_blocked_installments_installment_id_fkey FOREIGN KEY (installment_id) REFERENCES public.installments(id) ON DELETE RESTRICT;
alter table public.config_change_blocked_installments add constraint config_change_blocked_installments_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE RESTRICT;
alter table public.config_change_blocked_installments add constraint config_change_blocked_installments_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.conventional_discount_policies add constraint conventional_discount_policies_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.conventional_discount_policies add constraint conventional_discount_policies_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.defaulter_contacts add constraint defaulter_contacts_contacted_by_fkey FOREIGN KEY (contacted_by) REFERENCES auth.users(id);
alter table public.defaulter_contacts add constraint defaulter_contacts_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;
alter table public.defaulter_recovery_state add constraint defaulter_recovery_state_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.defaulter_recovery_state add constraint defaulter_recovery_state_family_group_id_fkey FOREIGN KEY (family_group_id) REFERENCES public.student_family_groups(id) ON DELETE SET NULL;
alter table public.defaulter_recovery_state add constraint defaulter_recovery_state_last_resolved_contact_id_fkey FOREIGN KEY (last_resolved_contact_id) REFERENCES public.defaulter_contacts(id) ON DELETE SET NULL;
alter table public.defaulter_recovery_state add constraint defaulter_recovery_state_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;
alter table public.defaulter_recovery_state add constraint defaulter_recovery_state_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.family_payments add constraint family_payments_family_group_id_fkey FOREIGN KEY (family_group_id) REFERENCES public.student_family_groups(id) ON DELETE RESTRICT;
alter table public.family_payments add constraint family_payments_posted_by_fkey FOREIGN KEY (posted_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.fee_policy_configs add constraint fee_policy_configs_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.fee_policy_configs add constraint fee_policy_configs_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.fee_settings add constraint fee_settings_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE RESTRICT;
alter table public.fee_settings add constraint fee_settings_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.fee_settings add constraint fee_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.import_batches add constraint import_batches_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.import_batches add constraint import_batches_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.import_rows add constraint import_rows_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.import_batches(id) ON DELETE CASCADE;
alter table public.import_rows add constraint import_rows_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.import_rows add constraint import_rows_duplicate_audit_target_student_id_fkey FOREIGN KEY (duplicate_audit_target_student_id) REFERENCES public.students(id) ON DELETE SET NULL;
alter table public.import_rows add constraint import_rows_duplicate_student_id_fkey FOREIGN KEY (duplicate_student_id) REFERENCES public.students(id) ON DELETE SET NULL;
alter table public.import_rows add constraint import_rows_imported_override_id_fkey FOREIGN KEY (imported_override_id) REFERENCES public.student_fee_overrides(id) ON DELETE SET NULL;
alter table public.import_rows add constraint import_rows_imported_student_id_fkey FOREIGN KEY (imported_student_id) REFERENCES public.students(id) ON DELETE SET NULL;
alter table public.import_rows add constraint import_rows_target_student_id_fkey FOREIGN KEY (target_student_id) REFERENCES public.students(id) ON DELETE SET NULL;
alter table public.import_rows add constraint import_rows_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.installments add constraint installments_carry_forward_balance_id_fkey FOREIGN KEY (carry_forward_balance_id) REFERENCES public.student_carry_forward_balances(id) ON DELETE SET NULL;
alter table public.installments add constraint installments_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE RESTRICT;
alter table public.installments add constraint installments_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.installments add constraint installments_fee_setting_id_fkey FOREIGN KEY (fee_setting_id) REFERENCES public.fee_settings(id) ON DELETE RESTRICT;
alter table public.installments add constraint installments_student_fee_override_id_fkey FOREIGN KEY (student_fee_override_id) REFERENCES public.student_fee_overrides(id) ON DELETE SET NULL;
alter table public.installments add constraint installments_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;
alter table public.installments add constraint installments_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.ledger_regeneration_batches add constraint ledger_regeneration_batches_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.ledger_regeneration_batches add constraint ledger_regeneration_batches_policy_revision_id_fkey FOREIGN KEY (policy_revision_id) REFERENCES public.fee_policy_configs(id) ON DELETE SET NULL;
alter table public.ledger_regeneration_batches add constraint ledger_regeneration_batches_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.ledger_regeneration_rows add constraint ledger_regeneration_rows_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.ledger_regeneration_batches(id) ON DELETE CASCADE;
alter table public.ledger_regeneration_rows add constraint ledger_regeneration_rows_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE RESTRICT;
alter table public.ledger_regeneration_rows add constraint ledger_regeneration_rows_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.ledger_regeneration_rows add constraint ledger_regeneration_rows_fee_setting_id_fkey FOREIGN KEY (fee_setting_id) REFERENCES public.fee_settings(id) ON DELETE RESTRICT;
alter table public.ledger_regeneration_rows add constraint ledger_regeneration_rows_installment_id_fkey FOREIGN KEY (installment_id) REFERENCES public.installments(id) ON DELETE RESTRICT;
alter table public.ledger_regeneration_rows add constraint ledger_regeneration_rows_student_fee_override_id_fkey FOREIGN KEY (student_fee_override_id) REFERENCES public.student_fee_overrides(id) ON DELETE SET NULL;
alter table public.ledger_regeneration_rows add constraint ledger_regeneration_rows_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE RESTRICT;
alter table public.ledger_regeneration_rows add constraint ledger_regeneration_rows_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.office_sync_events add constraint office_sync_events_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
alter table public.payment_adjustment_reviews add constraint payment_adjustment_reviews_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.payment_adjustment_reviews add constraint payment_adjustment_reviews_payment_adjustment_id_fkey FOREIGN KEY (payment_adjustment_id) REFERENCES public.payment_adjustments(id) ON DELETE RESTRICT;
alter table public.payment_adjustments add constraint payment_adjustments_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.payment_adjustments add constraint payment_adjustments_payment_fk FOREIGN KEY (payment_id, student_id, installment_id) REFERENCES public.payments(id, student_id, installment_id) ON DELETE RESTRICT;
alter table public.payment_import_batches add constraint payment_import_batches_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);
alter table public.payment_import_rows add constraint payment_import_rows_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.payment_import_batches(id) ON DELETE CASCADE;
alter table public.payment_import_rows add constraint payment_import_rows_receipt_id_fkey FOREIGN KEY (receipt_id) REFERENCES public.receipts(id);
alter table public.payment_import_rows add constraint payment_import_rows_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id);
alter table public.payments add constraint payments_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.payments add constraint payments_family_payment_id_fkey FOREIGN KEY (family_payment_id) REFERENCES public.family_payments(id) ON DELETE RESTRICT;
alter table public.payments add constraint payments_installment_fk FOREIGN KEY (installment_id, student_id) REFERENCES public.installments(id, student_id) ON DELETE RESTRICT;
alter table public.payments add constraint payments_receipt_fk FOREIGN KEY (receipt_id, student_id) REFERENCES public.receipts(id, student_id) ON DELETE RESTRICT;
alter table public.prev_year_import_batches add constraint prev_year_import_batches_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.prev_year_import_batches add constraint prev_year_import_batches_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.prev_year_import_rows add constraint prev_year_import_rows_applied_installment_id_fkey FOREIGN KEY (applied_installment_id) REFERENCES public.installments(id) ON DELETE SET NULL;
alter table public.prev_year_import_rows add constraint prev_year_import_rows_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.prev_year_import_batches(id) ON DELETE CASCADE;
alter table public.prev_year_import_rows add constraint prev_year_import_rows_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.prev_year_import_rows add constraint prev_year_import_rows_matched_student_id_fkey FOREIGN KEY (matched_student_id) REFERENCES public.students(id) ON DELETE SET NULL;
alter table public.prev_year_import_rows add constraint prev_year_import_rows_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.promotion_run_entries add constraint promotion_run_entries_new_class_id_fkey FOREIGN KEY (new_class_id) REFERENCES public.classes(id) ON DELETE SET NULL;
alter table public.promotion_run_entries add constraint promotion_run_entries_previous_class_id_fkey FOREIGN KEY (previous_class_id) REFERENCES public.classes(id) ON DELETE SET NULL;
alter table public.promotion_run_entries add constraint promotion_run_entries_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.promotion_runs(id) ON DELETE CASCADE;
alter table public.promotion_run_entries add constraint promotion_run_entries_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;
alter table public.promotion_runs add constraint promotion_runs_triggered_by_fkey FOREIGN KEY (triggered_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.receipt_adjustments add constraint receipt_adjustments_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.receipt_adjustments add constraint receipt_adjustments_installment_id_fkey FOREIGN KEY (installment_id) REFERENCES public.installments(id) ON DELETE RESTRICT;
alter table public.receipt_adjustments add constraint receipt_adjustments_receipt_id_fkey FOREIGN KEY (receipt_id) REFERENCES public.receipts(id) ON DELETE RESTRICT;
alter table public.receipt_adjustments add constraint receipt_adjustments_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE RESTRICT;
alter table public.receipt_finance_adjustments add constraint receipt_finance_adjustments_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.receipt_finance_adjustments add constraint receipt_finance_adjustments_receipt_id_fkey FOREIGN KEY (receipt_id) REFERENCES public.receipts(id) ON DELETE RESTRICT;
alter table public.receipt_finance_adjustments add constraint receipt_finance_adjustments_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE RESTRICT;
alter table public.receipts add constraint receipts_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.receipts add constraint receipts_family_payment_id_fkey FOREIGN KEY (family_payment_id) REFERENCES public.family_payments(id) ON DELETE RESTRICT;
alter table public.receipts add constraint receipts_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE RESTRICT;
alter table public.refund_requests add constraint refund_requests_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.refund_requests add constraint refund_requests_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.refund_requests add constraint refund_requests_processed_by_fkey FOREIGN KEY (processed_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.refund_requests add constraint refund_requests_receipt_id_fkey FOREIGN KEY (receipt_id) REFERENCES public.receipts(id) ON DELETE RESTRICT;
alter table public.refund_requests add constraint refund_requests_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE RESTRICT;
alter table public.refund_requests add constraint refund_requests_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.school_fee_defaults add constraint school_fee_defaults_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.school_fee_defaults add constraint school_fee_defaults_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.session_reconcile_log add constraint session_reconcile_log_run_by_fkey FOREIGN KEY (run_by) REFERENCES auth.users(id);
alter table public.setup_progress add constraint setup_progress_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.setup_progress add constraint setup_progress_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.student_carry_forward_balances add constraint student_carry_forward_balances_backing_installment_id_fkey FOREIGN KEY (backing_installment_id) REFERENCES public.installments(id) ON DELETE RESTRICT;
alter table public.student_carry_forward_balances add constraint student_carry_forward_balances_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.student_carry_forward_balances add constraint student_carry_forward_balances_import_batch_id_fkey FOREIGN KEY (import_batch_id) REFERENCES public.prev_year_import_batches(id) ON DELETE SET NULL;
alter table public.student_carry_forward_balances add constraint student_carry_forward_balances_import_row_id_fkey FOREIGN KEY (import_row_id) REFERENCES public.prev_year_import_rows(id) ON DELETE SET NULL;
alter table public.student_carry_forward_balances add constraint student_carry_forward_balances_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE RESTRICT;
alter table public.student_carry_forward_balances add constraint student_carry_forward_balances_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.student_collection_flags add constraint student_collection_flags_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.student_collection_flags add constraint student_collection_flags_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;
alter table public.student_collection_flags add constraint student_collection_flags_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.student_conventional_discount_assignments add constraint student_conventional_discount_assignments_applied_by_fkey FOREIGN KEY (applied_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.student_conventional_discount_assignments add constraint student_conventional_discount_assignments_family_group_id_fkey FOREIGN KEY (family_group_id) REFERENCES public.student_family_groups(id) ON DELETE SET NULL;
alter table public.student_conventional_discount_assignments add constraint student_conventional_discount_assignments_policy_id_fkey FOREIGN KEY (policy_id) REFERENCES public.conventional_discount_policies(id) ON DELETE RESTRICT;
alter table public.student_conventional_discount_assignments add constraint student_conventional_discount_assignments_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;
alter table public.student_family_groups add constraint student_family_groups_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.student_family_groups add constraint student_family_groups_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.student_family_members add constraint student_family_members_family_group_id_fkey FOREIGN KEY (family_group_id) REFERENCES public.student_family_groups(id) ON DELETE CASCADE;
alter table public.student_family_members add constraint student_family_members_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;
alter table public.student_fee_overrides add constraint student_fee_overrides_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.student_fee_overrides add constraint student_fee_overrides_fee_setting_id_fkey FOREIGN KEY (fee_setting_id) REFERENCES public.fee_settings(id) ON DELETE RESTRICT;
alter table public.student_fee_overrides add constraint student_fee_overrides_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;
alter table public.student_fee_overrides add constraint student_fee_overrides_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.student_late_fee_waivers add constraint student_late_fee_waivers_installment_fk FOREIGN KEY (installment_id, student_id) REFERENCES public.installments(id, student_id) ON DELETE CASCADE;
alter table public.student_late_fee_waivers add constraint student_late_fee_waivers_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;
alter table public.student_late_fee_waivers add constraint student_late_fee_waivers_voided_by_fkey FOREIGN KEY (voided_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.student_late_fee_waivers add constraint student_late_fee_waivers_waived_by_fkey FOREIGN KEY (waived_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.student_repayment_emi_late_fees add constraint student_repayment_emi_late_fees_backing_installment_id_fkey FOREIGN KEY (backing_installment_id) REFERENCES public.installments(id) ON DELETE RESTRICT;
alter table public.student_repayment_emi_late_fees add constraint student_repayment_emi_late_fees_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.student_repayment_plans(id) ON DELETE RESTRICT;
alter table public.student_repayment_emi_late_fees add constraint student_repayment_emi_late_fees_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE RESTRICT;
alter table public.student_repayment_plan_items add constraint student_repayment_plan_items_installment_fk FOREIGN KEY (installment_id, student_id) REFERENCES public.installments(id, student_id) ON DELETE CASCADE;
alter table public.student_repayment_plan_items add constraint student_repayment_plan_items_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.student_repayment_plans(id) ON DELETE CASCADE;
alter table public.student_repayment_plans add constraint student_repayment_plans_activated_by_fkey FOREIGN KEY (activated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.student_repayment_plans add constraint student_repayment_plans_cancelled_by_fkey FOREIGN KEY (cancelled_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.student_repayment_plans add constraint student_repayment_plans_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;
alter table public.student_repayment_plans add constraint student_repayment_plans_superseded_by_plan_id_fkey FOREIGN KEY (superseded_by_plan_id) REFERENCES public.student_repayment_plans(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;
alter table public.student_repayment_plans add constraint student_repayment_plans_supersedes_plan_id_fkey FOREIGN KEY (supersedes_plan_id) REFERENCES public.student_repayment_plans(id) ON DELETE SET NULL;
alter table public.student_repayment_receipt_links add constraint student_repayment_receipt_links_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.student_repayment_plans(id) ON DELETE CASCADE;
alter table public.student_repayment_receipt_links add constraint student_repayment_receipt_links_receipt_id_fkey FOREIGN KEY (receipt_id) REFERENCES public.receipts(id) ON DELETE CASCADE;
alter table public.student_repayment_receipt_links add constraint student_repayment_receipt_links_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;
alter table public.student_repayment_schedule add constraint student_repayment_schedule_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.student_repayment_plans(id) ON DELETE CASCADE;
alter table public.student_repayment_schedule add constraint student_repayment_schedule_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;
alter table public.student_session_reanchor_log add constraint student_session_reanchor_log_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.import_batches(id) ON DELETE SET NULL;
alter table public.student_session_reanchor_log add constraint student_session_reanchor_log_run_by_fkey FOREIGN KEY (run_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.student_session_reanchor_log add constraint student_session_reanchor_log_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE RESTRICT;
alter table public.student_share_links add constraint student_share_links_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.student_share_links add constraint student_share_links_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;
alter table public.students add constraint students_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE RESTRICT;
alter table public.students add constraint students_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.students add constraint students_transport_route_id_fkey FOREIGN KEY (transport_route_id) REFERENCES public.transport_routes(id) ON DELETE SET NULL;
alter table public.students add constraint students_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.transport_routes add constraint transport_routes_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.transport_routes add constraint transport_routes_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.user_activity_events add constraint user_activity_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.users add constraint users_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.users add constraint users_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.users add constraint users_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.whatsapp_campaign_runs add constraint whatsapp_campaign_runs_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.whatsapp_campaigns(id) ON DELETE SET NULL;
alter table public.whatsapp_reminder_sends add constraint whatsapp_reminder_sends_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.whatsapp_campaign_runs(id) ON DELETE SET NULL;
alter table public.whatsapp_reminder_sends add constraint whatsapp_reminder_sends_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;
alter table public.whatsapp_templates add constraint whatsapp_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);

-- ══ Indexes ═════════════════════════════════════════════════════════════

create index if not exists defaulter_contacts_contacted_by_idx ON public.defaulter_contacts USING btree (contacted_by);
create index if not exists defaulter_contacts_session_idx ON public.defaulter_contacts USING btree (session_label, contacted_at DESC);
create index if not exists defaulter_contacts_student_recent_idx ON public.defaulter_contacts USING btree (student_id, contacted_at DESC);
create index if not exists defaulter_recovery_state_family_idx ON public.defaulter_recovery_state USING btree (family_group_id, session_label) WHERE (family_group_id IS NOT NULL);
create index if not exists defaulter_recovery_state_last_contact_idx ON public.defaulter_recovery_state USING btree (last_resolved_contact_id) WHERE (last_resolved_contact_id IS NOT NULL);
create index if not exists defaulter_recovery_state_session_stage_idx ON public.defaulter_recovery_state USING btree (session_label, recovery_stage);
create UNIQUE index if not exists idx_academic_sessions_current_unique ON public.academic_sessions USING btree (is_current) WHERE is_current;
create index if not exists idx_audit_logs_changed_by ON public.audit_logs USING btree (changed_by, created_at DESC);
create index if not exists idx_audit_logs_created_at ON public.audit_logs USING btree (created_at DESC);
create index if not exists idx_audit_logs_record ON public.audit_logs USING btree (table_name, record_id, created_at DESC);
create index if not exists idx_audit_logs_table_created ON public.audit_logs USING btree (table_name, created_at DESC);
create index if not exists idx_classes_created_by ON public.classes USING btree (created_by);
create index if not exists idx_classes_session_sort ON public.classes USING btree (session_label, sort_order, class_name);
create index if not exists idx_classes_session_status_sort ON public.classes USING btree (session_label, status, sort_order, class_name);
create UNIQUE index if not exists idx_classes_unique_active_per_session_ci ON public.classes USING btree (lower(session_label), lower(class_name), lower(COALESCE(section, ''::text)), lower(COALESCE(stream_name, ''::text))) WHERE (status = 'active'::public.class_status);
create UNIQUE index if not exists idx_classes_unique_per_session ON public.classes USING btree (session_label, class_name, COALESCE(section, ''::text), COALESCE(stream_name, ''::text));
create index if not exists idx_classes_updated_by ON public.classes USING btree (updated_by);
create index if not exists idx_collection_closures_created_by ON public.collection_closures USING btree (created_by);
create index if not exists idx_collection_closures_payment_date ON public.collection_closures USING btree (payment_date DESC);
create index if not exists idx_collection_closures_status ON public.collection_closures USING btree (status, payment_date DESC);
create index if not exists idx_config_change_batches_scope_created ON public.config_change_batches USING btree (change_scope, created_at DESC);
create index if not exists idx_config_change_batches_status_created ON public.config_change_batches USING btree (status, created_at DESC);
create index if not exists idx_config_change_blocked_batch ON public.config_change_blocked_installments USING btree (batch_id, created_at);
create index if not exists idx_config_change_blocked_installments_installment_id ON public.config_change_blocked_installments USING btree (installment_id);
create index if not exists idx_config_change_blocked_student ON public.config_change_blocked_installments USING btree (student_id, due_date);
create index if not exists idx_conventional_discount_policies_session ON public.conventional_discount_policies USING btree (academic_session_label, is_active, sort_order);
create UNIQUE index if not exists idx_fee_policy_configs_active_singleton ON public.fee_policy_configs USING btree (is_active) WHERE is_active;
create index if not exists idx_fee_policy_configs_created_by ON public.fee_policy_configs USING btree (created_by);
create index if not exists idx_fee_policy_configs_updated_by ON public.fee_policy_configs USING btree (updated_by);
create UNIQUE index if not exists idx_fee_settings_active_per_class ON public.fee_settings USING btree (class_id) WHERE is_active;
create index if not exists idx_fee_settings_created_by ON public.fee_settings USING btree (created_by);
create index if not exists idx_fee_settings_updated_by ON public.fee_settings USING btree (updated_by);
create index if not exists idx_import_batches_created_at ON public.import_batches USING btree (created_at DESC);
create index if not exists idx_import_batches_created_by ON public.import_batches USING btree (created_by);
create index if not exists idx_import_batches_status_created_at ON public.import_batches USING btree (status, created_at DESC);
create index if not exists idx_import_batches_target_session_label ON public.import_batches USING btree (target_session_label) WHERE (target_session_label IS NOT NULL);
create index if not exists idx_import_rows_audit_decision ON public.import_rows USING btree (batch_id, duplicate_audit_decision) WHERE (duplicate_audit_decision IS NOT NULL);
create index if not exists idx_import_rows_batch_row_index ON public.import_rows USING btree (batch_id, row_index);
create index if not exists idx_import_rows_batch_status ON public.import_rows USING btree (batch_id, status);
create index if not exists idx_import_rows_duplicate_student ON public.import_rows USING btree (duplicate_student_id) WHERE (duplicate_student_id IS NOT NULL);
create index if not exists idx_import_rows_imported_student ON public.import_rows USING btree (imported_student_id) WHERE (imported_student_id IS NOT NULL);
create index if not exists idx_import_rows_operation ON public.import_rows USING btree (batch_id, import_operation);
create index if not exists idx_import_rows_review_status ON public.import_rows USING btree (batch_id, review_status) WHERE (review_status <> 'pending'::text);
create index if not exists idx_import_rows_target_student ON public.import_rows USING btree (target_student_id) WHERE (target_student_id IS NOT NULL);
create index if not exists idx_installments_carry_forward ON public.installments USING btree (student_id) WHERE (is_carry_forward = true);
create index if not exists idx_installments_carry_forward_balance ON public.installments USING btree (carry_forward_balance_id) WHERE (carry_forward_balance_id IS NOT NULL);
create index if not exists idx_installments_carry_forward_source_target ON public.installments USING btree (target_session_label, source_session_label, carry_forward_fee_head) WHERE (is_carry_forward = true);
create index if not exists idx_installments_class_due_date ON public.installments USING btree (class_id, due_date);
create index if not exists idx_installments_class_status_due_date ON public.installments USING btree (class_id, status, due_date);
create index if not exists idx_installments_created_by ON public.installments USING btree (created_by);
create index if not exists idx_installments_fee_setting ON public.installments USING btree (fee_setting_id);
create index if not exists idx_installments_status_due_date ON public.installments USING btree (status, due_date);
create index if not exists idx_installments_student_class ON public.installments USING btree (student_id, class_id);
create index if not exists idx_installments_student_due_date ON public.installments USING btree (student_id, due_date);
create index if not exists idx_installments_student_fee_override ON public.installments USING btree (student_fee_override_id) WHERE (student_fee_override_id IS NOT NULL);
create index if not exists idx_installments_student_id_status ON public.installments USING btree (student_id, status) WHERE (status <> 'cancelled'::public.installment_status);
create index if not exists idx_installments_student_status_due_date ON public.installments USING btree (student_id, status, due_date);
create index if not exists idx_installments_updated_by ON public.installments USING btree (updated_by);
create index if not exists idx_ledger_regen_batches_created_at ON public.ledger_regeneration_batches USING btree (created_at DESC);
create index if not exists idx_ledger_regeneration_batches_policy_created ON public.ledger_regeneration_batches USING btree (policy_revision_id, created_at DESC);
create index if not exists idx_ledger_regeneration_batches_status_created ON public.ledger_regeneration_batches USING btree (status, created_at DESC);
create index if not exists idx_ledger_regeneration_rows_batch_action ON public.ledger_regeneration_rows USING btree (batch_id, action_needed);
create index if not exists idx_ledger_regeneration_rows_batch_created ON public.ledger_regeneration_rows USING btree (batch_id, created_at);
create index if not exists idx_ledger_regeneration_rows_student_due ON public.ledger_regeneration_rows USING btree (student_id, due_date);
create index if not exists idx_notion_sync_log_started ON public.notion_sync_log USING btree (run_started_at DESC);
create index if not exists idx_office_sync_events_entity ON public.office_sync_events USING btree (entity_type, entity_id);
create index if not exists idx_office_sync_events_session_created ON public.office_sync_events USING btree (session_label, created_at DESC);
create index if not exists idx_payment_adjustment_reviews_adjustment ON public.payment_adjustment_reviews USING btree (payment_adjustment_id);
create index if not exists idx_payment_adjustment_reviews_status ON public.payment_adjustment_reviews USING btree (review_status, created_at DESC);
create index if not exists idx_payment_adjustments_created_by ON public.payment_adjustments USING btree (created_by);
create index if not exists idx_payment_adjustments_installment_id ON public.payment_adjustments USING btree (installment_id, amount_delta);
create index if not exists idx_payment_adjustments_payment_student_installment ON public.payment_adjustments USING btree (payment_id, student_id, installment_id);
create index if not exists idx_payment_adjustments_student ON public.payment_adjustments USING btree (student_id, created_at DESC);
create index if not exists idx_payment_import_rows_batch_id ON public.payment_import_rows USING btree (batch_id, row_number);
create index if not exists idx_payments_created_at ON public.payments USING btree (created_at DESC);
create index if not exists idx_payments_created_by ON public.payments USING btree (created_by);
create index if not exists idx_payments_family_payment_id ON public.payments USING btree (family_payment_id);
create index if not exists idx_payments_installment_student ON public.payments USING btree (installment_id, student_id);
create index if not exists idx_payments_receipt_student ON public.payments USING btree (receipt_id, student_id);
create index if not exists idx_payments_student_created_at ON public.payments USING btree (student_id, created_at DESC);
create index if not exists idx_prev_year_import_batches_session_created ON public.prev_year_import_batches USING btree (session_label, created_at DESC);
create index if not exists idx_prev_year_import_batches_status_created ON public.prev_year_import_batches USING btree (status, created_at DESC);
create index if not exists idx_prev_year_import_rows_batch ON public.prev_year_import_rows USING btree (batch_id, row_index);
create index if not exists idx_prev_year_import_rows_installment ON public.prev_year_import_rows USING btree (applied_installment_id);
create index if not exists idx_prev_year_import_rows_student ON public.prev_year_import_rows USING btree (matched_student_id);
create index if not exists idx_promotion_run_entries_run_student ON public.promotion_run_entries USING btree (run_id, student_id);
create index if not exists idx_promotion_runs_status_triggered_at ON public.promotion_runs USING btree (status, triggered_at DESC);
create index if not exists idx_receipt_adjustments_installment_id ON public.receipt_adjustments USING btree (installment_id, amount_delta);
create index if not exists idx_receipt_adjustments_receipt ON public.receipt_adjustments USING btree (receipt_id, created_at DESC);
create index if not exists idx_receipt_adjustments_student ON public.receipt_adjustments USING btree (student_id, created_at DESC);
create index if not exists idx_receipt_finance_adjustments_student_id ON public.receipt_finance_adjustments USING btree (student_id);
create index if not exists idx_receipts_created_by ON public.receipts USING btree (created_by);
create index if not exists idx_receipts_duplicate_check ON public.receipts USING btree (student_id, payment_date, payment_mode, total_amount, created_at);
create index if not exists idx_receipts_duplicate_guard_lookup ON public.receipts USING btree (student_id, payment_date, payment_mode, total_amount, created_at DESC);
create index if not exists idx_receipts_family_payment_id ON public.receipts USING btree (family_payment_id);
create index if not exists idx_receipts_payment_date ON public.receipts USING btree (payment_date DESC);
create index if not exists idx_receipts_payment_date_created_at ON public.receipts USING btree (payment_date DESC, created_at DESC);
create index if not exists idx_receipts_reference_number ON public.receipts USING btree (reference_number) WHERE (reference_number IS NOT NULL);
create index if not exists idx_receipts_student_id_created_at ON public.receipts USING btree (student_id, created_at DESC);
create index if not exists idx_receipts_student_payment_date_created_at ON public.receipts USING btree (student_id, payment_date DESC, created_at DESC);
create index if not exists idx_refund_requests_created_by ON public.refund_requests USING btree (created_by);
create index if not exists idx_refund_requests_receipt ON public.refund_requests USING btree (receipt_id, refund_date DESC);
create index if not exists idx_refund_requests_refund_date ON public.refund_requests USING btree (refund_date DESC);
create index if not exists idx_refund_requests_status ON public.refund_requests USING btree (status, refund_date DESC);
create index if not exists idx_refund_requests_student_id ON public.refund_requests USING btree (student_id);
create UNIQUE index if not exists idx_school_fee_defaults_active_singleton ON public.school_fee_defaults USING btree (is_active) WHERE is_active;
create index if not exists idx_school_fee_defaults_created_by ON public.school_fee_defaults USING btree (created_by);
create index if not exists idx_school_fee_defaults_updated_by ON public.school_fee_defaults USING btree (updated_by);
create index if not exists idx_session_reconcile_log_session_started ON public.session_reconcile_log USING btree (session_label, started_at DESC);
create UNIQUE index if not exists idx_setup_progress_active_singleton ON public.setup_progress USING btree (is_active) WHERE is_active;
create index if not exists idx_setup_progress_created_by ON public.setup_progress USING btree (created_by);
create index if not exists idx_setup_progress_updated_by ON public.setup_progress USING btree (updated_by);
create UNIQUE index if not exists idx_student_carry_forward_active_unique ON public.student_carry_forward_balances USING btree (student_id, source_session_label, target_session_label, fee_head) WHERE (status <> 'cancelled'::text);
create UNIQUE index if not exists idx_student_carry_forward_installment_unique ON public.student_carry_forward_balances USING btree (backing_installment_id) WHERE (backing_installment_id IS NOT NULL);
create index if not exists idx_student_carry_forward_student ON public.student_carry_forward_balances USING btree (student_id, target_session_label);
create index if not exists idx_student_carry_forward_target_session ON public.student_carry_forward_balances USING btree (target_session_label, status, source_session_label);
create UNIQUE index if not exists idx_student_conventional_discount_active_policy ON public.student_conventional_discount_assignments USING btree (student_id, academic_session_label, policy_id) WHERE is_active;
create index if not exists idx_student_conventional_discount_assignments_family_group ON public.student_conventional_discount_assignments USING btree (family_group_id);
create index if not exists idx_student_conventional_discount_policy ON public.student_conventional_discount_assignments USING btree (policy_id, academic_session_label, is_active);
create index if not exists idx_student_conventional_discount_student_session ON public.student_conventional_discount_assignments USING btree (student_id, academic_session_label, is_active);
create index if not exists idx_student_family_members_group ON public.student_family_members USING btree (family_group_id);
create index if not exists idx_student_family_members_student ON public.student_family_members USING btree (student_id, academic_session_label);
create UNIQUE index if not exists idx_student_family_members_student_session_unique ON public.student_family_members USING btree (student_id, academic_session_label);
create UNIQUE index if not exists idx_student_fee_overrides_active_per_student ON public.student_fee_overrides USING btree (student_id) WHERE is_active;
create index if not exists idx_student_fee_overrides_created_by ON public.student_fee_overrides USING btree (created_by);
create index if not exists idx_student_fee_overrides_fee_setting ON public.student_fee_overrides USING btree (fee_setting_id);
create index if not exists idx_student_fee_overrides_updated_by ON public.student_fee_overrides USING btree (updated_by);
create index if not exists idx_student_repayment_plan_items_installment ON public.student_repayment_plan_items USING btree (installment_id);
create index if not exists idx_student_repayment_plan_items_student ON public.student_repayment_plan_items USING btree (student_id);
create index if not exists idx_student_repayment_plans_session_lifecycle ON public.student_repayment_plans USING btree (session_label, lifecycle);
create index if not exists idx_student_repayment_plans_student ON public.student_repayment_plans USING btree (student_id);
create index if not exists idx_student_repayment_plans_superseded_by ON public.student_repayment_plans USING btree (superseded_by_plan_id) WHERE (superseded_by_plan_id IS NOT NULL);
create index if not exists idx_student_repayment_plans_supersedes ON public.student_repayment_plans USING btree (supersedes_plan_id) WHERE (supersedes_plan_id IS NOT NULL);
create index if not exists idx_student_repayment_receipt_links_receipt ON public.student_repayment_receipt_links USING btree (receipt_id);
create index if not exists idx_student_repayment_receipt_links_student ON public.student_repayment_receipt_links USING btree (student_id);
create index if not exists idx_student_repayment_schedule_plan_due ON public.student_repayment_schedule USING btree (plan_id, due_date);
create index if not exists idx_student_repayment_schedule_student ON public.student_repayment_schedule USING btree (student_id);
create index if not exists idx_student_session_reanchor_log_batch ON public.student_session_reanchor_log USING btree (batch_id, run_at DESC) WHERE (batch_id IS NOT NULL);
create index if not exists idx_student_session_reanchor_log_student ON public.student_session_reanchor_log USING btree (student_id, run_at DESC);
create index if not exists idx_student_share_links_active ON public.student_share_links USING btree (revoked_at, expires_at);
create index if not exists idx_student_share_links_student ON public.student_share_links USING btree (student_id, created_at DESC);
create UNIQUE index if not exists idx_students_aadhaar_no_unique ON public.students USING btree (aadhaar_no) WHERE (aadhaar_no IS NOT NULL);
create index if not exists idx_students_active_class_name ON public.students USING btree (class_id, lower(full_name)) WHERE (status = 'active'::public.student_status);
create index if not exists idx_students_active_route_name ON public.students USING btree (transport_route_id, lower(full_name)) WHERE ((status = 'active'::public.student_status) AND (transport_route_id IS NOT NULL));
create index if not exists idx_students_active_session_dashboard ON public.students USING btree (status, class_id) WHERE (status = 'active'::public.student_status);
create index if not exists idx_students_admission_no_lookup ON public.students USING btree (admission_no);
create index if not exists idx_students_class_id ON public.students USING btree (class_id);
create index if not exists idx_students_class_status ON public.students USING btree (class_id, status);
create index if not exists idx_students_created_by ON public.students USING btree (created_by);
create index if not exists idx_students_full_name ON public.students USING btree (lower(full_name));
create index if not exists idx_students_primary_phone_lookup ON public.students USING btree (primary_phone) WHERE ((primary_phone IS NOT NULL) AND (TRIM(BOTH FROM primary_phone) <> ''::text));
create index if not exists idx_students_transport_route ON public.students USING btree (transport_route_id) WHERE (transport_route_id IS NOT NULL);
create index if not exists idx_students_updated_by ON public.students USING btree (updated_by);
create index if not exists idx_transport_routes_active ON public.transport_routes USING btree (is_active, route_name);
create index if not exists idx_transport_routes_annual_fee_amount ON public.transport_routes USING btree (annual_fee_amount) WHERE (annual_fee_amount IS NOT NULL);
create index if not exists idx_transport_routes_created_by ON public.transport_routes USING btree (created_by);
create UNIQUE index if not exists idx_transport_routes_unique_active_name_ci ON public.transport_routes USING btree (lower(route_name)) WHERE is_active;
create index if not exists idx_transport_routes_updated_by ON public.transport_routes USING btree (updated_by);
create index if not exists idx_users_created_by ON public.users USING btree (created_by);
create index if not exists idx_users_updated_by ON public.users USING btree (updated_by);
create index if not exists idx_v_workbook_financials_session_status ON public.v_workbook_student_financials USING btree (session_label, record_status);
create index if not exists idx_v_workbook_installments_session ON public.v_workbook_installment_balances USING btree (session_label);
create index if not exists idx_v_workbook_installments_student ON public.v_workbook_installment_balances USING btree (student_id);
create index if not exists idx_v_workbook_installments_student_carry ON public.v_workbook_installment_balances USING btree (student_id) WHERE is_carry_forward;
create index if not exists office_sync_events_created_by_idx ON public.office_sync_events USING btree (created_by);
create index if not exists payment_adjustment_reviews_created_by_idx ON public.payment_adjustment_reviews USING btree (created_by);
create index if not exists receipt_adjustments_created_by_idx ON public.receipt_adjustments USING btree (created_by);
create index if not exists receipt_finance_adjustments_created_by_idx ON public.receipt_finance_adjustments USING btree (created_by);
create UNIQUE index if not exists receipts_student_client_request_id_unique ON public.receipts USING btree (student_id, client_request_id) WHERE (client_request_id IS NOT NULL);
create index if not exists scda_applied_by_idx ON public.student_conventional_discount_assignments USING btree (applied_by);
create index if not exists student_collection_flags_session_idx ON public.student_collection_flags USING btree (session_label) WHERE (no_call = true);
create index if not exists student_collection_flags_whatsapp_idx ON public.student_collection_flags USING btree (session_label) WHERE ((whatsapp_cadence <> 'every_run'::text) OR (whatsapp_snoozed_until IS NOT NULL));
create index if not exists student_family_groups_created_by_idx ON public.student_family_groups USING btree (created_by);
create index if not exists student_family_groups_updated_by_idx ON public.student_family_groups USING btree (updated_by);
create index if not exists student_late_fee_waivers_installment_idx ON public.student_late_fee_waivers USING btree (installment_id) WHERE (voided_at IS NULL);
create UNIQUE index if not exists student_late_fee_waivers_request_idx ON public.student_late_fee_waivers USING btree (student_id, client_request_id, installment_id, source) WHERE (client_request_id IS NOT NULL);
create index if not exists student_late_fee_waivers_student_session_idx ON public.student_late_fee_waivers USING btree (student_id, session_label);
create index if not exists student_late_fee_waivers_waived_by_idx ON public.student_late_fee_waivers USING btree (waived_by);
create index if not exists student_repayment_emi_late_fees_plan_idx ON public.student_repayment_emi_late_fees USING btree (plan_id, sequence_no);
create index if not exists student_repayment_emi_late_fees_student_idx ON public.student_repayment_emi_late_fees USING btree (student_id, session_label);
create UNIQUE index if not exists student_repayment_plans_client_request_unique ON public.student_repayment_plans USING btree (student_id, client_request_id) WHERE (client_request_id IS NOT NULL);
create UNIQUE index if not exists student_repayment_plans_one_active_per_student ON public.student_repayment_plans USING btree (student_id) WHERE (lifecycle = 'active'::text);
create index if not exists student_share_links_created_by_idx ON public.student_share_links USING btree (created_by);
create index if not exists user_activity_events_kind_recent_idx ON public.user_activity_events USING btree (kind, created_at DESC);
create index if not exists user_activity_events_ref_recent_idx ON public.user_activity_events USING btree (ref_id, created_at DESC) WHERE (ref_id IS NOT NULL);
create index if not exists user_activity_events_user_recent_idx ON public.user_activity_events USING btree (user_id, created_at DESC);
create UNIQUE index if not exists v_student_financial_state_idx ON public.v_student_financial_state USING btree (student_id);
create UNIQUE index if not exists v_workbook_installment_balances_idx ON public.v_workbook_installment_balances USING btree (installment_id);
create UNIQUE index if not exists v_workbook_student_financials_idx ON public.v_workbook_student_financials USING btree (student_id);
create index if not exists vpps_student_source_mapping_student_id_idx ON private.vpps_student_source_mapping USING btree (student_id);
create index if not exists whatsapp_campaign_runs_campaign_idx ON public.whatsapp_campaign_runs USING btree (campaign_id, started_at DESC);
create index if not exists whatsapp_campaign_runs_session_idx ON public.whatsapp_campaign_runs USING btree (session_label, started_at DESC);
create index if not exists whatsapp_campaigns_session_idx ON public.whatsapp_campaigns USING btree (session_label, archived_at NULLS FIRST, name);
create index if not exists whatsapp_reminder_sends_day_status_idx ON public.whatsapp_reminder_sends USING btree (sent_on DESC, status);
create index if not exists whatsapp_reminder_sends_provider_message_idx ON public.whatsapp_reminder_sends USING btree (provider_message_id) WHERE (provider_message_id IS NOT NULL);
create index if not exists whatsapp_reminder_sends_run_idx ON public.whatsapp_reminder_sends USING btree (run_id);
create UNIQUE index if not exists whatsapp_reminder_sends_student_day_campaign_role_idx ON public.whatsapp_reminder_sends USING btree (student_id, session_label, sent_on, campaign_name, destination_role);
create index if not exists whatsapp_templates_active_idx ON public.whatsapp_templates USING btree (is_active, category, name);

-- ══ Functions ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION private.capture_audit_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'private', 'public', 'pg_temp'
AS $function$
declare
  before_row jsonb;
  after_row jsonb;
  actor_id uuid;
  record_key uuid;
  audit_event public.audit_action;
begin
  before_row := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  after_row := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;

  actor_id := coalesce(
    auth.uid(),
    nullif(
      coalesce(
        after_row ->> 'updated_by',
        before_row ->> 'updated_by',
        after_row ->> 'created_by',
        before_row ->> 'created_by'
      ),
      ''
    )::uuid
  );

  record_key := coalesce(
    nullif(after_row ->> 'id', '')::uuid,
    nullif(before_row ->> 'id', '')::uuid
  );

  audit_event := case tg_op
    when 'INSERT' then 'insert'::public.audit_action
    when 'UPDATE' then 'update'::public.audit_action
    else 'delete'::public.audit_action
  end;

  insert into public.audit_logs (
    table_name,
    record_id,
    action,
    before_data,
    after_data,
    changed_by
  )
  values (
    tg_table_name,
    record_key,
    audit_event,
    before_row,
    after_row,
    actor_id
  );

  return coalesce(new, old);
end;
$function$
;

CREATE OR REPLACE FUNCTION private.current_staff_role()
 RETURNS public.staff_role
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'private'
AS $function$
  select u.role
  from public.users as u
  where u.id = auth.uid()
    and u.is_active = true
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION private.enforce_max_active_conventional_discounts()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'private', 'public', 'pg_temp'
AS $function$
declare
  active_count integer;
begin
  if new.is_active then
    select count(*)::integer
      into active_count
    from public.student_conventional_discount_assignments as assignment
    where assignment.student_id = new.student_id
      and assignment.academic_session_label = new.academic_session_label
      and assignment.is_active = true
      and assignment.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);

    if active_count >= 2 then
      raise exception 'A student can have maximum 2 active conventional discounts for one academic year.';
    end if;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.enforce_max_active_conventional_discounts_in_schema()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'private', 'public', 'pg_temp'
AS $function$
declare
  active_count integer;
begin
  if new.is_active then
    execute format(
      'select count(*)::integer
       from %I.student_conventional_discount_assignments as assignment
       where assignment.student_id = $1
         and assignment.academic_session_label = $2
         and assignment.is_active = true
         and assignment.id <> coalesce($3, ''00000000-0000-0000-0000-000000000000''::uuid)',
      tg_table_schema
    )
    into active_count
    using new.student_id, new.academic_session_label, new.id;

    if active_count >= 2 then
      raise exception 'A student can have maximum 2 active conventional discounts for one academic year.';
    end if;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.enforce_repayment_schedule_order()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'private', 'public', 'pg_temp'
AS $function$
declare
  v_bad record;
begin
  select ordered.plan_id, ordered.sequence_no, ordered.due_date, ordered.prev_due
  into v_bad
  from (
    select
      sch.plan_id,
      sch.sequence_no,
      sch.due_date,
      lag(sch.due_date) over (partition by sch.plan_id order by sch.sequence_no) as prev_due
    from public.student_repayment_schedule sch
    where sch.plan_id in (select distinct nr.plan_id from new_rows nr)
  ) ordered
  where ordered.prev_due is not null and ordered.due_date <= ordered.prev_due
  limit 1;

  if v_bad.plan_id is not null then
    raise exception
      'EMI due dates must move forward: instalment % is dated % but the one before it is dated %.',
      v_bad.sequence_no, v_bad.due_date, v_bad.prev_due;
  end if;

  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.enforce_third_child_traceability()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_policy_code text;
begin
  if not new.is_active then
    return new;
  end if;

  select code
    into v_policy_code
  from public.conventional_discount_policies
  where id = new.policy_id;

  if v_policy_code is null or v_policy_code <> 'third_child' then
    return new;
  end if;

  if new.family_group_id is null and coalesce(new.is_manual_override, false) = false then
    raise exception
      'third_child policy assignment requires family_group_id (auto-apply path) or is_manual_override=true (with manual_override_reason)';
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.ensure_single_current_academic_session()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'private'
AS $function$
begin
  if new.is_current and new.status <> 'active' then
    raise exception 'Current academic session must be active.';
  end if;

  if new.is_current then
    update public.academic_sessions
    set is_current = false
    where id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
      and is_current;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.normalize_staff_role(p_role text)
 RETURNS public.staff_role
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'private'
AS $function$
  select case trim(coalesce(p_role, ''))
    when 'admin' then 'admin'::public.staff_role
    when 'accountant' then 'accountant'::public.staff_role
    when 'teacher' then 'teacher'::public.staff_role
    when 'fee_collector' then 'fee_collector'::public.staff_role
    when 'defaulter_followup' then 'fee_collector'::public.staff_role
    when 'view_only' then 'view_only'::public.staff_role
    when 'read_only_staff' then 'view_only'::public.staff_role
    else 'view_only'::public.staff_role
  end;
$function$
;

CREATE OR REPLACE FUNCTION private.normalize_workbook_class_label(p_class_name text, p_stream_name text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'private', 'public', 'pg_temp'
AS $function$
  select case regexp_replace(
    lower(coalesce(p_class_name, '') || coalesce(p_stream_name, '')),
    '[^a-z0-9]+',
    '',
    'g'
  )
    when 'nursery' then 'Nursery'
    when 'kg1' then 'JKG'
    when 'jkg' then 'JKG'
    when 'lkg' then 'JKG'
    when 'kg2' then 'SKG'
    when 'skg' then 'SKG'
    when 'ukg' then 'SKG'
    when 'class1' then 'Class 1'
    when '1' then 'Class 1'
    when '1st' then 'Class 1'
    when 'first' then 'Class 1'
    when 'class2' then 'Class 2'
    when '2' then 'Class 2'
    when '2nd' then 'Class 2'
    when 'second' then 'Class 2'
    when 'class3' then 'Class 3'
    when '3' then 'Class 3'
    when '3rd' then 'Class 3'
    when 'third' then 'Class 3'
    when 'class4' then 'Class 4'
    when '4' then 'Class 4'
    when '4th' then 'Class 4'
    when 'fourth' then 'Class 4'
    when 'class5' then 'Class 5'
    when '5' then 'Class 5'
    when '5th' then 'Class 5'
    when 'fifth' then 'Class 5'
    when 'class6' then 'Class 6'
    when '6' then 'Class 6'
    when '6th' then 'Class 6'
    when 'sixth' then 'Class 6'
    when 'class7' then 'Class 7'
    when '7' then 'Class 7'
    when '7th' then 'Class 7'
    when 'seventh' then 'Class 7'
    when 'class8' then 'Class 8'
    when '8' then 'Class 8'
    when '8th' then 'Class 8'
    when 'eighth' then 'Class 8'
    when 'class9' then 'Class 9'
    when '9' then 'Class 9'
    when '9th' then 'Class 9'
    when 'ninth' then 'Class 9'
    when 'class10' then 'Class 10'
    when '10' then 'Class 10'
    when '10th' then 'Class 10'
    when 'tenth' then 'Class 10'
    when '11arts' then '11 Arts'
    when '11tharts' then '11 Arts'
    when 'class11arts' then '11 Arts'
    when 'xiarts' then '11 Arts'
    when '11commerce' then '11 Commerce'
    when '11thcommerce' then '11 Commerce'
    when 'class11commerce' then '11 Commerce'
    when 'xicommerce' then '11 Commerce'
    when '11science' then '11 Science'
    when '11thscience' then '11 Science'
    when 'class11science' then '11 Science'
    when 'xiscience' then '11 Science'
    when '12arts' then '12 Arts'
    when '12tharts' then '12 Arts'
    when 'class12arts' then '12 Arts'
    when 'xiiarts' then '12 Arts'
    when '12commerce' then '12 Commerce'
    when '12thcommerce' then '12 Commerce'
    when 'class12commerce' then '12 Commerce'
    when 'xiicommerce' then '12 Commerce'
    when '12science' then '12 Science'
    when '12thscience' then '12 Science'
    when 'class12science' then '12 Science'
    when 'xiiscience' then '12 Science'
    else coalesce(nullif(trim(concat_ws(' ', p_class_name, p_stream_name)), ''), 'Unknown class')
  end;
$function$
;

CREATE OR REPLACE FUNCTION private.prevent_append_only_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'private', 'public', 'pg_temp'
AS $function$
begin
  raise exception '% is append-only and cannot be updated or deleted.', tg_table_name;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.prevent_notion_sync_log_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
begin
  raise exception 'Notion sync log is append-only.';
end;
$function$
;

CREATE OR REPLACE FUNCTION private.prevent_receipt_adjustment_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'private', 'public', 'pg_temp'
AS $function$
begin
  raise exception 'Receipt adjustments are append-only.';
end;
$function$
;

CREATE OR REPLACE FUNCTION private.prevent_repayment_row_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'private', 'public', 'pg_temp'
AS $function$
begin
  raise exception '% rows are written once and cannot be updated.', tg_table_name;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.protect_receipt_money_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'private', 'public', 'pg_temp'
AS $function$
begin
  if tg_op = 'DELETE' then
    raise exception 'receipts is append-only and cannot be deleted.';
  end if;

  if new.id is distinct from old.id
     or new.receipt_number is distinct from old.receipt_number
     or new.student_id is distinct from old.student_id
     or new.payment_date is distinct from old.payment_date
     or new.payment_mode is distinct from old.payment_mode
     or new.total_amount is distinct from old.total_amount
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at
     or new.client_request_id is distinct from old.client_request_id
     or new.family_payment_id is distinct from old.family_payment_id
  then
    raise exception
      'A posted receipt''s money cannot be edited. Reverse it and post a corrected one.';
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.protect_repayment_plan_terms()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'private', 'public', 'pg_temp'
AS $function$
begin
  if new.student_id is distinct from old.student_id
     or new.session_label is distinct from old.session_label
     or new.scope is distinct from old.scope
     or new.opening_balance is distinct from old.opening_balance
     or new.monthly_amount is distinct from old.monthly_amount
     or new.first_due_date is distinct from old.first_due_date
     or new.term_months is distinct from old.term_months
     or new.final_installment_amount is distinct from old.final_installment_amount
     or new.reason is distinct from old.reason
     or new.activated_at is distinct from old.activated_at
     or new.supersedes_plan_id is distinct from old.supersedes_plan_id
  then
    raise exception 'Repayment plan terms are immutable. Reschedule the plan instead of editing it.';
  end if;

  if old.lifecycle <> 'active' and new.lifecycle is distinct from old.lifecycle then
    raise exception 'A % repayment plan cannot change lifecycle again.', old.lifecycle;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.repayment_plan_candidates(p_student_id uuid, p_session_label text, p_scope text, p_as_of date DEFAULT CURRENT_DATE)
 RETURNS TABLE(installment_id uuid, installment_no smallint, installment_label text, due_date date, is_carry_forward boolean, base_charge integer, base_pending integer, charged_late_fee integer, late_fee_flat_amount integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
  select
    snap.installment_id,
    snap.installment_no,
    snap.installment_label,
    snap.due_date,
    coalesce(inst.is_carry_forward, false) as is_carry_forward,
    snap.base_charge,
    greatest(snap.pending_amount, 0)::integer as base_pending,
    greatest(snap.late_fee_pending, 0)::integer as charged_late_fee,
    coalesce(inst.late_fee_flat_amount, 0)::integer as late_fee_flat_amount
  from private.workbook_installment_snapshot(p_student_id, p_as_of, true) as snap
  join public.installments as inst on inst.id = snap.installment_id
  where snap.session_label = p_session_label
    and greatest(snap.pending_amount, 0) > 0
    and not coalesce(inst.is_emi_late_fee, false)
    and (
      p_scope = 'old_and_current'
      or (p_scope = 'old_balance_only'  and coalesce(inst.is_carry_forward, false))
      or (p_scope = 'current_year_only' and not coalesce(inst.is_carry_forward, false))
    )
  order by snap.due_date asc, snap.installment_no asc;
$function$
;

CREATE OR REPLACE FUNCTION private.repayment_plan_remaining(p_plan_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
  select coalesce(
    sum(greatest(snap.pending_amount, 0)),
    0
  )::integer
  from public.student_repayment_plans p
  join public.student_repayment_plan_items i on i.plan_id = p.id
  join lateral private.workbook_installment_snapshot(
    p.student_id,
    (now() at time zone 'Asia/Kolkata')::date,
    true
  ) snap on snap.installment_id = i.installment_id
  where p.id = p_plan_id;
$function$
;

CREATE OR REPLACE FUNCTION private.repayment_plan_schedule(p_first_due_date date, p_monthly_amount integer, p_opening_balance integer)
 RETURNS TABLE(sequence_no smallint, due_date date, amount integer)
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
  with term as (
    select greatest(
      ceil(p_opening_balance::numeric / nullif(p_monthly_amount, 0)::numeric)::integer,
      1
    ) as months
  )
  select
    n::smallint as sequence_no,
    least(
      (date_trunc('month', p_first_due_date::timestamp)::date + ((n - 1) || ' months')::interval)::date
        + (extract(day from p_first_due_date)::integer - 1),
      (date_trunc('month', p_first_due_date::timestamp)::date + (n || ' months')::interval)::date - 1
    ) as due_date,
    (case
      when n < (select months from term) then p_monthly_amount
      else p_opening_balance - p_monthly_amount * ((select months from term) - 1)
    end)::integer as amount
  from generate_series(1, (select months from term)) as n
  order by n;
$function$
;

CREATE OR REPLACE FUNCTION private.set_actor_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'private', 'public', 'pg_temp'
AS $function$
begin
  if tg_op = 'INSERT' then
    if new.created_by is null then
      new.created_by = auth.uid();
    end if;

    if new.updated_by is null then
      new.updated_by = coalesce(auth.uid(), new.created_by);
    end if;
  else
    new.updated_by = coalesce(auth.uid(), new.updated_by, old.updated_by);
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.set_created_by_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'private', 'public', 'pg_temp'
AS $function$
begin
  if new.created_by is null then
    new.created_by = auth.uid();
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'private', 'public', 'pg_temp'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.sync_staff_profile_from_auth_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'private', 'public', 'pg_temp'
AS $function$
declare
  resolved_full_name text;
  resolved_is_active boolean;
begin
  resolved_full_name := coalesce(
    nullif(trim(coalesce(new.raw_user_meta_data->>'full_name', '')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data->>'name', '')), ''),
    nullif(trim(split_part(coalesce(new.email, ''), '@', 1)), ''),
    'School Staff'
  );

  resolved_is_active := case
    when jsonb_typeof(new.raw_app_meta_data -> 'is_active') = 'boolean' then
      (new.raw_app_meta_data->>'is_active')::boolean
    else
      true
  end;

  insert into public.users (
    id,
    full_name,
    role,
    phone,
    is_active,
    last_login_at
  )
  values (
    new.id,
    resolved_full_name,
    private.normalize_staff_role(new.raw_app_meta_data->>'staff_role'),
    nullif(trim(coalesce(new.raw_user_meta_data->>'phone', new.raw_user_meta_data->>'phone_number', '')), ''),
    resolved_is_active,
    new.last_sign_in_at
  )
  on conflict (id) do update
  set
    full_name = excluded.full_name,
    role = excluded.role,
    phone = excluded.phone,
    is_active = excluded.is_active,
    last_login_at = excluded.last_login_at,
    updated_at = now();

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.vpps_apply_chunk(p_kind text, p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'private', 'public', 'pg_temp'
AS $function$
declare
  v_count integer := 0;
begin
  if p_kind = 'students' then
    with up as (
      insert into public.students (
        admission_no, full_name, date_of_birth, father_name, mother_name,
        primary_phone, secondary_phone, class_id, transport_route_id, notes
      )
      select
        r->>'admission_no',
        r->>'full_name',
        nullif(r->>'date_of_birth', '')::date,
        nullif(r->>'father_name', ''),
        nullif(r->>'mother_name', ''),
        nullif(r->>'primary_phone', ''),
        nullif(r->>'secondary_phone', ''),
        (r->>'class_id')::uuid,
        nullif(r->>'transport_route_id', '')::uuid,
        r->>'notes'
      from jsonb_array_elements(p_rows) as r
      on conflict (admission_no) do update
      set full_name = excluded.full_name,
          class_id = excluded.class_id,
          transport_route_id = coalesce(excluded.transport_route_id, public.students.transport_route_id),
          date_of_birth = coalesce(excluded.date_of_birth, public.students.date_of_birth),
          father_name = coalesce(nullif(excluded.father_name, ''), public.students.father_name),
          mother_name = coalesce(nullif(excluded.mother_name, ''), public.students.mother_name),
          primary_phone = coalesce(nullif(excluded.primary_phone, ''), public.students.primary_phone),
          secondary_phone = coalesce(nullif(excluded.secondary_phone, ''), public.students.secondary_phone),
          notes = excluded.notes,
          updated_at = now()
      returning admission_no
    )
    select count(*) into v_count from up;
  elsif p_kind = 'mapping' then
    with up as (
      insert into private.vpps_student_source_mapping (
        source_student_uid, import_name, student_id, workbook_filename, matched_via, notes
      )
      select
        r->>'source_student_uid',
        'vpps-latest-2026-05-15-fullbook',
        s.id,
        'VPPS_Latest_Students_Updated_from_PSP_and_New_Admissions_2026-27.xlsx',
        r->>'matched_via',
        'review_status=' || coalesce(r->>'review_status', 'ok')
      from jsonb_array_elements(p_rows) as r
      join public.students s on s.admission_no = (r->>'admission_no')
      on conflict (source_student_uid, import_name) do update
      set student_id = excluded.student_id,
          matched_via = excluded.matched_via,
          notes = excluded.notes,
          updated_at = now()
      returning source_student_uid
    )
    select count(*) into v_count from up;
  elsif p_kind = 'left' then
    update public.students s
    set status = 'left',
        notes = coalesce(s.notes, '') || E'\n[left vpps-latest-2026-05-15-fullbook] ' || (r->>'reason'),
        updated_at = now()
    from jsonb_array_elements(p_rows) as r
    where s.status <> 'left'
      and (
        s.admission_no = nullif(r->>'admission_no', '')
        or s.id in (
          select student_id from private.vpps_student_source_mapping
          where source_student_uid = nullif(r->>'source_student_uid', '')
            and import_name = 'vpps-latest-2026-05-15-fullbook'
        )
      );
    get diagnostics v_count = row_count;
  elsif p_kind = 'stage_dues' then
    insert into private.vpps_direct_import_stage_dues (import_name, source_key, payload)
    select 'vpps-latest-2026-05-15-fullbook', r->>'source_key', r->'payload'
    from jsonb_array_elements(p_rows) as r
    on conflict (import_name, source_key) do update set payload = excluded.payload;
    get diagnostics v_count = row_count;
  else
    raise exception 'Unknown kind: %', p_kind;
  end if;
  return jsonb_build_object('kind', p_kind, 'rowsProcessed', jsonb_array_length(p_rows), 'applied', v_count);
end;
$function$
;

CREATE OR REPLACE FUNCTION private.workbook_installment_snapshot(p_student_id uuid DEFAULT NULL::uuid, p_as_of_date date DEFAULT CURRENT_DATE, p_include_candidate_late boolean DEFAULT false)
 RETURNS TABLE(installment_id uuid, student_id uuid, admission_no text, student_name text, father_name text, father_phone text, session_label text, class_id uuid, class_name text, class_label text, section text, stream_name text, installment_no smallint, installment_label text, due_date date, base_charge integer, paid_amount integer, adjustment_amount integer, applied_amount integer, raw_late_fee integer, waiver_applied integer, final_late_fee integer, total_charge integer, pending_amount integer, late_fee_pending integer, total_pending integer, balance_status text, late_fee_status text, last_payment_date date, transport_route_id uuid, transport_route_name text, transport_route_code text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'private'
AS $function$
  with session_policy as (
    select distinct on (academic_session_label) academic_session_label
    from public.fee_policy_configs
    where calculation_model = 'workbook_v1'
    order by academic_session_label, updated_at desc
  ),
  session_installments as (
    select
      i.id as installment_id, i.student_id, s.admission_no,
      s.full_name as student_name, s.father_name, s.primary_phone as father_phone,
      c.session_label, i.class_id, c.class_name,
      private.normalize_workbook_class_label(c.class_name, c.stream_name) as class_label,
      coalesce(c.section, '') as section, coalesce(c.stream_name, '') as stream_name,
      i.installment_no, i.installment_label, i.due_date,
      i.amount_due as base_charge, i.status as installment_status,
      i.late_fee_flat_amount, coalesce(i.is_emi_late_fee, false) as is_emi_late_fee,
      s.transport_route_id,
      route_row.route_name as transport_route_name,
      route_row.route_code as transport_route_code
    from public.installments as i
    join public.students as s on s.id = i.student_id
    join public.classes as c on c.id = i.class_id
    join session_policy as policy_row on policy_row.academic_session_label = c.session_label
    left join public.transport_routes as route_row on route_row.id = s.transport_route_id
    where i.status <> 'cancelled'
      and (p_student_id is null or i.student_id = p_student_id)
  ),
  rolled as (
    select
      session_installments.*,
      coalesce(payment_row.paid_amount, 0)::integer as paid_amount,
      coalesce(adjustment_row.adjustment_amount, 0)::integer as adjustment_amount,
      greatest(
        coalesce(payment_row.paid_amount, 0)
          + coalesce(adjustment_row.cash_adjustment, 0), 0
      )::integer as applied_amount,
      greatest(
        coalesce(payment_row.discount_closeout_amount, 0)
          + coalesce(adjustment_row.closeout_adjustment, 0), 0
      )::integer as discount_closeout_amount,
      greatest(
        coalesce(payment_row.paid_by_due_amount, 0)
          + coalesce(payment_row.closeout_by_due_amount, 0)
          + coalesce(adj_by_due_row.adjustment_by_due_amount, 0),
        0
      )::integer as settled_by_due_amount,
      payment_row.last_payment_date
    from session_installments
    left join lateral (
      select
        coalesce(sum(payment_row.amount) filter (where receipt_row.payment_mode <> 'discount'), 0) as paid_amount,
        coalesce(sum(payment_row.amount) filter (where receipt_row.payment_mode = 'discount'), 0) as discount_closeout_amount,
        coalesce(sum(payment_row.amount) filter (
          where receipt_row.payment_date <= session_installments.due_date
            and receipt_row.payment_mode <> 'discount'), 0) as paid_by_due_amount,
        coalesce(sum(payment_row.amount) filter (
          where receipt_row.payment_date <= session_installments.due_date
            and receipt_row.payment_mode = 'discount'), 0) as closeout_by_due_amount,
        max(receipt_row.payment_date) as last_payment_date
      from public.payments as payment_row
      join public.receipts as receipt_row on receipt_row.id = payment_row.receipt_id
      where payment_row.installment_id = session_installments.installment_id
    ) as payment_row on true
    left join lateral (
      select
        coalesce(sum(adj.amount_delta), 0) as adjustment_amount,
        coalesce(sum(adj.amount_delta) filter (where adj_receipt.payment_mode <> 'discount'), 0) as cash_adjustment,
        coalesce(sum(adj.amount_delta) filter (where adj_receipt.payment_mode = 'discount'), 0) as closeout_adjustment
      from public.payment_adjustments as adj
      join public.payments as adj_payment on adj_payment.id = adj.payment_id
      join public.receipts as adj_receipt on adj_receipt.id = adj_payment.receipt_id
      where adj.installment_id = session_installments.installment_id
    ) as adjustment_row on true
    left join lateral (
      select coalesce(sum(adj.amount_delta), 0) as adjustment_by_due_amount
      from public.payment_adjustments as adj
      join public.payments as adj_payment on adj_payment.id = adj.payment_id
      join public.receipts as adj_receipt on adj_receipt.id = adj_payment.receipt_id
      where adj.installment_id = session_installments.installment_id
        and adj_receipt.payment_date <= session_installments.due_date
    ) as adj_by_due_row on true
  ),
  late_eval as (
    select
      rolled.*,
      case
        when rolled.installment_status = 'waived' then 0
        when coalesce(rolled.late_fee_flat_amount, 0) <= 0 then 0
        when rolled.is_emi_late_fee then
          case when current_date > rolled.due_date
               then rolled.late_fee_flat_amount else 0 end
        when rolled.base_charge <= 0 then 0
        when rolled.settled_by_due_amount >= rolled.base_charge then 0
        when current_date > rolled.due_date then rolled.late_fee_flat_amount
        else 0
      end::integer as raw_late_fee
    from rolled
  ),
  waiver_eval as (
    select
      late_eval.*,
      least(late_eval.raw_late_fee, coalesce(waiver_row.waiver_amount, 0))::integer as waiver_applied
    from late_eval
    left join public.v_effective_late_fee_waivers as waiver_row
      on waiver_row.installment_id = late_eval.installment_id
  ),
  split as (
    select
      waiver_eval.*,
      greatest(waiver_eval.raw_late_fee - waiver_eval.waiver_applied, 0)::integer as final_late_fee,
      greatest(waiver_eval.applied_amount + waiver_eval.discount_closeout_amount, 0)::integer as settled_amount
    from waiver_eval
  ),
  spill as (
    select
      split.*,
      greatest(split.settled_amount - (split.base_charge + split.final_late_fee), 0)::integer
        as row_surplus,
      greatest((split.base_charge + split.final_late_fee) - split.settled_amount, 0)::integer
        as row_room
    from split
  ),
  carry as (
    select
      spill.*,
      least(
        coalesce(sum(spill.row_surplus) over w_before, 0),
        coalesce(sum(spill.row_room)   over w_through, 0)
      )::integer as cum_filled,
      least(
        coalesce(sum(spill.row_surplus) over w_before_prev, 0),
        coalesce(sum(spill.row_room)    over w_before,      0)
      )::integer as cum_filled_prev
    from spill
    window
      w_before      as (partition by spill.student_id order by spill.due_date, spill.installment_no
                        rows between unbounded preceding and 1 preceding),
      w_through     as (partition by spill.student_id order by spill.due_date, spill.installment_no
                        rows between unbounded preceding and current row),
      w_before_prev as (partition by spill.student_id order by spill.due_date, spill.installment_no
                        rows between unbounded preceding and 2 preceding)
  ),
  settled as (
    select
      carry.*,
      (carry.settled_amount + greatest(carry.cum_filled - carry.cum_filled_prev, 0))::integer
        as effective_settled
    from carry
  )
  select
    settled.installment_id, settled.student_id, settled.admission_no,
    settled.student_name, settled.father_name, settled.father_phone,
    settled.session_label, settled.class_id, settled.class_name,
    settled.class_label, settled.section, settled.stream_name,
    settled.installment_no, settled.installment_label, settled.due_date,
    settled.base_charge, settled.paid_amount, settled.adjustment_amount,
    settled.applied_amount, settled.raw_late_fee, settled.waiver_applied,
    settled.final_late_fee,
    greatest(settled.base_charge + settled.raw_late_fee - settled.waiver_applied, 0)::integer as total_charge,
    greatest(settled.base_charge - settled.effective_settled, 0)::integer as pending_amount,
    greatest(settled.final_late_fee - greatest(settled.effective_settled - settled.base_charge, 0), 0)::integer as late_fee_pending,
    (greatest(settled.base_charge - settled.effective_settled, 0)
       + greatest(settled.final_late_fee - greatest(settled.effective_settled - settled.base_charge, 0), 0))::integer as total_pending,
    case
      when settled.installment_status = 'waived' then 'waived'
      when greatest(settled.base_charge - settled.effective_settled, 0) <= 0 then 'paid'
      when p_as_of_date > settled.due_date then 'overdue'
      when settled.effective_settled > 0 then 'partial'
      else 'pending'
    end as balance_status,
    case
      when settled.raw_late_fee <= 0 then 'none'
      when greatest(settled.final_late_fee - greatest(settled.effective_settled - settled.base_charge, 0), 0) > 0 then 'pending'
      when settled.waiver_applied >= settled.raw_late_fee then 'waived'
      else 'paid'
    end as late_fee_status,
    settled.last_payment_date, settled.transport_route_id,
    settled.transport_route_name, settled.transport_route_code
  from settled
  order by settled.student_id, settled.installment_no;
$function$
;

CREATE OR REPLACE FUNCTION public.active_session_label()
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
  select value from public.app_settings where key = 'active_session_label'
$function$
;

CREATE OR REPLACE FUNCTION public.cancel_student_repayment_plan(p_plan_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_plan record;
  v_remaining integer;
  v_waived integer;
  v_reason text;
begin
  if not public.has_permission('fees:repayment_plan') then
    raise exception 'You do not have permission to manage EMI repayment plans.';
  end if;

  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  if v_reason is null or length(v_reason) < 4 then
    raise exception 'A reason of at least 4 characters is required to cancel an EMI plan.';
  end if;

  select * into v_plan from public.student_repayment_plans where id = p_plan_id;

  if v_plan.id is null then
    raise exception 'EMI plan not found.';
  end if;

  if v_plan.lifecycle <> 'active' then
    raise exception 'Only an active EMI plan can be cancelled (this one is %).', v_plan.lifecycle;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_plan.student_id::text, 0));

  v_remaining := private.repayment_plan_remaining(p_plan_id);

  select coalesce(sum(w.amount), 0)::integer
  into v_waived
  from public.student_late_fee_waivers w
  join public.student_repayment_plan_items i
    on i.installment_id = w.installment_id
   and i.plan_id = p_plan_id
  where w.source = 'repayment_plan'
    and w.voided_at is null;

  update public.student_repayment_plans
  set lifecycle = 'cancelled',
      cancelled_at = now(),
      cancelled_by = auth.uid(),
      cancellation_reason = v_reason
  where id = p_plan_id;

  return jsonb_build_object(
    'planId', p_plan_id,
    'studentId', v_plan.student_id,
    'remainingBalance', v_remaining,
    'lateFeeWaiversKept', v_waived,
    'message', 'Plan cancelled. Remaining dues go back to their original due dates; the late fees already waived stay waived.'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_student_repayment_plan(p_student_id uuid, p_session_label text, p_scope text, p_monthly_amount integer, p_first_due_date date, p_reason text, p_expected_opening_balance integer, p_client_request_id uuid DEFAULT NULL::uuid, p_supersedes_plan_id uuid DEFAULT NULL::uuid, p_due_dates date[] DEFAULT NULL::date[])
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_plan_id uuid;
  v_opening integer;
  v_late integer;
  v_term integer;
  v_final integer;
  v_actor_label text;
  v_reason text;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_candidates jsonb;
  v_candidate record;
  v_schedule record;
  v_first_due date;
begin
  if not public.has_permission('fees:repayment_plan') then
    raise exception 'You do not have permission to manage EMI repayment plans.';
  end if;

  if p_scope not in ('old_balance_only', 'current_year_only', 'old_and_current') then
    raise exception 'Unknown repayment plan scope: %.', p_scope;
  end if;

  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  if v_reason is null or length(v_reason) < 4 then
    raise exception 'A reason of at least 4 characters is required to convert dues to EMI.';
  end if;

  if p_monthly_amount is null or p_monthly_amount <= 0 then
    raise exception 'Monthly EMI amount must be greater than 0.';
  end if;

  v_first_due := coalesce(p_due_dates[1], p_first_due_date);

  if v_first_due is null then
    raise exception 'First EMI due date is required.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_student_id::text, 0));

  if p_client_request_id is not null then
    select id into v_plan_id
    from public.student_repayment_plans
    where student_id = p_student_id
      and client_request_id = p_client_request_id
    limit 1;

    if v_plan_id is not null then
      return v_plan_id;
    end if;
  end if;

  if p_supersedes_plan_id is null
     and exists (
       select 1 from public.student_repayment_plans
       where student_id = p_student_id and lifecycle = 'active'
     )
  then
    raise exception 'This student already has an active EMI plan. Reschedule or cancel it first.';
  end if;

  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'installment_id', c.installment_id,
          'installment_no', c.installment_no,
          'installment_label', c.installment_label,
          'due_date', c.due_date,
          'is_carry_forward', c.is_carry_forward,
          'base_charge', c.base_charge,
          'base_pending', c.base_pending,
          'charged_late_fee', c.charged_late_fee,
          'late_fee_flat_amount', c.late_fee_flat_amount
        )
        order by c.due_date, c.installment_no
      ),
      '[]'::jsonb
    ),
    coalesce(sum(c.base_pending), 0)::integer,
    coalesce(sum(c.charged_late_fee), 0)::integer
  into v_candidates, v_opening, v_late
  from private.repayment_plan_candidates(p_student_id, p_session_label, p_scope, v_today) as c;

  if v_opening <= 0 then
    raise exception 'This student has no unpaid dues in the selected scope.';
  end if;

  if p_expected_opening_balance is not null and p_expected_opening_balance <> v_opening then
    raise exception
      'Dues changed while this plan was being set up (preview showed Rs %, now Rs %). Reload and review the new figures.',
      p_expected_opening_balance, v_opening;
  end if;

  v_term := greatest(ceil(v_opening::numeric / p_monthly_amount::numeric)::integer, 1);

  if v_term > 12 then
    raise exception
      'At Rs % a month this plan needs % months. The maximum term is 12 months.',
      p_monthly_amount, v_term;
  end if;

  if p_due_dates is not null and array_length(p_due_dates, 1) is distinct from v_term then
    raise exception
      'This plan needs % instalment dates but % were supplied.',
      v_term, coalesce(array_length(p_due_dates, 1), 0);
  end if;

  v_final := v_opening - p_monthly_amount * (v_term - 1);

  select nullif(btrim(coalesce(u.full_name, '')), '')
  into v_actor_label
  from public.users u
  where u.id = auth.uid();

  insert into public.student_repayment_plans (
    student_id, session_label, scope,
    opening_balance, monthly_amount, first_due_date,
    term_months, final_installment_amount, waived_late_fee_total,
    reason, client_request_id, lifecycle, supersedes_plan_id,
    activated_by, activated_by_label
  )
  values (
    p_student_id, p_session_label, p_scope,
    v_opening, p_monthly_amount, v_first_due,
    v_term::smallint, v_final, v_late,
    v_reason, p_client_request_id, 'active', p_supersedes_plan_id,
    auth.uid(), v_actor_label
  )
  returning id into v_plan_id;

  for v_candidate in
    select *
    from jsonb_to_recordset(v_candidates) as c(
      installment_id uuid,
      installment_no smallint,
      installment_label text,
      due_date date,
      is_carry_forward boolean,
      base_charge integer,
      base_pending integer,
      charged_late_fee integer,
      late_fee_flat_amount integer
    )
  loop
    insert into public.student_repayment_plan_items (
      plan_id, student_id, installment_id,
      installment_no, installment_label, due_date, is_carry_forward,
      snapshot_base_charge, included_base_balance, waived_late_fee
    )
    values (
      v_plan_id, p_student_id, v_candidate.installment_id,
      v_candidate.installment_no, v_candidate.installment_label,
      v_candidate.due_date, v_candidate.is_carry_forward,
      v_candidate.base_charge, v_candidate.base_pending, v_candidate.charged_late_fee
    );

    if coalesce(v_candidate.late_fee_flat_amount, 0) > 0 then
      insert into public.student_late_fee_waivers (
        student_id, installment_id, session_label, amount, reason, source, waived_by, waived_by_label
      )
      values (
        p_student_id, v_candidate.installment_id, p_session_label,
        v_candidate.late_fee_flat_amount,
        format('EMI plan: late fee permanently waived on conversion to monthly EMI. %s', v_reason),
        'repayment_plan', auth.uid(), v_actor_label
      );
    end if;
  end loop;

  for v_schedule in
    select * from private.repayment_plan_schedule(v_first_due, p_monthly_amount, v_opening)
  loop
    insert into public.student_repayment_schedule (
      plan_id, student_id, sequence_no, due_date, amount
    )
    values (
      v_plan_id, p_student_id, v_schedule.sequence_no,
      coalesce(p_due_dates[v_schedule.sequence_no], v_schedule.due_date),
      v_schedule.amount
    );
  end loop;

  return v_plan_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.delete_academic_session_safe(p_session_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare
  v_label text;
  v_is_current boolean;
  v_created_at timestamptz;
  v_payment_count integer;
  v_receipt_count integer;
begin
  if not public.has_permission('settings:write') then
    raise exception 'You do not have permission to delete academic sessions.';
  end if;

  select session_label, is_current, created_at
  into v_label, v_is_current, v_created_at
  from public.academic_sessions
  where id = p_session_id;

  if v_label is null then
    raise exception 'Academic session not found.';
  end if;

  if v_is_current or lower(v_label) = lower(public.active_session_label()) then
    raise exception 'The live session cannot be deleted. Mark another session current first.';
  end if;

  if v_created_at < now() - interval '30 days' then
    raise exception 'Only sessions created in the last 30 days can be deleted. Archive this session instead.';
  end if;

  select count(*) into v_receipt_count
  from public.receipts r
  join public.students s on s.id = r.student_id
  join public.classes c on c.id = s.class_id
  where c.session_label = v_label;

  select count(*) into v_payment_count
  from public.payments p
  join public.installments i on i.id = p.installment_id
  join public.classes c on c.id = i.class_id
  where c.session_label = v_label;

  if v_payment_count > 0 or v_receipt_count > 0 then
    raise exception 'This session has posted payments or receipts and cannot be deleted. Archive it instead.';
  end if;

  -- Deleting students cascades installments, fee overrides, conventional
  -- discount assignments, and family memberships (all ON DELETE CASCADE).
  delete from public.students s
  using public.classes c
  where s.class_id = c.id
    and c.session_label = v_label;

  -- Fee settings reference classes (RESTRICT) and were referenced by the now
  -- deleted installments.
  delete from public.fee_settings fs
  using public.classes c
  where fs.class_id = c.id
    and c.session_label = v_label;

  delete from public.conventional_discount_policies
  where academic_session_label = v_label;

  delete from public.student_family_groups
  where academic_session_label = v_label;

  delete from public.classes
  where session_label = v_label;

  delete from public.fee_policy_configs
  where academic_session_label = v_label;

  delete from public.academic_sessions
  where id = p_session_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.generate_schema_snapshot()
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  snapshot text := '';
  section text;
  schema_version text := 'unknown';
begin
  -- `supabase_migrations` is not granted to service_role, and the caller of
  -- this function is service_role. A stamped version is a nicety; failing the
  -- entire snapshot because we could not read one is not. Degrade instead.
  begin
    select max(version) into schema_version from supabase_migrations.schema_migrations;
  exception when others then
    schema_version := 'unknown';
  end;

  snapshot := snapshot || E'-- Shri Veer Patta Senior Secondary School — fee management schema\n';
  snapshot := snapshot || E'--\n';
  snapshot := snapshot || E'-- GENERATED ARTIFACT. Do not hand-edit, and do not treat it as the source of\n';
  snapshot := snapshot || E'-- truth — `supabase/migrations/` is. This is a readable snapshot of what those\n';
  snapshot := snapshot || E'-- migrations add up to, for reading and for grepping.\n';
  snapshot := snapshot || E'--\n';
  snapshot := snapshot || E'-- Regenerate with:  node scripts/generate-schema-snapshot.mjs\n';
  snapshot := snapshot || E'--\n';
  snapshot := snapshot || E'-- Built by introspecting pg_catalog, NOT by pg_dump: `supabase db dump` needs\n';
  snapshot := snapshot || E'-- Docker, and on a machine without it that command truncates its own target\n';
  snapshot := snapshot || E'-- file to zero bytes. Every object definition below is the server''s own text,\n';
  snapshot := snapshot || E'-- so it is exact. Objects are grouped by kind and views are emitted in\n';
  snapshot := snapshot || E'-- dependency order; this has NOT been verified to replay top-to-bottom into an\n';
  snapshot := snapshot || E'-- empty database, and `supabase db push` is the supported way to build one.\n';
  snapshot := snapshot || E'--\n';
  snapshot := snapshot || '-- Schema version: ' || coalesce(schema_version, 'unknown') || E'\n';
  snapshot := snapshot || '-- Objects: ' ||
    (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname in ('public', 'private') and c.relkind in ('r', 'v', 'm')) ||
    E' tables/views, ' ||
    (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public', 'private')) || E' functions\n';

  -- ── Extensions ───────────────────────────────────────────────────────────
  select coalesce(string_agg(
    format('create extension if not exists %I with schema %I;', e.extname, n.nspname),
    E'\n' order by e.extname), '')
  into section
  from pg_extension e
  join pg_namespace n on n.oid = e.extnamespace
  where e.extname <> 'plpgsql';

  snapshot := snapshot || E'\n\n-- ══ Extensions ══════════════════════════════════════════════════════════\n\n'
    || section;

  -- ── Schemas ──────────────────────────────────────────────────────────────
  select coalesce(string_agg(format('create schema if not exists %I;', nspname), E'\n' order by nspname), '')
  into section
  from pg_namespace
  where nspname in ('private');

  snapshot := snapshot || E'\n\n-- ══ Schemas ═════════════════════════════════════════════════════════════\n\n'
    || section;

  -- ── Enum types ───────────────────────────────────────────────────────────
  select coalesce(string_agg(definition, E'\n' order by definition), '')
  into section
  from (
    select format(
      'create type %I.%I as enum (%s);',
      n.nspname, t.typname,
      string_agg(quote_literal(e.enumlabel), ', ' order by e.enumsortorder)
    ) as definition
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    join pg_enum e on e.enumtypid = t.oid
    where n.nspname in ('public', 'private')
    group by n.nspname, t.typname
  ) enums;

  snapshot := snapshot || E'\n\n-- ══ Types ═══════════════════════════════════════════════════════════════\n\n'
    || section;

  -- ── Tables ───────────────────────────────────────────────────────────────
  -- Columns carry their generated expression where they have one: several
  -- money columns here are GENERATED ALWAYS AS ... STORED, and a snapshot that
  -- printed them as plain integers would misdescribe the ledger.
  snapshot := snapshot || E'\n\n-- ══ Tables ══════════════════════════════════════════════════════════════\n';

  for section in
    select format(
      E'\n-- %s.%s\ncreate table if not exists %I.%I (\n%s\n);',
      n.nspname, c.relname, n.nspname, c.relname,
      (
        select string_agg(
          '  ' || quote_ident(a.attname) || ' ' || format_type(a.atttypid, a.atttypmod)
          || case
               when a.attgenerated = 's'
                 then ' generated always as (' || pg_get_expr(ad.adbin, ad.adrelid) || ') stored'
               when ad.adbin is not null
                 then ' default ' || pg_get_expr(ad.adbin, ad.adrelid)
               else ''
             end
          || case when a.attnotnull then ' not null' else '' end,
          E',\n' order by a.attnum)
        from pg_attribute a
        left join pg_attrdef ad on ad.adrelid = a.attrelid and ad.adnum = a.attnum
        where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
      )
    )
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('public', 'private') and c.relkind = 'r'
    order by n.nspname, c.relname
  loop
    snapshot := snapshot || section || E'\n';
  end loop;

  -- ── Constraints ──────────────────────────────────────────────────────────
  -- Primary keys and uniques first, then checks, then foreign keys, so the
  -- referenced key always exists before the reference to it.
  select coalesce(string_agg(
    format('alter table %I.%I add constraint %I %s;', n.nspname, c.relname, con.conname,
           pg_get_constraintdef(con.oid)),
    E'\n' order by
      case con.contype when 'p' then 0 when 'u' then 1 when 'c' then 2 else 3 end,
      n.nspname, c.relname, con.conname), '')
  into section
  from pg_constraint con
  join pg_class c on c.oid = con.conrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'private') and c.relkind = 'r';

  snapshot := snapshot || E'\n\n-- ══ Constraints ═════════════════════════════════════════════════════════\n\n'
    || section;

  -- ── Indexes ──────────────────────────────────────────────────────────────
  -- Constraint-backing indexes are skipped: they were created above with their
  -- constraint, and emitting them again would fail on replay.
  -- `if not exists` is grafted on: pg_get_indexdef never emits it, and without
  -- it the snapshot cannot be replayed twice or applied over a partial schema.
  select coalesce(string_agg(
    regexp_replace(pg_get_indexdef(i.indexrelid), '^CREATE (UNIQUE )?INDEX ',
                   'create \1index if not exists ') || ';',
    E'\n' order by ic.relname), '')
  into section
  from pg_index i
  join pg_class ic on ic.oid = i.indexrelid
  join pg_class tc on tc.oid = i.indrelid
  join pg_namespace n on n.oid = tc.relnamespace
  where n.nspname in ('public', 'private')
    and not exists (select 1 from pg_constraint con where con.conindid = i.indexrelid);

  snapshot := snapshot || E'\n\n-- ══ Indexes ═════════════════════════════════════════════════════════════\n\n'
    || section;

  -- ── Functions ────────────────────────────────────────────────────────────
  -- Before the views, because a view may call one.
  select coalesce(string_agg(pg_get_functiondef(p.oid) || E';\n', E'\n' order by n.nspname, p.proname), '')
  into section
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private') and p.prokind = 'f';

  snapshot := snapshot || E'\n\n-- ══ Functions ═══════════════════════════════════════════════════════════\n\n'
    || section;

  -- ── Views and materialized views, in dependency order ────────────────────
  -- A view built on another view has to come second. Depth is the longest
  -- chain of view-on-view dependencies, computed from pg_rewrite.
  snapshot := snapshot || E'\n\n-- ══ Views ═══════════════════════════════════════════════════════════════\n';

  for section in
    with recursive edges as (
      select distinct r.ev_class as view_oid, d.refobjid as depends_on
      from pg_rewrite r
      join pg_depend d on d.objid = r.oid and d.classid = 'pg_rewrite'::regclass
      join pg_class dc on dc.oid = d.refobjid and dc.relkind in ('v', 'm')
      where r.ev_class <> d.refobjid
    ),
    depth as (
      select c.oid, 0 as lvl
      from pg_class c
      where c.relkind in ('v', 'm')
        and not exists (select 1 from edges e where e.view_oid = c.oid)
      union all
      select e.view_oid, d.lvl + 1
      from edges e
      join depth d on d.oid = e.depends_on
      where d.lvl < 20
    ),
    ranked as (
      select oid, max(lvl) as lvl from depth group by oid
    )
    -- A plain view gets `or replace`; a MATERIALIZED view has no such form, so
    -- it gets `if not exists` instead. Without one of the two the snapshot
    -- cannot be replayed over an existing database at all.
    select format(
      E'\n-- %s.%s\ncreate %s %I.%I as\n%s',
      n.nspname, c.relname,
      case when c.relkind = 'm' then 'materialized view if not exists' else 'or replace view' end,
      n.nspname, c.relname,
      pg_get_viewdef(c.oid, true)
    )
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    left join ranked on ranked.oid = c.oid
    where n.nspname in ('public', 'private') and c.relkind in ('v', 'm')
    order by coalesce(ranked.lvl, 0), n.nspname, c.relname
  loop
    snapshot := snapshot || section || E'\n';
  end loop;

  -- ── Triggers ─────────────────────────────────────────────────────────────
  select coalesce(string_agg(pg_get_triggerdef(t.oid) || ';', E'\n' order by c.relname, t.tgname), '')
  into section
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'private') and not t.tgisinternal;

  snapshot := snapshot || E'\n\n-- ══ Triggers ════════════════════════════════════════════════════════════\n\n'
    || section;

  -- ── Row level security ───────────────────────────────────────────────────
  select coalesce(string_agg(
    format('alter table %I.%I enable row level security;', n.nspname, c.relname),
    E'\n' order by n.nspname, c.relname), '')
  into section
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'private') and c.relkind = 'r' and c.relrowsecurity;

  snapshot := snapshot || E'\n\n-- ══ Row level security ══════════════════════════════════════════════════\n\n'
    || section;

  select coalesce(string_agg(definition, E'\n' order by definition), '')
  into section
  from (
    -- Dropped first: a policy has no `create or replace`, and 166 of them
    -- failing on the second replay would make the file useless.
    select format(
      E'drop policy if exists %I on %I.%I;\ncreate policy %I on %I.%I as %s for %s to %s%s%s;',
      p.policyname, p.schemaname, p.tablename,
      p.policyname, p.schemaname, p.tablename,
      p.permissive, p.cmd, array_to_string(p.roles, ', '),
      case when p.qual is null then '' else ' using (' || p.qual || ')' end,
      case when p.with_check is null then '' else ' with check (' || p.with_check || ')' end
    ) as definition
    from pg_policies p
    where p.schemaname in ('public', 'private')
  ) policies;

  snapshot := snapshot || E'\n\n' || section;

  -- ── Grants ───────────────────────────────────────────────────────────────
  -- The Supabase roles only. Ownership grants are noise in a readable snapshot.
  --
  -- Schema-level USAGE first: a table grant is inert without it, so a snapshot
  -- that listed only table grants would describe a database nobody can read.
  select coalesce(string_agg(definition, E'\n' order by definition), '')
  into section
  from (
    -- r.rolname, not a.grantee: aclexplode yields the role OID, and %I on an
    -- OID silently emits a quoted number ("16485") that grants nothing.
    select distinct format('grant usage on schema %I to %I;', n.nspname, r.rolname) as definition
    from pg_namespace n
    cross join lateral aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner))) a
    join pg_roles r on r.oid = a.grantee
    where n.nspname in ('public', 'private')
      and a.privilege_type = 'USAGE'
      and r.rolname in ('anon', 'authenticated', 'service_role')
  ) schema_grants;

  snapshot := snapshot || E'\n\n-- ══ Grants ══════════════════════════════════════════════════════════════\n\n'
    || section || E'\n\n';

  select coalesce(string_agg(definition, E'\n' order by definition), '')
  into section
  from (
    select distinct format(
      'grant %s on %I.%I to %I;',
      g.privilege_type, g.table_schema, g.table_name, g.grantee
    ) as definition
    from information_schema.role_table_grants g
    where g.table_schema in ('public', 'private')
      and g.grantee in ('anon', 'authenticated', 'service_role')
  ) table_grants;

  snapshot := snapshot || section || E'\n\n';

  -- EXECUTE grants decide who may call the RPCs the app is built on, so a
  -- snapshot without them describes a database the Payment Desk cannot use.
  select coalesce(string_agg(definition, E'\n' order by definition), '')
  into section
  from (
    -- oidvectortypes, not pg_get_function_identity_arguments: the latter
    -- includes parameter NAMES here, giving
    -- `...(p_student_id uuid, p_as_of_date date, ...)`. Valid GRANT syntax, but
    -- a signature that changes whenever somebody renames a parameter. Types
    -- alone are what identifies the function.
    select distinct format(
      'grant execute on function %I.%I(%s) to %I;',
      n.nspname, p.proname, pg_catalog.oidvectortypes(p.proargtypes), r.rolname
    ) as definition
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    join pg_roles r on r.oid = a.grantee
    where n.nspname in ('public', 'private')
      and a.privilege_type = 'EXECUTE'
      and r.rolname in ('anon', 'authenticated', 'service_role')
  ) function_grants;

  snapshot := snapshot || section || E'\n';

  -- ── Scheduled jobs ───────────────────────────────────────────────────────
  -- pg_cron lives outside the public/private schemas, so nothing above finds
  -- it — and what runs nightly against the ledger belongs in a schema snapshot.
  --
  -- Commands are emitted with any JWT redacted, unconditionally. This repo is
  -- PUBLIC, cron commands are free text, and one job here already carries a
  -- hardcoded key (the anon key, which is public by design — but the sibling
  -- job does the same thing properly through vault.decrypted_secrets). A
  -- generator that copies commands verbatim would publish a service-role key
  -- the day somebody pastes one in, and would do it silently.
  begin
    select coalesce(string_agg(
      format(E'-- %s — %s\nselect cron.schedule(%L, %L, %L);',
        j.jobname, case when j.active then 'active' else 'INACTIVE' end,
        j.jobname, j.schedule,
        regexp_replace(j.command, 'eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+',
                       '<redacted-jwt>', 'g')),
      E'\n\n' order by j.jobname), '')
    into section
    from cron.job j;
  exception when others then
    section := '-- (cron.job is not readable by this role)';
  end;

  snapshot := snapshot || E'\n\n-- ══ Scheduled jobs (pg_cron) ════════════════════════════════════════════\n\n'
    || section || E'\n';

  return snapshot;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_dashboard_analytics(p_session_label text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
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
      -- The money rule, matching the `scoped` CTE that feeds every other board
      -- in this function: a student who left owing money still owes it.
      and (f.record_status = 'active' or coalesce(f.total_paid, 0) > 0)
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
  ),

  -- ── How much is the school giving away, and under which policy? ─────────
  -- Money rule, like every board here. Close-outs are carried separately and
  -- never summed into the discount totals: a close-out clears a pending
  -- balance, it does not reduce what was owed.
  discount_rows as (
    select
      coalesce(f.discount_amount, 0)::bigint              as discount_amount,
      coalesce(f.conventional_discount_amount, 0)::bigint as conventional_amount,
      coalesce(f.student_discount_amount, 0)::bigint      as manual_amount,
      nullif(trim(coalesce(f.conventional_discount_labels, '')), '') as labels,
      coalesce(f.total_discount_closeouts, 0)::bigint     as closeout_amount
    from public.v_workbook_student_financials f
    where f.session_label = p_session_label
      and (f.record_status = 'active' or coalesce(f.total_paid, 0) > 0)
  ),
  discount_totals as (
    select
      coalesce(sum(discount_amount), 0)::bigint     as total,
      coalesce(sum(conventional_amount), 0)::bigint as conventional,
      coalesce(sum(manual_amount), 0)::bigint       as manual,
      count(*) filter (where discount_amount > 0)::integer as students_with_discount,
      coalesce(sum(closeout_amount), 0)::bigint     as closeouts,
      count(*) filter (where closeout_amount > 0)::integer as students_with_closeout
    from discount_rows
  ),
  discount_policies as (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'label',    label,
        'students', students,
        'amount',   amount
      ) order by amount desc, label
    ), '[]'::jsonb) as data
    from (
      select labels as label,
             count(*)::integer as students,
             sum(conventional_amount)::bigint as amount
      from discount_rows
      where labels is not null
        and conventional_amount > 0
      group by labels
    ) as policy_rollup
  ),
  discounts as (
    select jsonb_build_object(
      'totalDiscount',        discount_totals.total,
      'conventionalDiscount', discount_totals.conventional,
      'manualDiscount',       discount_totals.manual,
      'studentsWithDiscount', discount_totals.students_with_discount,
      'byPolicy',             discount_policies.data,
      'closeouts', jsonb_build_object(
        'amount',   discount_totals.closeouts,
        'students', discount_totals.students_with_closeout
      )
    ) as data
    from discount_totals, discount_policies
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
    'concentration',     concentration.data,
    'discounts',         discounts.data
  )
  into v_result
  from debt_age, late_fee_totals, waiver_sources, next_accrual,
       monthly, class_recovery, route_recovery, concentration, discounts;

  return coalesce(v_result, '{}'::jsonb);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_dashboard_fee_split(p_session_label text)
 RETURNS TABLE(current_year_expected integer, current_year_collected integer, current_year_pending integer, previous_year_original integer, previous_year_collected integer, previous_year_pending integer, late_fee_pending integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not public.has_any_permission(array['dashboard:view', 'finance:view'])
  then
    raise exception 'You do not have permission to read the fee split.';
  end if;

  return query
  with scoped as (
    select
      b.is_carry_forward,
      b.base_charge,
      b.applied_amount,
      b.pending_amount,
      b.late_fee_pending
    from public.v_workbook_installment_balances as b
    join public.students as s on s.id = b.student_id
    join public.classes  as c on c.id = b.class_id
    where b.session_label = p_session_label
      and c.status = 'active'
      -- Active, or left/inactive but with money already collected: their
      -- remaining dues are still collectable and must stay visible. A departed
      -- student who never paid has had their installments cancelled, so they
      -- contribute nothing either way.
      and (
        s.status = 'active'
        or exists (
          select 1
          from public.payments p
          join public.receipts r on r.id = p.receipt_id
          where p.student_id = s.id and r.payment_mode <> 'discount'
        )
      )
  ),
  per_row as (
    select
      scoped.is_carry_forward,
      scoped.base_charge,
      least(greatest(scoped.applied_amount, 0), scoped.base_charge) as collected_against_base,
      scoped.pending_amount,
      greatest(scoped.late_fee_pending, 0) as late_pending
    from scoped
  )
  select
    coalesce(sum(per_row.base_charge)            filter (where not per_row.is_carry_forward), 0)::integer,
    coalesce(sum(per_row.collected_against_base) filter (where not per_row.is_carry_forward), 0)::integer,
    coalesce(sum(per_row.pending_amount)         filter (where not per_row.is_carry_forward), 0)::integer,
    coalesce(sum(per_row.base_charge)            filter (where per_row.is_carry_forward), 0)::integer,
    coalesce(sum(per_row.collected_against_base) filter (where per_row.is_carry_forward), 0)::integer,
    coalesce(sum(per_row.pending_amount)         filter (where per_row.is_carry_forward), 0)::integer,
    coalesce(sum(per_row.late_pending)           filter (where not per_row.is_carry_forward), 0)::integer
  from per_row;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_dashboard_repayment_summary(p_session_label text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_dashboard_summary(p_session_label text, p_today text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
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
  v_students_missing_installments jsonb;
  v_students_missing_installment_rows integer;
  v_students_with_no_fee_setting integer;
  v_payment_desk_ready boolean;
  v_dashboard_ready boolean;
  v_sync_health json;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not public.has_any_permission(array['dashboard:view', 'finance:view'])
  then
    raise exception 'You do not have permission to read the dashboard.';
  end if;
  select count(*)::integer into v_total_students
  from public.students s join public.classes c on c.id = s.class_id
  where s.status = 'active' and c.session_label = p_session_label and c.status = 'active';

  select coalesce(sum(base_charge_total), 0)::integer, coalesce(sum(total_paid), 0)::integer, coalesce(sum(outstanding_amount), 0)::integer
  into v_total_expected_fees, v_total_collected, v_total_pending
  from public.v_workbook_student_financials
  where session_label = p_session_label
    and (record_status = 'active' or total_paid > 0);

  select coalesce(sum(pending_amount), 0)::integer into v_overdue_amount
  from public.v_workbook_installment_balances
  where session_label = p_session_label and balance_status = 'overdue';

  -- Today's cash collection: exclude discount-mode write-offs.
  select coalesce(sum(r.total_amount), 0)::integer, count(*)::integer
  into v_todays_collection, v_receipts_today
  from public.receipts r join public.students s on s.id = r.student_id join public.classes c on c.id = s.class_id
  where r.payment_date = p_today::date and s.status = 'active' and c.session_label = p_session_label and c.status = 'active'
    and r.payment_mode <> 'discount'
    and not exists (select 1 from public.v_receipt_reversal_totals rr
                      where rr.receipt_id = r.id and rr.reversed_amount >= r.total_amount);

  select coalesce(sum(r.total_amount), 0)::integer into v_this_month_collection
  from public.receipts r join public.students s on s.id = r.student_id join public.classes c on c.id = s.class_id
  where r.payment_date >= date_trunc('month', p_today::date)::date
    and r.payment_date <= (date_trunc('month', p_today::date) + interval '1 month - 1 day')::date
    and s.status = 'active' and c.session_label = p_session_label and c.status = 'active'
    and r.payment_mode <> 'discount'
    and not exists (select 1 from public.v_receipt_reversal_totals rr
                      where rr.receipt_id = r.id and rr.reversed_amount >= r.total_amount);

  if v_total_expected_fees > 0 then
    v_collection_rate := least(100, round(coalesce(v_total_collected::numeric / v_total_expected_fees, 0) * 100));
  else v_collection_rate := 0; end if;

  select count(*)::integer into v_students_with_pending
  from public.v_workbook_student_financials
  where session_label = p_session_label and record_status = 'active' and outstanding_amount > 0;

  select coalesce(sum(greatest(refundable_amount, 0)), 0)::integer into v_total_refund_due
  from public.v_student_financial_state fs join public.students s on s.id = fs.student_id join public.classes c on c.id = s.class_id
  where s.status = 'active' and c.session_label = p_session_label and c.status = 'active';

  select count(case when status_label = 'PAID' then 1 end)::integer, count(case when status_label = 'PARTLY PAID' then 1 end)::integer,
         count(case when status_label = 'OVERDUE' then 1 end)::integer, count(case when status_label = 'NOT STARTED' then 1 end)::integer
  into v_paid_students, v_partly_paid_students, v_overdue_students, v_not_started_students
  from public.v_workbook_student_financials
  where session_label = p_session_label and record_status = 'active';

  select count(*)::integer into v_overdue_installment_count
  from public.v_workbook_installment_balances
  where session_label = p_session_label and balance_status = 'overdue' and pending_amount > 0;

  select coalesce(json_agg(t), '[]'::json) into v_today_payment_mode_breakdown from (
    select payment_mode as "paymentMode", sum(total_amount)::integer as amount, count(*)::integer as "receiptCount"
    from public.receipts r join public.students s on s.id = r.student_id join public.classes c on c.id = s.class_id
    where r.payment_date = p_today::date and s.status = 'active' and c.session_label = p_session_label and c.status = 'active'
      and r.payment_mode <> 'discount'
    and not exists (select 1 from public.v_receipt_reversal_totals rr
                      where rr.receipt_id = r.id and rr.reversed_amount >= r.total_amount)
    group by payment_mode order by amount desc) t;

  select coalesce(json_agg(t), '[]'::json) into v_recent_payments from (
    select r.id::text as "receiptId", r.receipt_number as "receiptNumber", r.payment_date::text as "paymentDate",
      r.student_id::text as "studentId", s.full_name as "studentName", s.admission_no as "admissionNo",
      private.normalize_workbook_class_label(c.class_name, c.stream_name) as "classLabel",
      r.payment_mode as "paymentMode", r.total_amount as amount
    from public.receipts r join public.students s on s.id = r.student_id join public.classes c on c.id = s.class_id
    where c.session_label = p_session_label
      and r.payment_mode <> 'discount'
    and not exists (select 1 from public.v_receipt_reversal_totals rr
                      where rr.receipt_id = r.id and rr.reversed_amount >= r.total_amount)
    order by r.payment_date desc, r.created_at desc limit 8) t;

  select coalesce(json_agg(t), '[]'::json) into v_follow_up_queue from (
    select student_id::text as "studentId", student_name as "studentName", admission_no as "admissionNo",
      class_id::text as "classId", class_label as "classLabel", father_phone as "fatherPhone",
      outstanding_amount as "outstandingAmount", next_due_date::text as "nextDueDate",
      next_due_label as "nextDueLabel", next_due_amount as "nextDueAmount", status_label as "statusLabel"
    from public.v_workbook_student_financials
    where session_label = p_session_label and record_status = 'active' and outstanding_amount > 0
    order by case when status_label = 'OVERDUE' then 0 else 1 end, outstanding_amount desc limit 10) t;

  select coalesce(json_agg(t), '[]'::json) into v_collection_trend from (
    select r.payment_date::text as date, sum(r.total_amount)::integer as amount, count(*)::integer as "receiptCount"
    from public.receipts r join public.students s on s.id = r.student_id join public.classes c on c.id = s.class_id
    where s.status = 'active' and c.session_label = p_session_label and c.status = 'active'
      and r.payment_mode <> 'discount'
    and not exists (select 1 from public.v_receipt_reversal_totals rr
                      where rr.receipt_id = r.id and rr.reversed_amount >= r.total_amount)
    group by r.payment_date order by r.payment_date desc limit 14) t;

  select coalesce(json_agg(t), '[]'::json) into v_collection_heatmap from (
    select r.payment_date::text as date, sum(r.total_amount)::integer as amount
    from public.receipts r join public.students s on s.id = r.student_id join public.classes c on c.id = s.class_id
    where s.status = 'active' and c.session_label = p_session_label and c.status = 'active'
      and r.payment_mode <> 'discount'
    and not exists (select 1 from public.v_receipt_reversal_totals rr
                      where rr.receipt_id = r.id and rr.reversed_amount >= r.total_amount)
      and r.payment_date >= date_trunc('month', p_today::date)::date
      and r.payment_date <= (date_trunc('month', p_today::date) + interval '1 month - 1 day')::date
    group by r.payment_date order by r.payment_date) t;

  select coalesce(json_agg(t), '[]'::json) into v_class_summary from (
    with class_students as (
      select c.id as class_id, c.session_label, private.normalize_workbook_class_label(c.class_name, c.stream_name) as class_label,
        count(*)::integer as total_students, c.sort_order
      from public.students s join public.classes c on c.id = s.class_id
      where s.status = 'active' and c.session_label = p_session_label and c.status = 'active'
      group by c.id, c.session_label, c.class_name, c.stream_name, c.sort_order),
    class_financials as (
      select class_id, count(*)::integer as students_with_generated_dues,
        sum(base_charge_total)::integer as expected_amount, sum(total_paid)::integer as collected_amount,
        sum(outstanding_amount)::integer as pending_amount,
        count(case when status_label = 'OVERDUE' then 1 end)::integer as overdue_students,
        count(case when outstanding_amount > 0 then 1 end)::integer as students_with_pending
      from public.v_workbook_student_financials
      where session_label = p_session_label and record_status = 'active' group by class_id),
    class_overdue as (
      select class_id, sum(greatest(base_charge - (paid_amount + adjustment_amount), 0))::integer as overdue_amount
      from public.v_workbook_installment_balances
      where session_label = p_session_label and balance_status = 'overdue' group by class_id)
    select cs.class_id as "classId", cs.session_label as "sessionLabel", cs.class_label as "classLabel",
      cs.total_students as "totalStudents", coalesce(cf.students_with_generated_dues, 0) as "studentsWithGeneratedDues",
      greatest(cs.total_students - coalesce(cf.students_with_generated_dues, 0), 0) as "missingDuesStudents",
      coalesce(cf.expected_amount, 0) as "expectedAmount", coalesce(cf.collected_amount, 0) as "collectedAmount",
      coalesce(cf.pending_amount, 0) as "pendingAmount", coalesce(co.overdue_amount, 0) as "overdueAmount",
      coalesce(cf.overdue_students, 0) as "overdueStudents", coalesce(cf.students_with_pending, 0) as "studentsWithPending",
      case when coalesce(cf.expected_amount, 0) > 0 then round(coalesce(cf.collected_amount::numeric / cf.expected_amount, 0) * 100)::integer else 0 end as "collectionRate"
    from class_students cs left join class_financials cf on cf.class_id = cs.class_id left join class_overdue co on co.class_id = cs.class_id
    order by pending_amount desc, class_label) t;

  select coalesce(json_agg(t), '[]'::json) into v_installment_summary from (
    select installment_no as "installmentNo", max(installment_label) as "installmentLabel", due_date::text as "dueDate",
      count(distinct student_id)::integer as "studentCount", sum(base_charge)::integer as "expectedAmount",
      sum(greatest(paid_amount + adjustment_amount, 0))::integer as "collectedAmount",
      sum(pending_amount)::integer as "pendingAmount",
      sum(case when balance_status = 'overdue' then greatest(base_charge - (paid_amount + adjustment_amount), 0) else 0 end)::integer as "overdueAmount",
      case when sum(total_charge) > 0 then round(coalesce(sum(greatest(paid_amount + adjustment_amount, 0))::numeric / sum(total_charge), 0) * 100)::integer else 0 end as "collectionRate"
    from public.v_workbook_installment_balances
    where session_label = p_session_label group by installment_no, due_date order by installment_no) t;

  select coalesce(json_agg(t), '[]'::json) into v_class_installment_matrix from (
    with distinct_installments as (
      select installment_no, max(installment_label) as installment_label
      from public.v_workbook_installment_balances where session_label = p_session_label group by installment_no),
    class_matrix_base as (
      select c.id as class_id, private.normalize_workbook_class_label(c.class_name, c.stream_name) as class_label
      from public.classes c where c.session_label = p_session_label and c.status = 'active'),
    cross_join as (
      select b.class_id, b.class_label, d.installment_no, d.installment_label
      from class_matrix_base b cross join distinct_installments d),
    actual_pending as (
      select class_id, installment_no, sum(pending_amount)::integer as pending_amount
      from public.v_workbook_installment_balances where session_label = p_session_label group by class_id, installment_no),
    assembled as (
      select cj.class_id, cj.class_label, cj.installment_no, cj.installment_label,
        coalesce(ap.pending_amount, 0) as pending_amount
      from cross_join cj left join actual_pending ap on ap.class_id = cj.class_id and ap.installment_no = cj.installment_no),
    aggregated_installments as (
      select class_id, class_label,
        jsonb_agg(jsonb_build_object('installmentNo', installment_no, 'installmentLabel', installment_label, 'pendingAmount', pending_amount) order by installment_no) as installments,
        sum(pending_amount)::integer as total_pending_amount
      from assembled group by class_id, class_label)
    select class_id::text as "classId", class_label as "classLabel", installments, total_pending_amount as "totalPendingAmount"
    from aggregated_installments order by total_pending_amount desc, class_label) t;

  select coalesce(jsonb_agg(t), '[]'::jsonb) into v_students_missing_installments from (
    select s.id::text as "studentId", s.admission_no as "admissionNo", s.full_name as "fullName", c.session_label as "sessionLabel"
    from public.students s join public.classes c on c.id = s.class_id
    where s.status = 'active' and c.session_label = p_session_label and c.status = 'active'
      and not exists (select 1 from public.installments i where i.student_id = s.id and i.status <> 'cancelled')) t;

  v_students_missing_installment_rows := jsonb_array_length(v_students_missing_installments);

  select count(*)::integer into v_students_with_no_fee_setting
  from public.students s join public.classes c on c.id = s.class_id
  where s.status = 'active' and c.session_label = p_session_label and c.status = 'active'
    and not exists (select 1 from public.fee_settings f where f.class_id = s.class_id and f.is_active = true);

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
    'errors', '[]'::jsonb);

  return json_build_object(
    'kpis', json_build_object('totalStudents', v_total_students, 'totalExpectedFees', v_total_expected_fees,
      'totalCollected', v_total_collected, 'totalPending', v_total_pending, 'overdueAmount', v_overdue_amount,
      'todaysCollection', v_todays_collection, 'thisMonthCollection', v_this_month_collection,
      'receiptsToday', v_receipts_today, 'collectionRate', v_collection_rate),
    'todayPaymentModeBreakdown', v_today_payment_mode_breakdown,
    'recentPayments', v_recent_payments, 'followUpQueue', v_follow_up_queue,
    'collectionTrend', v_collection_trend, 'collectionHeatmap', v_collection_heatmap,
    'classSummary', v_class_summary, 'installmentSummary', v_installment_summary,
    'classInstallmentMatrix', v_class_installment_matrix,
    'studentsWithPending', v_students_with_pending, 'totalRefundDue', v_total_refund_due,
    'paidStudents', v_paid_students, 'partlyPaidStudents', v_partly_paid_students,
    'overdueStudents', v_overdue_students, 'notStartedStudents', v_not_started_students,
    'overdueInstallmentCount', v_overdue_installment_count, 'systemSyncHealth', v_sync_health);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_student_directory_summary(p_session_label text, p_class_id uuid DEFAULT NULL::uuid, p_route_id uuid DEFAULT NULL::uuid, p_query text DEFAULT NULL::text, p_statuses text[] DEFAULT NULL::text[], p_active_classes_only boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with scoped as (
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
      and (p_statuses is null or d.record_status::text = any(p_statuses))
  )
  select jsonb_build_object(
    'studentCount',          count(*),
    'expectedFees',          coalesce(sum(base_charge_total), 0),
    'totalPaid',             coalesce(sum(total_paid), 0),
    'totalOutstanding',      coalesce(sum(outstanding_amount), 0),
    'oldBalanceOutstanding', coalesce(sum(old_balance_amount), 0),
    'lateFeeOutstanding',    coalesce(sum(late_fee_outstanding_amount), 0),
    'totalDiscount',         coalesce(sum(discount_amount), 0),
    'transportStudentCount', count(*) filter (where seg_on_transport)
  )
  from scoped;
$function$
;

CREATE OR REPLACE FUNCTION public.get_student_segment_counts(p_session_label text, p_class_id uuid DEFAULT NULL::uuid, p_route_id uuid DEFAULT NULL::uuid, p_query text DEFAULT NULL::text, p_statuses text[] DEFAULT NULL::text[], p_active_classes_only boolean DEFAULT true)
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
$function$
;

CREATE OR REPLACE FUNCTION public.has_any_permission(p_permissions text[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
  select exists (
    select 1
    from unnest(coalesce(p_permissions, array[]::text[])) as permission_name
    where public.has_permission(permission_name)
  );
$function$
;

CREATE OR REPLACE FUNCTION public.has_permission(p_permission text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'private'
AS $function$
  select auth.uid() is not null
    and case private.current_staff_role()
      when 'admin'::public.staff_role then true
      when 'accountant'::public.staff_role then p_permission = any (
        array[
          'dashboard:view',
          'students:view',
          'fees:view',
          'payments:view',
          'payments:write',
          'payments:waive_late_fee',
          'finance:view',
          'ledger:view',
          'receipts:view',
          'receipts:print',
          'defaulters:view',
          'imports:view',
          'reports:view',
          'settings:view'
        ]
      )
      when 'teacher'::public.staff_role then p_permission = any (
        array[
          'dashboard:view',
          'students:view',
          'students:edit_basic',
          'fees:view',
          'payments:view',
          'finance:view',
          'ledger:view',
          'receipts:view',
          'defaulters:view',
          'imports:view',
          'reports:view',
          'settings:view'
        ]
      )
      when 'fee_collector'::public.staff_role then p_permission = any (
        array[
          'dashboard:view',
          'students:view',
          'fees:view',
          'payments:view',
          'finance:view',
          'ledger:view',
          'receipts:view',
          'defaulters:view',
          'contacts:write',
          'imports:view',
          'reports:view',
          'settings:view'
        ]
      )
      when 'view_only'::public.staff_role then p_permission = any (
        array[
          'dashboard:view',
          'students:view',
          'defaulters:view',
          'receipts:view'
        ]
      )
      else false
    end;
$function$
;

CREATE OR REPLACE FUNCTION public.import_student_batch_row(p_batch_id uuid, p_row_index integer, p_full_name text, p_class_id uuid, p_admission_no text, p_date_of_birth date, p_father_name text, p_mother_name text, p_primary_phone text, p_secondary_phone text, p_address text, p_transport_route_id uuid, p_status public.student_status, p_notes text, p_custom_tuition_fee_amount integer, p_custom_transport_fee_amount integer, p_custom_books_fee_amount integer, p_custom_admission_activity_misc_fee_amount integer, p_custom_other_fee_heads jsonb, p_custom_late_fee_flat_amount integer, p_discount_amount integer, p_student_type_override text, p_transport_applies_override boolean)
 RETURNS TABLE(student_id uuid, student_fee_override_id uuid)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  inserted_student_id uuid;
  imported_override_id uuid := null;
  active_fee_setting_id uuid;
  has_override boolean;
begin
  insert into public.students (
    full_name,
    class_id,
    admission_no,
    date_of_birth,
    father_name,
    mother_name,
    primary_phone,
    secondary_phone,
    address,
    transport_route_id,
    status,
    notes
  )
  values (
    trim(p_full_name),
    p_class_id,
    trim(p_admission_no),
    p_date_of_birth,
    nullif(trim(coalesce(p_father_name, '')), ''),
    nullif(trim(coalesce(p_mother_name, '')), ''),
    nullif(trim(coalesce(p_primary_phone, '')), ''),
    nullif(trim(coalesce(p_secondary_phone, '')), ''),
    nullif(trim(coalesce(p_address, '')), ''),
    p_transport_route_id,
    p_status,
    nullif(trim(coalesce(p_notes, '')), '')
  )
  returning id into inserted_student_id;

  has_override :=
    p_custom_tuition_fee_amount is not null
    or p_custom_transport_fee_amount is not null
    or p_custom_books_fee_amount is not null
    or p_custom_admission_activity_misc_fee_amount is not null
    or p_custom_late_fee_flat_amount is not null
    or coalesce(p_discount_amount, 0) > 0
    or (
      p_custom_other_fee_heads is not null
      and p_custom_other_fee_heads <> '{}'::jsonb
    )
    or nullif(trim(coalesce(p_student_type_override, '')), '') is not null
    or p_transport_applies_override is not null;

  if has_override then
    select fs.id
    into active_fee_setting_id
    from public.fee_settings as fs
    where fs.class_id = p_class_id
      and fs.is_active = true
    limit 1;

    if active_fee_setting_id is null then
      raise exception 'No active fee settings found for imported student class.';
    end if;

    insert into public.student_fee_overrides (
      student_id,
      fee_setting_id,
      custom_tuition_fee_amount,
      custom_transport_fee_amount,
      custom_books_fee_amount,
      custom_admission_activity_misc_fee_amount,
      custom_other_fee_heads,
      custom_late_fee_flat_amount,
      discount_amount,
      student_type_override,
      transport_applies_override,
      reason,
      notes,
      is_active
    )
    values (
      inserted_student_id,
      active_fee_setting_id,
      p_custom_tuition_fee_amount,
      p_custom_transport_fee_amount,
      p_custom_books_fee_amount,
      p_custom_admission_activity_misc_fee_amount,
      case
        when p_custom_other_fee_heads is null then '{}'::jsonb
        else p_custom_other_fee_heads
      end,
      p_custom_late_fee_flat_amount,
      coalesce(p_discount_amount, 0),
      nullif(trim(coalesce(p_student_type_override, '')), ''),
      p_transport_applies_override,
      format('Imported from batch %s row %s', p_batch_id, p_row_index),
      null,
      true
    )
    returning id into imported_override_id;
  end if;

  return query
  select inserted_student_id, imported_override_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.import_student_batch_row(p_batch_id uuid, p_row_index integer, p_full_name text, p_class_id uuid, p_admission_no text, p_date_of_birth date, p_father_name text, p_mother_name text, p_primary_phone text, p_secondary_phone text, p_address text, p_transport_route_id uuid, p_status public.student_status, p_notes text, p_custom_tuition_fee_amount integer, p_custom_transport_fee_amount integer, p_custom_books_fee_amount integer, p_custom_admission_activity_misc_fee_amount integer, p_custom_other_fee_heads jsonb, p_custom_late_fee_flat_amount integer, p_discount_amount integer, p_student_type_override text, p_transport_applies_override boolean, p_other_adjustment_head text DEFAULT NULL::text, p_other_adjustment_amount integer DEFAULT NULL::integer, p_late_fee_waiver_amount integer DEFAULT 0)
 RETURNS TABLE(student_id uuid, student_fee_override_id uuid)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  inserted_student_id uuid;
  imported_override_id uuid := null;
  active_fee_setting_id uuid;
  has_override boolean;
begin
  insert into public.students (
    full_name,
    class_id,
    admission_no,
    date_of_birth,
    father_name,
    mother_name,
    primary_phone,
    secondary_phone,
    address,
    transport_route_id,
    status,
    notes
  )
  values (
    trim(p_full_name),
    p_class_id,
    trim(p_admission_no),
    p_date_of_birth,
    nullif(trim(coalesce(p_father_name, '')), ''),
    nullif(trim(coalesce(p_mother_name, '')), ''),
    nullif(trim(coalesce(p_primary_phone, '')), ''),
    nullif(trim(coalesce(p_secondary_phone, '')), ''),
    nullif(trim(coalesce(p_address, '')), ''),
    p_transport_route_id,
    p_status,
    nullif(trim(coalesce(p_notes, '')), '')
  )
  returning id into inserted_student_id;

  has_override :=
    p_custom_tuition_fee_amount is not null
    or p_custom_transport_fee_amount is not null
    or p_custom_books_fee_amount is not null
    or p_custom_admission_activity_misc_fee_amount is not null
    or p_custom_late_fee_flat_amount is not null
    or coalesce(p_discount_amount, 0) > 0
    or (
      p_custom_other_fee_heads is not null
      and p_custom_other_fee_heads <> '{}'::jsonb
    )
    or nullif(trim(coalesce(p_student_type_override, '')), '') is not null
    or p_transport_applies_override is not null
    or coalesce(p_other_adjustment_amount, 0) <> 0
    or nullif(trim(coalesce(p_other_adjustment_head, '')), '') is not null
    or coalesce(p_late_fee_waiver_amount, 0) > 0;

  if has_override then
    select fs.id
    into active_fee_setting_id
    from public.fee_settings as fs
    where fs.class_id = p_class_id
      and fs.is_active = true
    limit 1;

    if active_fee_setting_id is null then
      raise exception 'No active fee settings found for imported student class.';
    end if;

    insert into public.student_fee_overrides (
      student_id,
      fee_setting_id,
      custom_tuition_fee_amount,
      custom_transport_fee_amount,
      custom_books_fee_amount,
      custom_admission_activity_misc_fee_amount,
      custom_other_fee_heads,
      custom_late_fee_flat_amount,
      other_adjustment_head,
      other_adjustment_amount,
      late_fee_waiver_amount,
      discount_amount,
      student_type_override,
      transport_applies_override,
      reason,
      notes,
      is_active
    )
    values (
      inserted_student_id,
      active_fee_setting_id,
      p_custom_tuition_fee_amount,
      p_custom_transport_fee_amount,
      p_custom_books_fee_amount,
      p_custom_admission_activity_misc_fee_amount,
      case
        when p_custom_other_fee_heads is null then '{}'::jsonb
        else p_custom_other_fee_heads
      end,
      p_custom_late_fee_flat_amount,
      nullif(trim(coalesce(p_other_adjustment_head, '')), ''),
      p_other_adjustment_amount,
      greatest(coalesce(p_late_fee_waiver_amount, 0), 0),
      coalesce(p_discount_amount, 0),
      nullif(trim(coalesce(p_student_type_override, '')), ''),
      p_transport_applies_override,
      format('Imported from batch %s row %s', p_batch_id, p_row_index),
      null,
      true
    )
    returning id into imported_override_id;
  end if;

  return query
  select inserted_student_id, imported_override_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.post_corrected_payment(p_student_id uuid, p_payment_date date, p_payment_mode public.payment_mode, p_allocations jsonb, p_client_request_id uuid, p_reference_number text DEFAULT NULL::text, p_received_by text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_receipt_prefix text DEFAULT 'SVP'::text)
 RETURNS TABLE(receipt_id uuid, receipt_number text, allocated_total integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare
  v_normalized_prefix text;
  v_daily_sequence integer;
  v_candidate_receipt_id uuid;
  v_candidate_receipt_number text;
  v_existing_receipt_id uuid;
  v_existing_receipt_number text;
  v_existing_total integer;
  v_total integer := 0;
  v_attempt integer;
  alloc record;
begin
  -- Service role only. No `has_permission` arm: this must not be reachable from
  -- a staff session, or it becomes a second posting surface for humans.
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'post_corrected_payment is callable only by the correction harness.';
  end if;

  if p_client_request_id is null then
    raise exception 'A client_request_id is required so a re-run cannot double-post.';
  end if;

  if p_allocations is null or jsonb_typeof(p_allocations) <> 'array'
     or jsonb_array_length(p_allocations) = 0 then
    raise exception 'p_allocations must be a non-empty JSON array of { installment_id, amount }.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_student_id::text, 0));

  -- Idempotency, same contract as the desk RPC: a repeated run resolves to the
  -- receipt it already wrote instead of writing a second one.
  select r.id, r.receipt_number, r.total_amount
  into v_existing_receipt_id, v_existing_receipt_number, v_existing_total
  from public.receipts as r
  where r.student_id = p_student_id
    and r.client_request_id = p_client_request_id
  limit 1;

  if v_existing_receipt_id is not null then
    return query select v_existing_receipt_id, v_existing_receipt_number, v_existing_total;
    return;
  end if;

  create temporary table _corrected_allocations on commit drop as
  select
    (item->>'installment_id')::uuid as installment_id,
    (item->>'amount')::integer      as amount
  from jsonb_array_elements(p_allocations) as item;

  if exists (select 1 from _corrected_allocations where amount is null or amount <= 0) then
    raise exception 'Every allocation needs a positive amount.';
  end if;

  if exists (
    select 1
    from _corrected_allocations as a
    group by a.installment_id
    having count(*) > 1
  ) then
    raise exception 'The same installment appears twice in the allocation. Combine it into one row.';
  end if;

  -- Every installment must be this student's own.
  if exists (
    select 1
    from _corrected_allocations as a
    left join public.installments as i
      on i.id = a.installment_id and i.student_id = p_student_id
    where i.id is null
  ) then
    raise exception 'An allocation names an installment that does not belong to this student.';
  end if;

  -- …and must have room for it. Read the LIVE snapshot function, never the
  -- materialized view: the matview lags a posting by up to two minutes, and a
  -- correction runs immediately after a reversal. Pricing a repost off stale
  -- balances is what re-committed a family to their pre-payment total once.
  if exists (
    select 1
    from _corrected_allocations as a
    join private.workbook_installment_snapshot(p_student_id, p_payment_date, true) as snap
      on snap.installment_id = a.installment_id
    where a.amount > snap.total_pending
  ) then
    raise exception 'An allocation is larger than what that installment still owes.';
  end if;

  select coalesce(sum(amount), 0) into v_total from _corrected_allocations;

  v_normalized_prefix := coalesce(nullif(trim(p_receipt_prefix), ''), 'SVP');

  -- Receipt numbers are a per-day sequence derived by max(), not a sequence
  -- object, and the trailing group MUST stay exactly four digits: the desk RPC
  -- reads it back with '-([0-9]{4})$'. A correction number of any other shape
  -- makes that regex miss, max() return 0, and the next real posting on that
  -- date collide through all its retries.
  select coalesce(max((regexp_match(r.receipt_number, '-([0-9]{4})$'))[1]::integer), 0)
  into v_daily_sequence
  from public.receipts as r
  where r.receipt_number like v_normalized_prefix || to_char(p_payment_date, 'YYYYMMDD') || '-%';

  for v_attempt in 1..12 loop
    v_daily_sequence := v_daily_sequence + 1;
    v_candidate_receipt_number :=
      v_normalized_prefix || to_char(p_payment_date, 'YYYYMMDD') || '-'
      || lpad(v_daily_sequence::text, 4, '0');

    begin
      insert into public.receipts (
        receipt_number, student_id, payment_date, payment_mode, total_amount,
        reference_number, notes, received_by, client_request_id
      )
      values (
        v_candidate_receipt_number, p_student_id, p_payment_date, p_payment_mode, v_total,
        nullif(trim(coalesce(p_reference_number, '')), ''),
        nullif(trim(coalesce(p_notes, '')), ''),
        nullif(trim(coalesce(p_received_by, '')), ''),
        p_client_request_id
      )
      returning id into v_candidate_receipt_id;
      exit;
    exception
      when unique_violation then
        -- Could be the receipt number racing another posting, or the
        -- client_request_id landing concurrently. Re-check the latter before
        -- trying a new number.
        select r.id, r.receipt_number, r.total_amount
        into v_existing_receipt_id, v_existing_receipt_number, v_existing_total
        from public.receipts as r
        where r.student_id = p_student_id
          and r.client_request_id = p_client_request_id
        limit 1;

        if v_existing_receipt_id is not null then
          return query select v_existing_receipt_id, v_existing_receipt_number, v_existing_total;
          return;
        end if;

        continue;
    end;
  end loop;

  if v_candidate_receipt_id is null then
    raise exception 'Unable to generate a unique receipt number. Please retry.';
  end if;

  -- The four snapshot columns are left NULL/0 on purpose. They are frozen
  -- display values — "the balance the parent was told at the counter" — and a
  -- correction posted months later was never told to anybody. Same choice the
  -- 20260727113603 allocation repair made.
  for alloc in select installment_id, amount from _corrected_allocations order by installment_id loop
    insert into public.payments (
      receipt_id, student_id, installment_id, amount, notes,
      discount_applied_at_posting, waiver_applied_at_posting,
      pending_before_posting, pending_after_posting
    )
    values (
      v_candidate_receipt_id, p_student_id, alloc.installment_id, alloc.amount,
      nullif(trim(coalesce(p_notes, '')), ''),
      0, 0, null, null
    );
  end loop;

  return query select v_candidate_receipt_id, v_candidate_receipt_number, v_total;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.post_student_payment(p_student_id uuid, p_payment_date date, p_payment_mode public.payment_mode, p_total_amount integer, p_reference_number text DEFAULT NULL::text, p_remarks text DEFAULT NULL::text, p_received_by text DEFAULT NULL::text, p_receipt_prefix text DEFAULT 'SVP'::text, p_client_request_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(receipt_id uuid, receipt_number text, allocated_total integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  balance_row record;
  allocation_amount integer;
  remaining_amount integer;
  daily_sequence integer;
  candidate_receipt_number text;
  candidate_receipt_id uuid;
  existing_receipt_number text;
  existing_total_amount integer;
  total_outstanding integer;
  normalized_prefix text;
  active_policy_model text;
  active_policy_session text;
  student_session_label text;
  use_workbook_mode boolean := false;
begin
  if not public.has_permission('payments:write') then
    raise exception 'You do not have permission to post payments.';
  end if;

  if p_total_amount is null or p_total_amount <= 0 then
    raise exception 'Payment amount must be greater than 0.';
  end if;

  if p_payment_date is null then
    raise exception 'Payment date is required.';
  end if;

  if p_student_id is null then
    raise exception 'Student is required.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_student_id::text, 0));

  if p_client_request_id is not null then
    select r.id, r.receipt_number, r.total_amount
    into candidate_receipt_id, existing_receipt_number, existing_total_amount
    from public.receipts as r
    where r.student_id = p_student_id
      and r.client_request_id = p_client_request_id
    order by r.created_at desc
    limit 1;

    if candidate_receipt_id is not null then
      return query
      select
        candidate_receipt_id as receipt_id,
        existing_receipt_number as receipt_number,
        existing_total_amount as allocated_total;
      return;
    end if;
  end if;

  select c.session_label
  into student_session_label
  from public.students as s
  join public.classes as c
    on c.id = s.class_id
  where s.id = p_student_id;

  if student_session_label is null then
    raise exception 'Selected student was not found.';
  end if;

  select fpc.calculation_model, fpc.academic_session_label
  into active_policy_model, active_policy_session
  from public.fee_policy_configs as fpc
  where fpc.academic_session_label = student_session_label
  order by fpc.updated_at desc
  limit 1;

  use_workbook_mode := active_policy_model = 'workbook_v1';

  normalized_prefix := nullif(trim(coalesce(p_receipt_prefix, '')), '');

  if normalized_prefix is null then
    normalized_prefix := 'SVP';
  end if;

  if use_workbook_mode then
    select coalesce(sum(snapshot_row.total_pending), 0)
    into total_outstanding
    from private.workbook_installment_snapshot(
      p_student_id,
      p_payment_date,
      true
    ) as snapshot_row
    where snapshot_row.total_pending > 0;
  else
    select coalesce(sum(balance_view.outstanding_amount), 0)
    into total_outstanding
    from public.v_installment_balances as balance_view
    where balance_view.student_id = p_student_id
      and balance_view.outstanding_amount > 0;
  end if;

  if total_outstanding <= 0 then
    raise exception 'No pending dues are available for this student.';
  end if;

  if p_total_amount > total_outstanding then
    raise exception 'Payment amount cannot exceed total pending amount.';
  end if;

  select coalesce(
    max((regexp_match(receipt_row.receipt_number, '-([0-9]{4})$'))[1]::integer),
    0
  )
  into daily_sequence
  from public.receipts as receipt_row
  where receipt_row.receipt_number like normalized_prefix || to_char(p_payment_date, 'YYYYMMDD') || '-%';

  for _attempt in 1..12 loop
    daily_sequence := daily_sequence + 1;
    candidate_receipt_number :=
      normalized_prefix || to_char(p_payment_date, 'YYYYMMDD') || '-' || lpad(daily_sequence::text, 4, '0');

    begin
      insert into public.receipts (
        receipt_number,
        student_id,
        payment_date,
        payment_mode,
        total_amount,
        reference_number,
        notes,
        received_by,
        client_request_id
      )
      values (
        candidate_receipt_number,
        p_student_id,
        p_payment_date,
        p_payment_mode,
        p_total_amount,
        nullif(trim(coalesce(p_reference_number, '')), ''),
        nullif(trim(coalesce(p_remarks, '')), ''),
        nullif(trim(coalesce(p_received_by, '')), ''),
        p_client_request_id
      )
      returning id into candidate_receipt_id;

      exit;
    exception
      when unique_violation then
        if p_client_request_id is not null then
          select r.id, r.receipt_number, r.total_amount
          into candidate_receipt_id, existing_receipt_number, existing_total_amount
          from public.receipts as r
          where r.student_id = p_student_id
            and r.client_request_id = p_client_request_id
          order by r.created_at desc
          limit 1;

          if candidate_receipt_id is not null then
            return query
            select
              candidate_receipt_id as receipt_id,
              existing_receipt_number as receipt_number,
              existing_total_amount as allocated_total;
            return;
          end if;
        end if;

        continue;
    end;
  end loop;

  if candidate_receipt_id is null then
    raise exception 'Unable to generate a unique receipt number. Please retry.';
  end if;

  remaining_amount := p_total_amount;

  if use_workbook_mode then
    for balance_row in
      select
        snapshot_row.installment_id,
        snapshot_row.total_pending
      from private.workbook_installment_snapshot(
        p_student_id,
        p_payment_date,
        true
      ) as snapshot_row
      where snapshot_row.total_pending > 0
      order by snapshot_row.due_date asc, snapshot_row.installment_no asc
    loop
      exit when remaining_amount <= 0;

      allocation_amount := least(remaining_amount, balance_row.total_pending);

      if allocation_amount <= 0 then
        continue;
      end if;

      insert into public.payments (
        receipt_id,
        student_id,
        installment_id,
        amount,
        notes
      )
      values (
        candidate_receipt_id,
        p_student_id,
        balance_row.installment_id,
        allocation_amount,
        nullif(trim(coalesce(p_remarks, '')), '')
      );

      remaining_amount := remaining_amount - allocation_amount;
    end loop;
  else
    for balance_row in
      select
        balance_view.installment_id,
        balance_view.outstanding_amount
      from public.v_installment_balances as balance_view
      where balance_view.student_id = p_student_id
        and balance_view.outstanding_amount > 0
      order by balance_view.due_date asc, balance_view.installment_no asc
    loop
      exit when remaining_amount <= 0;

      allocation_amount := least(remaining_amount, balance_row.outstanding_amount);

      if allocation_amount <= 0 then
        continue;
      end if;

      insert into public.payments (
        receipt_id,
        student_id,
        installment_id,
        amount,
        notes
      )
      values (
        candidate_receipt_id,
        p_student_id,
        balance_row.installment_id,
        allocation_amount,
        nullif(trim(coalesce(p_remarks, '')), '')
      );

      remaining_amount := remaining_amount - allocation_amount;
    end loop;
  end if;

  if remaining_amount <> 0 then
    raise exception 'Unable to allocate payment cleanly. Please retry.';
  end if;

  return query
  select
    candidate_receipt_id as receipt_id,
    candidate_receipt_number as receipt_number,
    p_total_amount as allocated_total;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.post_student_payment_with_adjustments(p_student_id uuid, p_payment_date date, p_payment_mode public.payment_mode, p_total_amount integer, p_reference_number text DEFAULT NULL::text, p_remarks text DEFAULT NULL::text, p_received_by text DEFAULT NULL::text, p_receipt_prefix text DEFAULT 'SVP'::text, p_client_request_id uuid DEFAULT NULL::uuid, p_quick_discount_amount integer DEFAULT 0, p_quick_late_fee_waiver_amount integer DEFAULT 0)
 RETURNS TABLE(receipt_id uuid, receipt_number text, allocated_total integer)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  balance_row record;
  v_payment_allocation integer;
  v_discount_allocation integer;
  v_waiver_allocation integer;
  v_remaining_payment integer;
  v_remaining_discount integer;
  v_remaining_waiver integer;
  v_daily_sequence integer;
  v_candidate_receipt_number text;
  v_candidate_receipt_id uuid;
  v_existing_receipt_number text;
  v_existing_total_amount integer;
  v_total_pending integer;
  v_revised_pending integer;
  v_normalized_prefix text;
  v_pending_after integer;
  v_receipt_notes text;
  v_workbook_snapshot jsonb;
  v_plan_id uuid;
  v_plan_balance_before integer := 0;
  v_plan_contribution integer := 0;
begin
  if not public.has_permission('payments:write') then
    raise exception 'You do not have permission to post payments.';
  end if;

  if p_total_amount is null or p_total_amount <= 0 then
    raise exception 'Payment amount must be greater than 0.';
  end if;

  v_remaining_discount := greatest(coalesce(p_quick_discount_amount, 0), 0);
  v_remaining_waiver := greatest(coalesce(p_quick_late_fee_waiver_amount, 0), 0);
  v_remaining_payment := p_total_amount;
  v_receipt_notes := nullif(trim(coalesce(p_remarks, '')), '');

  perform pg_advisory_xact_lock(hashtextextended(p_student_id::text, 0));

  if p_client_request_id is not null then
    select r.id, r.receipt_number, r.total_amount
    into v_candidate_receipt_id, v_existing_receipt_number, v_existing_total_amount
    from public.receipts as r
    where r.student_id = p_student_id
      and r.client_request_id = p_client_request_id
    order by r.created_at desc
    limit 1;

    if v_candidate_receipt_id is not null then
      return query select v_candidate_receipt_id, v_existing_receipt_number, v_existing_total_amount;
      return;
    end if;
  end if;

  select p.id into v_plan_id
  from public.student_repayment_plans as p
  where p.student_id = p_student_id
    and p.lifecycle = 'active'
  limit 1;

  if v_plan_id is not null and (v_remaining_discount > 0 or v_remaining_waiver > 0) then
    raise exception
      'This student is on an EMI plan. Discounts and late-fee waivers cannot be applied at the counter — reschedule the plan instead.';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'installment_id', snapshot_row.installment_id,
        'pending_amount', snapshot_row.total_pending,
        'due_date', snapshot_row.due_date,
        'installment_no', snapshot_row.installment_no,
        'plan_priority', case when plan_item.installment_id is null then 1 else 0 end
      )
      order by
        case when plan_item.installment_id is null then 1 else 0 end asc,
        snapshot_row.due_date asc,
        snapshot_row.installment_no asc
    ),
    '[]'::jsonb
  )
  into v_workbook_snapshot
  from private.workbook_installment_snapshot(p_student_id, p_payment_date, true) as snapshot_row
  left join public.student_repayment_plan_items as plan_item
    on plan_item.installment_id = snapshot_row.installment_id
    and plan_item.plan_id = v_plan_id;

  select coalesce(sum(snapshot.pending_amount), 0)
  into v_total_pending
  from jsonb_to_recordset(v_workbook_snapshot) as snapshot(
    installment_id uuid,
    pending_amount integer,
    due_date date,
    installment_no smallint,
    plan_priority integer
  )
  where snapshot.pending_amount > 0;

  if v_plan_id is not null then
    select coalesce(sum(snapshot.pending_amount), 0)
    into v_plan_balance_before
    from jsonb_to_recordset(v_workbook_snapshot) as snapshot(
      installment_id uuid,
      pending_amount integer,
      due_date date,
      installment_no smallint,
      plan_priority integer
    )
    where snapshot.pending_amount > 0
      and snapshot.plan_priority = 0;
  end if;

  v_revised_pending := v_total_pending - v_remaining_discount - v_remaining_waiver;

  if v_total_pending <= 0 then
    raise exception 'No pending dues are available for this student.';
  end if;

  if v_revised_pending <= 0 then
    raise exception 'No payable dues found after discount and late fee waiver.';
  end if;

  if p_total_amount > v_revised_pending then
    raise exception 'Payment amount cannot exceed revised payable amount.';
  end if;

  v_normalized_prefix := coalesce(nullif(trim(coalesce(p_receipt_prefix, '')), ''), 'SVP');

  select coalesce(max((regexp_match(receipt_row.receipt_number, '-([0-9]{4})$'))[1]::integer), 0)
  into v_daily_sequence
  from public.receipts as receipt_row
  where receipt_row.receipt_number like v_normalized_prefix || to_char(p_payment_date, 'YYYYMMDD') || '-%';

  for _attempt in 1..12 loop
    v_daily_sequence := v_daily_sequence + 1;
    v_candidate_receipt_number := v_normalized_prefix || to_char(p_payment_date, 'YYYYMMDD') || '-' || lpad(v_daily_sequence::text, 4, '0');

    begin
      insert into public.receipts (
        receipt_number, student_id, payment_date, payment_mode, total_amount,
        reference_number, notes, received_by, client_request_id
      )
      values (
        v_candidate_receipt_number, p_student_id, p_payment_date, p_payment_mode, p_total_amount,
        nullif(trim(coalesce(p_reference_number, '')), ''),
        v_receipt_notes,
        nullif(trim(coalesce(p_received_by, '')), ''),
        p_client_request_id
      )
      returning id into v_candidate_receipt_id;
      exit;
    exception when unique_violation then
      if p_client_request_id is not null then
        select r.id, r.receipt_number, r.total_amount
        into v_candidate_receipt_id, v_existing_receipt_number, v_existing_total_amount
        from public.receipts as r
        where r.student_id = p_student_id
          and r.client_request_id = p_client_request_id
        order by r.created_at desc
        limit 1;

        if v_candidate_receipt_id is not null then
          return query
          select v_candidate_receipt_id, v_existing_receipt_number, v_existing_total_amount;
          return;
        end if;
      end if;
      continue;
    end;
  end loop;

  if v_candidate_receipt_id is null then
    raise exception 'Unable to generate a unique receipt number. Please retry.';
  end if;

  for balance_row in
    select snapshot.installment_id, snapshot.pending_amount, snapshot.due_date,
           snapshot.installment_no, snapshot.plan_priority
    from jsonb_to_recordset(v_workbook_snapshot) as snapshot(
      installment_id uuid,
      pending_amount integer,
      due_date date,
      installment_no smallint,
      plan_priority integer
    )
    where snapshot.pending_amount > 0
    order by snapshot.plan_priority asc, snapshot.due_date asc, snapshot.installment_no asc
  loop
    exit when v_remaining_payment <= 0 and v_remaining_discount <= 0 and v_remaining_waiver <= 0;

    v_discount_allocation := least(v_remaining_discount, balance_row.pending_amount);
    v_waiver_allocation := least(v_remaining_waiver, balance_row.pending_amount - v_discount_allocation);
    v_payment_allocation := least(v_remaining_payment, balance_row.pending_amount - v_discount_allocation - v_waiver_allocation);

    if v_discount_allocation > 0 then
      insert into public.receipt_adjustments (
        receipt_id, student_id, installment_id, adjustment_type, amount_delta, reason, notes
      )
      values (
        v_candidate_receipt_id, p_student_id, balance_row.installment_id, 'discount',
        v_discount_allocation, 'Payment Desk quick discount', null
      );
      v_remaining_discount := v_remaining_discount - v_discount_allocation;
    end if;

    if v_waiver_allocation > 0 then
      insert into public.receipt_adjustments (
        receipt_id, student_id, installment_id, adjustment_type, amount_delta, reason, notes
      )
      values (
        v_candidate_receipt_id, p_student_id, balance_row.installment_id, 'writeoff',
        v_waiver_allocation, 'Payment Desk late fee waiver', null
      );
      v_remaining_waiver := v_remaining_waiver - v_waiver_allocation;
    end if;

    if v_payment_allocation > 0 then
      v_pending_after := balance_row.pending_amount
        - v_discount_allocation - v_waiver_allocation - v_payment_allocation;
      insert into public.payments (
        receipt_id, student_id, installment_id, amount, notes,
        discount_applied_at_posting, waiver_applied_at_posting,
        pending_before_posting, pending_after_posting
      )
      values (
        v_candidate_receipt_id, p_student_id, balance_row.installment_id, v_payment_allocation,
        null,
        v_discount_allocation, v_waiver_allocation,
        balance_row.pending_amount, v_pending_after
      );
      v_remaining_payment := v_remaining_payment - v_payment_allocation;

      if balance_row.plan_priority = 0 then
        v_plan_contribution := v_plan_contribution + v_payment_allocation;
      end if;
    end if;
  end loop;

  if v_remaining_payment <> 0 or v_remaining_discount <> 0 or v_remaining_waiver <> 0 then
    raise exception 'Unable to allocate payment and concessions cleanly. Please retry.';
  end if;

  if v_plan_id is not null then
    insert into public.student_repayment_receipt_links (
      plan_id, student_id, receipt_id,
      contribution_amount, spillover_amount,
      plan_balance_before, plan_balance_after
    )
    values (
      v_plan_id, p_student_id, v_candidate_receipt_id,
      v_plan_contribution, p_total_amount - v_plan_contribution,
      v_plan_balance_before, v_plan_balance_before - v_plan_contribution
    );
  end if;

  return query select v_candidate_receipt_id, v_candidate_receipt_number, p_total_amount;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.preview_student_repayment_plan(p_student_id uuid, p_session_label text, p_scope text, p_monthly_amount integer DEFAULT NULL::integer, p_first_due_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_opening integer;
  v_old integer;
  v_current integer;
  v_late integer;
  v_items jsonb;
  v_schedule jsonb;
  v_term integer;
  v_final integer;
  v_end date;
  v_errors text[] := array[]::text[];
  v_active_plan uuid;
begin
  if not public.has_permission('fees:repayment_plan') then
    raise exception 'You do not have permission to manage EMI repayment plans.';
  end if;

  if p_scope not in ('old_balance_only', 'current_year_only', 'old_and_current') then
    raise exception 'Unknown repayment plan scope: %.', p_scope;
  end if;

  select id into v_active_plan
  from public.student_repayment_plans
  where student_id = p_student_id and lifecycle = 'active'
  limit 1;

  select
    coalesce(sum(c.base_pending), 0)::integer,
    coalesce(sum(c.base_pending) filter (where c.is_carry_forward), 0)::integer,
    coalesce(sum(c.base_pending) filter (where not c.is_carry_forward), 0)::integer,
    coalesce(sum(c.charged_late_fee), 0)::integer,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'installmentId', c.installment_id,
          'installmentNo', c.installment_no,
          'installmentLabel', c.installment_label,
          'dueDate', c.due_date,
          'isCarryForward', c.is_carry_forward,
          'baseCharge', c.base_charge,
          'includedBaseBalance', c.base_pending,
          'chargedLateFee', c.charged_late_fee
        )
        order by c.due_date, c.installment_no
      ),
      '[]'::jsonb
    )
  into v_opening, v_old, v_current, v_late, v_items
  from private.repayment_plan_candidates(
    p_student_id,
    p_session_label,
    p_scope,
    (now() at time zone 'Asia/Kolkata')::date
  ) as c;

  if v_active_plan is not null then
    v_errors := array_append(
      v_errors,
      'This student already has an active EMI plan. Reschedule or cancel it first.'::text
    );
  end if;

  if v_opening <= 0 then
    v_errors := array_append(
      v_errors,
      case
        when p_scope = 'old_balance_only'
          then 'This student has no unpaid previous-year balance to convert.'
        else 'This student has no unpaid dues to convert.'
      end::text
    );
  end if;

  if p_monthly_amount is null or p_monthly_amount <= 0 then
    v_errors := array_append(v_errors, 'Enter a monthly EMI amount greater than 0.'::text);
  elsif v_opening > 0 then
    v_term := greatest(ceil(v_opening::numeric / p_monthly_amount::numeric)::integer, 1);

    if v_term > 12 then
      v_errors := array_append(v_errors, format(
        'At Rs %s a month this plan needs %s months. The maximum term is 12 months — Rs %s a month or more clears it in time.',
        p_monthly_amount,
        v_term,
        ceil(v_opening::numeric / 12)::integer
      )::text);
      v_term := null;
    end if;
  end if;

  if p_first_due_date is null then
    v_errors := array_append(v_errors, 'Choose the first EMI due date.'::text);
  end if;

  if v_term is not null and p_first_due_date is not null then
    select
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'sequenceNo', s.sequence_no,
            'dueDate', s.due_date,
            'amount', s.amount
          )
          order by s.sequence_no
        ),
        '[]'::jsonb
      ),
      max(s.due_date),
      max(s.amount) filter (where s.sequence_no = v_term)
    into v_schedule, v_end, v_final
    from private.repayment_plan_schedule(p_first_due_date, p_monthly_amount, v_opening) as s;
  end if;

  return jsonb_build_object(
    'studentId', p_student_id,
    'sessionLabel', p_session_label,
    'scope', p_scope,
    'openingBalance', coalesce(v_opening, 0),
    'oldBalanceIncluded', coalesce(v_old, 0),
    'currentYearIncluded', coalesce(v_current, 0),
    'lateFeeWaived', coalesce(v_late, 0),
    'installmentCount', jsonb_array_length(coalesce(v_items, '[]'::jsonb)),
    'monthlyAmount', p_monthly_amount,
    'firstDueDate', p_first_due_date,
    'termMonths', v_term,
    'finalInstallmentAmount', v_final,
    'endDate', v_end,
    'items', coalesce(v_items, '[]'::jsonb),
    'schedule', coalesce(v_schedule, '[]'::jsonb),
    'hasActivePlan', v_active_plan is not null,
    'errors', to_jsonb(v_errors),
    'canActivate', array_length(v_errors, 1) is null
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.preview_workbook_payment_allocation(p_student_id uuid, p_payment_date date DEFAULT CURRENT_DATE)
 RETURNS TABLE(installment_id uuid, student_id uuid, admission_no text, student_name text, father_name text, father_phone text, session_label text, class_id uuid, class_name text, class_label text, section text, stream_name text, installment_no smallint, installment_label text, is_carry_forward boolean, source_session_label text, target_session_label text, carry_forward_fee_head text, due_date date, base_charge integer, paid_amount integer, adjustment_amount integer, applied_amount integer, raw_late_fee integer, waiver_applied integer, final_late_fee integer, total_charge integer, pending_amount integer, late_fee_pending integer, total_pending integer, balance_status text, late_fee_status text, last_payment_date date, transport_route_id uuid, transport_route_name text, transport_route_code text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
  select
    snapshot_row.installment_id, snapshot_row.student_id, snapshot_row.admission_no,
    snapshot_row.student_name, snapshot_row.father_name, snapshot_row.father_phone,
    snapshot_row.session_label, snapshot_row.class_id, snapshot_row.class_name,
    snapshot_row.class_label, snapshot_row.section, snapshot_row.stream_name,
    snapshot_row.installment_no, snapshot_row.installment_label,
    coalesce(installment_row.is_carry_forward, false) as is_carry_forward,
    installment_row.source_session_label,
    installment_row.target_session_label,
    installment_row.carry_forward_fee_head,
    snapshot_row.due_date, snapshot_row.base_charge, snapshot_row.paid_amount,
    snapshot_row.adjustment_amount, snapshot_row.applied_amount,
    snapshot_row.raw_late_fee, snapshot_row.waiver_applied,
    snapshot_row.final_late_fee, snapshot_row.total_charge,
    snapshot_row.pending_amount, snapshot_row.late_fee_pending,
    snapshot_row.total_pending,
    snapshot_row.balance_status, snapshot_row.late_fee_status,
    snapshot_row.last_payment_date, snapshot_row.transport_route_id,
    snapshot_row.transport_route_name, snapshot_row.transport_route_code
  from private.workbook_installment_snapshot(p_student_id, p_payment_date, true) as snapshot_row
  join public.installments as installment_row
    on installment_row.id = snapshot_row.installment_id
  where (
    coalesce(auth.role(), '') = 'service_role'
    or public.has_any_permission(array[
      'payments:view', 'payments:write', 'ledger:view',
      'receipts:view', 'dashboard:view', 'finance:view'
    ])
  )
    and snapshot_row.total_pending > 0
  order by snapshot_row.due_date asc, snapshot_row.installment_no asc;
$function$
;

CREATE OR REPLACE FUNCTION public.process_refund_with_adjustment(p_refund_request_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare
  v_status public.refund_request_status;
  v_receipt_id uuid;
  v_student_id uuid;
  v_amount integer;
  v_remaining integer;
  v_alloc integer;
  pay record;
begin
  if not public.has_permission('finance:write') then
    raise exception 'You do not have permission to process refunds.';
  end if;

  select status, receipt_id, student_id, requested_amount
  into v_status, v_receipt_id, v_student_id, v_amount
  from public.refund_requests
  where id = p_refund_request_id
  for update;

  if not found then
    raise exception 'Refund request not found.';
  end if;

  if v_status <> 'approved' then
    raise exception 'Only approved refund requests can be processed.';
  end if;

  v_remaining := v_amount;

  -- Allocate the refund across the receipt's payment rows. Each payment's
  -- refundable headroom is its gross amount net of any prior adjustments
  -- (reversals are negative), so repeated partial refunds against the same
  -- receipt can never sum past what was actually paid — guarding cumulative
  -- over-refund, not just a single oversized request.
  for pay in
    select
      p.id,
      p.installment_id,
      (
        p.amount
        + coalesce(
            (
              select sum(a.amount_delta)
              from public.payment_adjustments as a
              where a.payment_id = p.id
            ),
            0
          )
      )::integer as available
    from public.payments as p
    where p.receipt_id = v_receipt_id
      and p.student_id = v_student_id
    order by available desc, p.id
  loop
    exit when v_remaining <= 0;
    continue when pay.available <= 0;

    v_alloc := least(v_remaining, pay.available);

    insert into public.payment_adjustments (
      payment_id, student_id, installment_id, adjustment_type, amount_delta, reason, notes
    )
    values (
      pay.id, v_student_id, pay.installment_id, 'reversal', -v_alloc,
      'Refund processed',
      'refund_request:' || p_refund_request_id::text
    );

    v_remaining := v_remaining - v_alloc;
  end loop;

  if v_remaining > 0 then
    raise exception 'Refund amount exceeds the remaining refundable balance on this receipt.';
  end if;

  update public.refund_requests
  set status = 'processed',
      processed_at = now(),
      processed_by = auth.uid()
  where id = p_refund_request_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.queue_workbook_materialized_view_refresh()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
begin
  insert into public.workbook_materialized_view_refresh_queue (queue_key, requested_at, request_count)
  values ('workbook', now(), 1)
  on conflict (queue_key) do update
    set pending = true,
        requested_at = excluded.requested_at,
        request_count = public.workbook_materialized_view_refresh_queue.request_count + 1;

  perform pg_notify(
    'workbook_refresh',
    json_build_object('requested_at', now())::text
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.realign_recent_import_students_to_active_session(p_run_by uuid DEFAULT NULL::uuid)
 RETURNS TABLE(moved_count integer, attention_count integer, moved_student_ids uuid[])
 LANGUAGE plpgsql
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_active_session text;
begin
  if not public.has_permission('fees:write') then
    raise exception 'Missing permission: fees:write';
  end if;

  select public.active_session_label()
  into v_active_session;

  if coalesce(trim(v_active_session), '') = '' then
    raise exception 'Active Fee Setup session is not configured.';
  end if;

  return query
  with recent_batches as (
    select id, target_session_label, created_at
    from public.import_batches
    where created_at > now() - interval '7 days'
      and coalesce(trim(target_session_label), '') <> ''
      and trim(target_session_label) <> trim(v_active_session)
  ),
  affected as (
    select distinct on (coalesce(ir.imported_student_id, ir.target_student_id))
      coalesce(ir.imported_student_id, ir.target_student_id) as student_id,
      rb.id as batch_id,
      c.session_label as from_session,
      c.id as from_class_id,
      c.class_name,
      c.stream_name
    from public.import_rows ir
    join recent_batches rb on rb.id = ir.batch_id
    join public.students s on s.id = coalesce(ir.imported_student_id, ir.target_student_id)
    join public.classes c on c.id = s.class_id
    where coalesce(ir.imported_student_id, ir.target_student_id) is not null
    order by coalesce(ir.imported_student_id, ir.target_student_id), rb.created_at desc
  ),
  matched as (
    select
      a.student_id,
      a.batch_id,
      a.from_session,
      a.from_class_id,
      active_class.id as to_class_id
    from affected a
    left join public.classes active_class
      on active_class.session_label = v_active_session
      and active_class.status = 'active'
      and private.normalize_workbook_class_label(active_class.class_name, active_class.stream_name)
        = private.normalize_workbook_class_label(a.class_name, a.stream_name)
  ),
  moved_source as (
    select *
    from matched
    where to_class_id is not null
      and from_class_id <> to_class_id
  ),
  updated_students as (
    update public.students s
    set class_id = ms.to_class_id,
        updated_by = p_run_by,
        updated_at = now()
    from moved_source ms
    where s.id = ms.student_id
    returning s.id, ms.from_session, ms.batch_id
  ),
  audit_rows as (
    insert into public.student_session_reanchor_log (
      student_id,
      from_session,
      to_session,
      batch_id,
      run_by
    )
    select
      us.id,
      us.from_session,
      v_active_session,
      us.batch_id,
      p_run_by
    from updated_students us
    returning student_id
  )
  select
    coalesce((select count(*)::integer from audit_rows), 0) as moved_count,
    coalesce((
      select count(*)::integer
      from matched
      where to_class_id is null
    ), 0) as attention_count,
    coalesce((select array_agg(student_id) from audit_rows), array[]::uuid[]) as moved_student_ids;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.refresh_defaulter_recovery_state(p_session_label text, p_today date DEFAULT CURRENT_DATE)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_rows integer := 0;
begin
  if not public.has_permission('defaulters:view') then
    raise exception 'Unauthorized recovery state refresh.' using errcode = '28000';
  end if;

  with latest_promises as (
    select distinct on (dc.student_id)
      dc.id as contact_id,
      dc.student_id,
      dc.session_label,
      dc.contacted_at,
      dc.snooze_until,
      (
        select sfm.family_group_id
        from public.student_family_members sfm
        where sfm.student_id = dc.student_id
          and sfm.academic_session_label = dc.session_label
        order by sfm.created_at desc
        limit 1
      ) as family_group_id,
      exists (
        select 1
        from public.receipts r
        join public.payments p
          on p.receipt_id = r.id
          and p.student_id = r.student_id
        join public.installments i
          on i.id = p.installment_id
          and i.student_id = p.student_id
        join public.classes
          on classes.id = i.class_id
          and classes.session_label = dc.session_label
        where r.student_id = dc.student_id
          and r.payment_date >= dc.contacted_at::date
      ) as paid_since_promise
    from public.defaulter_contacts dc
    where dc.session_label = p_session_label
      and dc.outcome = 'promised_pay'
      and dc.snooze_until is not null
      and (
        dc.snooze_until <= p_today
        or exists (
          select 1
          from public.receipts r
          join public.payments p
            on p.receipt_id = r.id
            and p.student_id = r.student_id
          join public.installments i
            on i.id = p.installment_id
            and i.student_id = p.student_id
          join public.classes
            on classes.id = i.class_id
            and classes.session_label = dc.session_label
          where r.student_id = dc.student_id
            and r.payment_date >= dc.contacted_at::date
        )
      )
    order by dc.student_id, dc.contacted_at desc, dc.id desc
  ),
  resolved as (
    select
      contact_id,
      student_id,
      session_label,
      family_group_id,
      case
        when paid_since_promise then 'kept'
        when snooze_until < p_today then 'broken'
        else null
      end as outcome
    from latest_promises
  ),
  upserted as (
    insert into public.defaulter_recovery_state (
      student_id,
      session_label,
      family_group_id,
      recovery_stage,
      promise_resolved_outcome,
      promise_resolved_at,
      last_resolved_contact_id,
      promise_kept_count,
      promise_broken_count
    )
    select
      resolved.student_id,
      resolved.session_label,
      resolved.family_group_id,
      case when resolved.outcome = 'broken' then 'promise_due' else 'standard' end,
      resolved.outcome,
      now(),
      resolved.contact_id,
      case when resolved.outcome = 'kept' then 1 else 0 end,
      case when resolved.outcome = 'broken' then 1 else 0 end
    from resolved
    where resolved.outcome is not null
    on conflict (student_id, session_label) do update
    set
      family_group_id = coalesce(excluded.family_group_id, defaulter_recovery_state.family_group_id),
      recovery_stage = excluded.recovery_stage,
      promise_resolved_outcome = excluded.promise_resolved_outcome,
      promise_resolved_at = case
        when defaulter_recovery_state.last_resolved_contact_id is distinct from excluded.last_resolved_contact_id
          then excluded.promise_resolved_at
        else defaulter_recovery_state.promise_resolved_at
      end,
      last_resolved_contact_id = excluded.last_resolved_contact_id,
      promise_kept_count = defaulter_recovery_state.promise_kept_count + case
        when defaulter_recovery_state.last_resolved_contact_id is distinct from excluded.last_resolved_contact_id
          and excluded.promise_resolved_outcome = 'kept'
          then 1
        else 0
      end,
      promise_broken_count = defaulter_recovery_state.promise_broken_count + case
        when defaulter_recovery_state.last_resolved_contact_id is distinct from excluded.last_resolved_contact_id
          and excluded.promise_resolved_outcome = 'broken'
          then 1
        else 0
      end
    returning 1
  )
  select count(*) into v_rows from upserted;

  return v_rows;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.refresh_financial_materialized_views(p_concurrently boolean DEFAULT true)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
begin
  if p_concurrently then
    refresh materialized view concurrently public.v_workbook_installment_balances;
    refresh materialized view concurrently public.v_workbook_student_financials;
    refresh materialized view concurrently public.v_student_financial_state;
  else
    refresh materialized view public.v_workbook_installment_balances;
    refresh materialized view public.v_workbook_student_financials;
    refresh materialized view public.v_student_financial_state;
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.refresh_workbook_materialized_views_if_requested()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_requested_at timestamptz;
begin
  select requested_at
    into v_requested_at
  from public.workbook_materialized_view_refresh_queue
  where queue_key = 'workbook'
    and pending = true
  for update skip locked;

  if v_requested_at is null then
    return false;
  end if;

  perform public.refresh_financial_materialized_views(true);

  update public.workbook_materialized_view_refresh_queue
  set pending = false,
      last_refreshed_at = now(),
      request_count = 0
  where queue_key = 'workbook';

  return true;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.reschedule_student_repayment_plan(p_plan_id uuid, p_monthly_amount integer, p_first_due_date date, p_reason text, p_expected_remaining_balance integer DEFAULT NULL::integer, p_client_request_id uuid DEFAULT NULL::uuid, p_due_dates date[] DEFAULT NULL::date[])
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_old record;
  v_new_plan_id uuid := gen_random_uuid();
  v_remaining integer;
  v_term integer;
  v_final integer;
  v_reason text;
  v_actor_label text;
  v_item record;
  v_schedule record;
  v_first_due date;
begin
  if not public.has_permission('fees:repayment_plan') then
    raise exception 'You do not have permission to manage EMI repayment plans.';
  end if;

  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  if v_reason is null or length(v_reason) < 4 then
    raise exception 'A reason of at least 4 characters is required to reschedule an EMI plan.';
  end if;

  if p_monthly_amount is null or p_monthly_amount <= 0 then
    raise exception 'Monthly EMI amount must be greater than 0.';
  end if;

  v_first_due := coalesce(p_due_dates[1], p_first_due_date);

  if v_first_due is null then
    raise exception 'First EMI due date is required.';
  end if;

  select * into v_old from public.student_repayment_plans where id = p_plan_id;

  if v_old.id is null then
    raise exception 'EMI plan not found.';
  end if;

  if v_old.lifecycle <> 'active' then
    raise exception 'Only an active EMI plan can be rescheduled (this one is %).', v_old.lifecycle;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_old.student_id::text, 0));

  v_remaining := private.repayment_plan_remaining(p_plan_id);

  if v_remaining <= 0 then
    raise exception 'This EMI plan is already cleared — there is nothing left to reschedule.';
  end if;

  if p_expected_remaining_balance is not null and p_expected_remaining_balance <> v_remaining then
    raise exception
      'The plan balance changed while this reschedule was being set up (showed Rs %, now Rs %). Reload and review.',
      p_expected_remaining_balance, v_remaining;
  end if;

  v_term := greatest(ceil(v_remaining::numeric / p_monthly_amount::numeric)::integer, 1);

  if v_term > 12 then
    raise exception
      'At Rs % a month this plan needs % months. The maximum term is 12 months.',
      p_monthly_amount, v_term;
  end if;

  if p_due_dates is not null and array_length(p_due_dates, 1) is distinct from v_term then
    raise exception
      'This plan needs % instalment dates but % were supplied.',
      v_term, coalesce(array_length(p_due_dates, 1), 0);
  end if;

  v_final := v_remaining - p_monthly_amount * (v_term - 1);

  select nullif(btrim(coalesce(u.full_name, '')), '')
  into v_actor_label
  from public.users u
  where u.id = auth.uid();

  update public.student_repayment_plans
  set lifecycle = 'superseded',
      superseded_by_plan_id = v_new_plan_id
  where id = p_plan_id;

  insert into public.student_repayment_plans (
    id, student_id, session_label, scope,
    opening_balance, monthly_amount, first_due_date,
    term_months, final_installment_amount, waived_late_fee_total,
    reason, lifecycle, supersedes_plan_id,
    activated_by, activated_by_label
  )
  values (
    v_new_plan_id, v_old.student_id, v_old.session_label, v_old.scope,
    v_remaining, p_monthly_amount, v_first_due,
    v_term::smallint, v_final, 0,
    v_reason, 'active', p_plan_id,
    auth.uid(), v_actor_label
  );

  for v_item in
    select
      i.installment_id,
      i.installment_no,
      i.installment_label,
      i.due_date,
      i.is_carry_forward,
      snap.base_charge,
      greatest(snap.pending_amount, 0)::integer as base_pending
    from public.student_repayment_plan_items i
    join lateral private.workbook_installment_snapshot(
      v_old.student_id, (now() at time zone 'Asia/Kolkata')::date, true
    ) snap on snap.installment_id = i.installment_id
    where i.plan_id = p_plan_id
    order by i.due_date, i.installment_no
  loop
    if v_item.base_pending > 0 then
      insert into public.student_repayment_plan_items (
        plan_id, student_id, installment_id,
        installment_no, installment_label, due_date, is_carry_forward,
        snapshot_base_charge, included_base_balance, waived_late_fee
      )
      values (
        v_new_plan_id, v_old.student_id, v_item.installment_id,
        v_item.installment_no, v_item.installment_label, v_item.due_date, v_item.is_carry_forward,
        v_item.base_charge, v_item.base_pending, 0
      );
    end if;
  end loop;

  for v_schedule in
    select * from private.repayment_plan_schedule(v_first_due, p_monthly_amount, v_remaining)
  loop
    insert into public.student_repayment_schedule (
      plan_id, student_id, sequence_no, due_date, amount
    )
    values (
      v_new_plan_id, v_old.student_id, v_schedule.sequence_no,
      coalesce(p_due_dates[v_schedule.sequence_no], v_schedule.due_date),
      v_schedule.amount
    );
  end loop;

  return v_new_plan_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.reverse_receipt_admin(p_receipt_id uuid, p_reason text)
 RETURNS TABLE(receipt_id uuid, receipt_number text, reversed_amount integer, already_reversed_amount integer, concession_amount integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare
  v_receipt record;
  v_reversed integer := 0;
  v_already_reversed integer := 0;
  v_concessions integer := 0;
  v_open_refunds integer;
  v_alloc integer;
  pay record;
begin
  -- Dual-gated. A browser session needs the permission; the headless bulk
  -- correction path runs as the service role, where `auth.uid()` is null and
  -- `has_permission` can only ever answer false. Same shape as
  -- get_dashboard_repayment_summary.
  if coalesce(auth.role(), '') <> 'service_role'
     and not (select public.has_permission('payments:reverse_any'))
  then
    raise exception 'You do not have permission to reverse a posted receipt.';
  end if;

  -- The explanation is the point of this function, so unlike undo there is no
  -- default reason to fall back to.
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'A reason is required to reverse a receipt.';
  end if;

  select r.id, r.receipt_number, r.student_id, r.total_amount, r.payment_date
  into v_receipt
  from public.receipts as r
  where r.id = p_receipt_id;

  if not found then
    raise exception 'Receipt not found.';
  end if;

  -- Serialize against concurrent posts, refunds and undos for the same student.
  -- Same lock key scheme as post_student_payment_with_adjustments.
  perform pg_advisory_xact_lock(hashtextextended(v_receipt.student_id::text, 0));

  -- No time window. That is the whole point of this function existing.

  select count(*)
  into v_open_refunds
  from public.refund_requests as rr
  where rr.receipt_id = p_receipt_id
    and rr.status <> 'rejected';

  if v_open_refunds > 0 then
    raise exception 'This receipt has a refund request in progress. Resolve that first, in Finance Controls.';
  end if;

  select coalesce(sum(-a.amount_delta), 0)::integer
  into v_already_reversed
  from public.payment_adjustments as a
  join public.payments as p on p.id = a.payment_id
  where p.receipt_id = p_receipt_id
    and a.adjustment_type = 'reversal'
    and a.amount_delta < 0;

  select coalesce(sum(ra.amount_delta), 0)::integer
  into v_concessions
  from public.receipt_adjustments as ra
  where ra.receipt_id = p_receipt_id;

  -- Reverse what is LEFT on each payment row, not its gross amount. A receipt
  -- that already carries a partial refund, or a stray manual ledger adjustment,
  -- reverses cleanly down to zero instead of being refused or over-reversed.
  -- Same headroom arithmetic as process_refund_with_adjustment.
  for pay in
    select
      p.id,
      p.student_id,
      p.installment_id,
      (
        p.amount
        + coalesce(
            (
              select sum(a.amount_delta)
              from public.payment_adjustments as a
              where a.payment_id = p.id
            ),
            0
          )
      )::integer as available
    from public.payments as p
    where p.receipt_id = p_receipt_id
    order by p.id
  loop
    continue when pay.available <= 0;

    v_alloc := pay.available;

    insert into public.payment_adjustments (
      payment_id, student_id, installment_id, adjustment_type, amount_delta, reason, notes
    )
    values (
      pay.id, pay.student_id, pay.installment_id, 'reversal', -v_alloc,
      trim(p_reason),
      'admin_reversal:' || p_receipt_id::text
    );

    v_reversed := v_reversed + v_alloc;
  end loop;

  if v_reversed = 0 then
    raise exception 'This receipt is already fully reversed. Nothing left to give back.';
  end if;

  return query
  select
    v_receipt.id,
    v_receipt.receipt_number,
    v_reversed,
    v_already_reversed,
    v_concessions;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_my_preferred_locale(p_locale text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_locale is not null and p_locale not in ('en', 'hi', 'hi-en') then
    raise exception 'Unsupported locale %', p_locale;
  end if;

  update public.users
     set preferred_locale = p_locale
   where id = auth.uid()
     and preferred_locale is distinct from p_locale;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_repayment_plan_late_fees(p_session_label text DEFAULT NULL::text, p_dry_run boolean DEFAULT false, p_as_of date DEFAULT NULL::date)
 RETURNS TABLE(plan_id uuid, student_id uuid, missed_emis integer, already_charged integer, charged_now integer, charged_amount integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_flat constant integer := 1000;
  v_today date := coalesce(p_as_of, (now() at time zone 'Asia/Kolkata')::date);
  v_plan record;
  v_emi record;
  v_missed integer;
  v_already integer;
  v_charged integer;
  v_class_id uuid;
  v_fee_setting_id uuid;
  v_installment_no smallint;
  v_installment_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and coalesce(current_setting('request.jwt.claims', true), '') <> ''
     and not public.has_permission('fees:repayment_plan')
  then
    raise exception 'You do not have permission to charge EMI late fees.';
  end if;

  for v_plan in
    select p.id as pid, p.student_id as sid, p.session_label as slabel,
           coalesce(v.paid_to_date, 0) as paid
    from public.student_repayment_plans p
    join public.v_student_repayment_plan_status v on v.plan_id = p.id
    where p.lifecycle = 'active'
      and (p_session_label is null or p.session_label = p_session_label)
  loop
    -- Every covered installment belongs to the same student; take the class and
    -- fee setting from one of them so the synthetic row hangs off real config.
    select i.class_id, i.fee_setting_id
      into v_class_id, v_fee_setting_id
    from public.student_repayment_plan_items it
    join public.installments i on i.id = it.installment_id
    where it.plan_id = v_plan.pid
    order by i.installment_no desc
    limit 1;

    if v_class_id is null then
      continue;  -- a plan with no items cannot be priced; leave it alone
    end if;

    v_missed := 0;
    v_already := 0;
    v_charged := 0;

    for v_emi in
      select s.sequence_no, s.due_date,
             sum(s.amount) over (order by s.sequence_no
                                 rows between unbounded preceding and current row) as running_total
      from public.student_repayment_schedule s
      where s.plan_id = v_plan.pid
      order by s.sequence_no
    loop
      -- Missed: the due date has passed and the money owed by this point in the
      -- calendar has not arrived.
      if v_emi.due_date >= v_today or v_emi.running_total <= v_plan.paid then
        continue;
      end if;

      v_missed := v_missed + 1;

      if exists (
        select 1 from public.student_repayment_emi_late_fees f
        where f.plan_id = v_plan.pid and f.sequence_no = v_emi.sequence_no
      ) then
        v_already := v_already + 1;
        continue;
      end if;

      if p_dry_run then
        v_charged := v_charged + 1;
        continue;
      end if;

      select n into v_installment_no
      from generate_series(101, 199) as n
      where not exists (
        select 1 from public.installments i
        where i.student_id = v_plan.sid
          and i.class_id = v_class_id
          and i.installment_no = n
      )
      order by n
      limit 1;

      if v_installment_no is null then
        raise exception 'No free EMI late-fee installment number for student %', v_plan.sid;
      end if;

      insert into public.installments (
        student_id, class_id, fee_setting_id, installment_no, installment_label,
        due_date, base_amount, transport_amount, discount_amount,
        late_fee_flat_amount, status, is_emi_late_fee, notes
      )
      values (
        v_plan.sid, v_class_id, v_fee_setting_id, v_installment_no,
        format('EMI %s late fee (%s)', v_emi.sequence_no,
               to_char(v_emi.due_date, 'DD-MM-YYYY')),
        v_emi.due_date, 0, 0, 0,
        v_flat, 'scheduled', true,
        format('Monthly EMI %s was not paid by %s. Flat late fee.',
               v_emi.sequence_no, to_char(v_emi.due_date, 'DD-MM-YYYY'))
      )
      returning id into v_installment_id;

      insert into public.student_repayment_emi_late_fees (
        plan_id, student_id, session_label, sequence_no, emi_due_date,
        amount, backing_installment_id
      )
      values (
        v_plan.pid, v_plan.sid, v_plan.slabel, v_emi.sequence_no, v_emi.due_date,
        v_flat, v_installment_id
      );

      v_charged := v_charged + 1;
    end loop;

    if v_missed > 0 then
      plan_id := v_plan.pid;
      student_id := v_plan.sid;
      missed_emis := v_missed;
      already_charged := v_already;
      charged_now := v_charged;
      charged_amount := v_charged * v_flat;
      return next;
    end if;
  end loop;

  return;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trigger_refresh_financial_views()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.queue_workbook_materialized_view_refresh();
  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.undo_recent_payment(p_receipt_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS TABLE(receipt_id uuid, receipt_number text, reversed_amount integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare
  v_receipt record;
  v_reversed integer := 0;
  v_existing_adjustments integer;
  v_open_refunds integer;
  pay record;
begin
  if not (select public.has_permission('payments:adjust')) then
    raise exception 'You do not have permission to undo payments.';
  end if;

  select r.id, r.receipt_number, r.student_id, r.total_amount, r.created_at
  into v_receipt
  from public.receipts as r
  where r.id = p_receipt_id;

  if not found then
    raise exception 'Receipt not found.';
  end if;

  -- Serialize against concurrent posts/refunds/undos for the same student
  -- (same lock key scheme as post_student_payment).
  perform pg_advisory_xact_lock(hashtextextended(v_receipt.student_id::text, 0));

  if v_receipt.created_at < now() - interval '10 minutes' then
    raise exception 'Undo window has passed (10 minutes). Use the refund workflow in Finance Controls instead.';
  end if;

  select count(*)
  into v_existing_adjustments
  from public.payment_adjustments as a
  join public.payments as p on p.id = a.payment_id
  where p.receipt_id = p_receipt_id;

  if v_existing_adjustments > 0 then
    raise exception 'This receipt already has adjustments and cannot be undone. Use the refund workflow in Finance Controls instead.';
  end if;

  select count(*)
  into v_open_refunds
  from public.refund_requests as rr
  where rr.receipt_id = p_receipt_id
    and rr.status <> 'rejected';

  if v_open_refunds > 0 then
    raise exception 'This receipt has a refund request in progress and cannot be undone.';
  end if;

  for pay in
    select p.id, p.student_id, p.installment_id, p.amount
    from public.payments as p
    where p.receipt_id = p_receipt_id
    order by p.id
  loop
    continue when pay.amount <= 0;

    insert into public.payment_adjustments (
      payment_id, student_id, installment_id, adjustment_type, amount_delta, reason, notes
    )
    values (
      pay.id, pay.student_id, pay.installment_id, 'reversal', -pay.amount,
      coalesce(nullif(trim(p_reason), ''), 'Payment undone — accidental posting'),
      'payment_undo:' || p_receipt_id::text
    );

    v_reversed := v_reversed + pay.amount;
  end loop;

  if v_reversed = 0 then
    raise exception 'This receipt has no payment amount to undo.';
  end if;

  return query
  select v_receipt.id, v_receipt.receipt_number, v_reversed;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.void_late_fee_waiver(p_waiver_id uuid, p_reason text)
 RETURNS TABLE(ok boolean, message text, new_waiver_amount integer, removed_amount integer)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_student_id uuid;
  v_amount integer;
  v_voided timestamptz;
  v_total integer;
begin
  if not public.has_permission('payments:adjust') then
    raise exception 'You do not have permission to reverse a late-fee waiver.';
  end if;

  if p_waiver_id is null then
    raise exception 'Waiver is required.';
  end if;
  if p_reason is null or length(trim(p_reason)) < 4 then
    raise exception 'Reason must be at least 4 characters.';
  end if;

  select student_id, amount, voided_at
    into v_student_id, v_amount, v_voided
  from public.student_late_fee_waivers
  where id = p_waiver_id;

  if v_student_id is null then
    return query select false, 'That waiver no longer exists.'::text, null::integer, null::integer;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_student_id::text, 0));

  if v_voided is not null then
    return query select false, 'That waiver has already been reversed.'::text, null::integer, 0::integer;
    return;
  end if;

  update public.student_late_fee_waivers
     set voided_at = now(),
         voided_by = auth.uid(),
         void_reason = trim(p_reason)
   where id = p_waiver_id;

  select coalesce(sum(amount), 0)::integer into v_total
  from public.student_late_fee_waivers
  where student_id = v_student_id and voided_at is null;

  return query select true, 'Waiver reversed.'::text, v_total, v_amount;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.vpps_apply_chunk_proxy(p_kind text, p_rows jsonb)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
  select private.vpps_apply_chunk(p_kind, p_rows);
$function$
;

CREATE OR REPLACE FUNCTION public.waive_late_fee(p_student_id uuid, p_amount integer, p_remarks text, p_session_label text DEFAULT NULL::text, p_client_request_id uuid DEFAULT NULL::uuid, p_installment_id uuid DEFAULT NULL::uuid, p_include_collected boolean DEFAULT false)
 RETURNS TABLE(ok boolean, message text, new_waiver_amount integer, added_amount integer)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_pending_late_fee integer;
  v_charged_late_fee integer;
  v_remaining integer;
  v_take integer;
  v_take_owed integer;
  v_take_collected integer;
  v_added integer := 0;
  v_total_waiver integer;
  v_today text;
  v_audit text;
  v_row record;
  v_already_added integer;
  v_collected boolean := coalesce(p_include_collected, false);
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not public.has_permission('payments:waive_late_fee')
  then
    raise exception 'You do not have permission to waive late fees.';
  end if;

  if v_collected
     and coalesce(auth.role(), '') <> 'service_role'
     and not public.has_permission('fees:write')
  then
    raise exception
      'Only an admin can waive a late fee that has already been collected.';
  end if;

  if p_student_id is null then
    raise exception 'Student is required.';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Waiver amount must be greater than 0.';
  end if;
  if p_remarks is null or length(trim(p_remarks)) < 4 then
    raise exception 'Reason must be at least 4 characters.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_student_id::text, 0));

  if exists (
       select 1 from public.student_repayment_plans
       where student_id = p_student_id and lifecycle = 'active'
     )
     and coalesce(auth.role(), '') <> 'service_role'
     and not public.has_permission('fees:repayment_plan')
  then
    return query select
      false,
      'This student is on an EMI plan. Only an admin can waive late fees for them.'::text,
      null::integer,
      null::integer;
    return;
  end if;

  if p_client_request_id is not null then
    select coalesce(sum(amount), 0)::integer into v_already_added
    from public.student_late_fee_waivers
    where student_id = p_student_id
      and client_request_id = p_client_request_id
      and voided_at is null;

    if v_already_added > 0 then
      select coalesce(sum(amount), 0)::integer into v_total_waiver
      from public.student_late_fee_waivers
      where student_id = p_student_id and voided_at is null;

      return query select
        true,
        'Waiver applied.'::text,
        v_total_waiver,
        v_already_added;
      return;
    end if;
  end if;

  drop table if exists _waivable;
  create temporary table _waivable on commit drop as
  select
    snap.installment_id,
    snap.installment_no,
    snap.due_date,
    snap.session_label,
    greatest(snap.final_late_fee, 0)::integer as charged,
    case
      when v_collected then greatest(snap.final_late_fee, 0)::integer
      else greatest(snap.late_fee_pending, 0)::integer
    end as remaining,
    greatest(snap.late_fee_pending, 0)::integer as still_owed
  from private.workbook_installment_snapshot(
         p_student_id,
         (now() at time zone 'Asia/Kolkata')::date,
         true
       ) as snap
  where greatest(snap.final_late_fee, 0) > 0
    and (p_installment_id is null or snap.installment_id = p_installment_id);

  select coalesce(sum(remaining), 0)::integer, coalesce(sum(charged), 0)::integer
    into v_pending_late_fee, v_charged_late_fee
  from _waivable;

  if v_pending_late_fee <= 0 then
    if v_charged_late_fee > 0 then
      return query select
        false,
        'This late fee has already been paid, so it cannot be waived. An admin can forgive it from the student page, which returns the money as credit.'::text,
        null::integer,
        null::integer;
    else
      return query select
        false,
        'This student has no pending late fee to waive.'::text,
        null::integer,
        null::integer;
    end if;
    return;
  end if;

  if p_amount > v_pending_late_fee then
    select coalesce(sum(amount), 0)::integer into v_total_waiver
    from public.student_late_fee_waivers
    where student_id = p_student_id and voided_at is null;

    return query select
      false,
      case
        when v_collected then
          format('Waiver cannot exceed the late fee still charged (%s).', v_pending_late_fee)
        else
          format('Waiver cannot exceed the current pending late fee (%s).', v_pending_late_fee)
      end::text,
      v_total_waiver,
      0::integer;
    return;
  end if;

  if p_session_label is not null
     and not exists (select 1 from _waivable where session_label = p_session_label) then
    raise exception
      'Session % does not match any waivable installment for this student.', p_session_label;
  end if;

  v_today := to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM-DD');
  v_audit := format('Waive late fee %s on %s: %s', p_amount, v_today, p_remarks);

  v_remaining := p_amount;
  for v_row in
    select * from _waivable where remaining > 0 order by due_date, installment_no
  loop
    exit when v_remaining <= 0;
    v_take := least(v_remaining, v_row.remaining);
    v_take_owed := least(v_take, v_row.still_owed);
    v_take_collected := v_take - v_take_owed;

    if v_take_owed > 0 then
      insert into public.student_late_fee_waivers (
        student_id, installment_id, session_label, amount, reason,
        source, client_request_id, waived_by
      ) values (
        p_student_id, v_row.installment_id, v_row.session_label, v_take_owed, v_audit,
        case when p_installment_id is null then 'manual' else 'payment_desk' end,
        p_client_request_id, auth.uid()
      );
    end if;

    if v_take_collected > 0 then
      insert into public.student_late_fee_waivers (
        student_id, installment_id, session_label, amount, reason,
        source, client_request_id, waived_by
      ) values (
        p_student_id, v_row.installment_id, v_row.session_label, v_take_collected, v_audit,
        'manual_collected',
        p_client_request_id, auth.uid()
      );
    end if;

    if v_take > 0 then
      v_remaining := v_remaining - v_take;
      v_added := v_added + v_take;
    end if;
  end loop;

  select coalesce(sum(amount), 0)::integer into v_total_waiver
  from public.student_late_fee_waivers
  where student_id = p_student_id and voided_at is null;

  return query select
    true,
    'Waiver applied.'::text,
    v_total_waiver,
    v_added;
end;
$function$
;


-- ══ Views ═══════════════════════════════════════════════════════════════

-- public.v_effective_late_fee_waivers
create or replace view public.v_effective_late_fee_waivers as
 SELECT installment_id,
    student_id,
    sum(amount)::integer AS waiver_amount
   FROM public.student_late_fee_waivers
  WHERE voided_at IS NULL
  GROUP BY installment_id, student_id;

-- public.v_installment_balances
create or replace view public.v_installment_balances as
 WITH payment_totals AS (
         SELECT payments.installment_id,
            COALESCE(sum(payments.amount), 0::bigint) AS payments_total
           FROM public.payments
          GROUP BY payments.installment_id
        ), adjustment_totals AS (
         SELECT payment_adjustments.installment_id,
            COALESCE(sum(payment_adjustments.amount_delta), 0::bigint) AS adjustments_total
           FROM public.payment_adjustments
          GROUP BY payment_adjustments.installment_id
        )
 SELECT installments.id AS installment_id,
    installments.student_id,
    students.admission_no,
    students.full_name,
    classes.session_label,
    classes.class_name,
    COALESCE(classes.section, ''::text) AS section,
    COALESCE(classes.stream_name, ''::text) AS stream_name,
    installments.installment_no,
    installments.installment_label,
    installments.due_date,
    installments.status AS installment_status,
    installments.amount_due,
    COALESCE(payment_totals.payments_total, 0::bigint) AS payments_total,
    COALESCE(adjustment_totals.adjustments_total, 0::bigint) AS adjustments_total,
        CASE
            WHEN installments.status = 'waived'::public.installment_status THEN 0::bigint
            ELSE GREATEST(installments.amount_due - (COALESCE(payment_totals.payments_total, 0::bigint) + COALESCE(adjustment_totals.adjustments_total, 0::bigint)), 0::bigint)
        END AS outstanding_amount,
        CASE
            WHEN installments.status = 'waived'::public.installment_status THEN 'waived'::text
            WHEN installments.status = 'cancelled'::public.installment_status THEN 'cancelled'::text
            WHEN GREATEST(installments.amount_due - (COALESCE(payment_totals.payments_total, 0::bigint) + COALESCE(adjustment_totals.adjustments_total, 0::bigint)), 0::bigint) = 0 THEN 'paid'::text
            WHEN (COALESCE(payment_totals.payments_total, 0::bigint) + COALESCE(adjustment_totals.adjustments_total, 0::bigint)) > 0 THEN 'partial'::text
            WHEN CURRENT_DATE > installments.due_date THEN 'overdue'::text
            ELSE 'pending'::text
        END AS balance_status,
    students.transport_route_id,
    routes.route_name AS transport_route_name,
    routes.route_code AS transport_route_code
   FROM public.installments
     JOIN public.students ON students.id = installments.student_id
     JOIN public.classes ON classes.id = installments.class_id
     LEFT JOIN public.transport_routes routes ON routes.id = students.transport_route_id
     LEFT JOIN payment_totals ON payment_totals.installment_id = installments.id
     LEFT JOIN adjustment_totals ON adjustment_totals.installment_id = installments.id
  WHERE installments.status <> 'cancelled'::public.installment_status;

-- public.v_receipt_effective_allocation_totals
create or replace view public.v_receipt_effective_allocation_totals as
 WITH payment_effective AS (
         SELECT payment_row.id AS payment_id,
            payment_row.receipt_id,
            payment_row.amount::bigint AS original_amount,
            COALESCE(sum(adjustment_row.amount_delta), 0::bigint) AS adjustment_amount
           FROM public.payments payment_row
             LEFT JOIN public.payment_adjustments adjustment_row ON adjustment_row.payment_id = payment_row.id AND adjustment_row.adjustment_type = 'correction'::public.adjustment_type
          GROUP BY payment_row.id, payment_row.receipt_id, payment_row.amount
        )
 SELECT receipt_row.id AS receipt_id,
    receipt_row.student_id,
    receipt_row.total_amount::bigint AS receipt_total,
    COALESCE(sum(payment_effective.original_amount), 0::numeric)::bigint AS original_allocation_total,
    COALESCE(sum(payment_effective.adjustment_amount), 0::numeric)::bigint AS adjustment_total,
    COALESCE(sum(payment_effective.original_amount + payment_effective.adjustment_amount), 0::numeric)::bigint AS effective_allocation_total,
    (COALESCE(sum(payment_effective.original_amount + payment_effective.adjustment_amount), 0::numeric) - receipt_row.total_amount::numeric)::bigint AS variance
   FROM public.receipts receipt_row
     LEFT JOIN payment_effective ON payment_effective.receipt_id = receipt_row.id
  GROUP BY receipt_row.id, receipt_row.student_id, receipt_row.total_amount;

-- public.v_receipt_reversal_totals
create or replace view public.v_receipt_reversal_totals as
 SELECT p.receipt_id,
    sum(- a.amount_delta)::integer AS reversed_amount
   FROM public.payment_adjustments a
     JOIN public.payments p ON p.id = a.payment_id
  WHERE a.adjustment_type = 'reversal'::public.adjustment_type AND a.amount_delta < 0
  GROUP BY p.receipt_id;

-- public.v_student_conventional_discounts
create or replace view public.v_student_conventional_discounts as
 SELECT a.student_id,
    a.academic_session_label AS session_label,
    array_agg(p.code ORDER BY p.sort_order, p.code) AS policy_codes,
    string_agg(p.display_name, ', '::text ORDER BY p.sort_order, p.display_name) AS policy_labels
   FROM public.student_conventional_discount_assignments a
     JOIN public.conventional_discount_policies p ON p.id = a.policy_id
  WHERE a.is_active
  GROUP BY a.student_id, a.academic_session_label;

-- public.v_student_manual_late_fee_waivers
create or replace view public.v_student_manual_late_fee_waivers as
 SELECT student_id,
    session_label,
    count(*)::integer AS manual_waiver_count,
    sum(amount)::integer AS manual_waiver_amount
   FROM public.student_late_fee_waivers w
  WHERE voided_at IS NULL AND (source = ANY (ARRAY['manual'::text, 'payment_desk'::text]))
  GROUP BY student_id, session_label;

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

-- public.v_outstanding_summary
create or replace view public.v_outstanding_summary as
 SELECT session_label,
    class_name,
    section,
    stream_name,
    count(DISTINCT student_id) FILTER (WHERE outstanding_amount > 0) AS students_with_dues,
    count(*) FILTER (WHERE outstanding_amount > 0) AS open_installments,
    COALESCE(sum(outstanding_amount), 0::numeric) AS outstanding_amount
   FROM public.v_installment_balances
  WHERE balance_status <> ALL (ARRAY['paid'::text, 'cancelled'::text])
  GROUP BY session_label, class_name, section, stream_name;

-- public.v_transport_route_outstanding
create or replace view public.v_transport_route_outstanding as
 SELECT COALESCE(transport_route_id::text, 'unassigned'::text) AS route_bucket,
    transport_route_id,
    COALESCE(transport_route_name, 'No route'::text) AS route_name,
    transport_route_code,
    count(DISTINCT student_id) AS students_with_dues,
    count(*) AS open_installments,
    count(*) FILTER (WHERE balance_status = 'overdue'::text) AS overdue_installments,
    COALESCE(sum(outstanding_amount), 0::numeric) AS outstanding_amount
   FROM public.v_installment_balances
  WHERE outstanding_amount > 0 AND (balance_status = ANY (ARRAY['partial'::text, 'overdue'::text, 'pending'::text]))
  GROUP BY (COALESCE(transport_route_id::text, 'unassigned'::text)), transport_route_id, (COALESCE(transport_route_name, 'No route'::text)), transport_route_code;

-- public.v_whatsapp_run_outcomes
create or replace view public.v_whatsapp_run_outcomes as
 SELECT run.id AS run_id,
    run.campaign_id,
    run.session_label,
    run.campaign_name,
    run.situation,
    run.language,
    run.started_at,
    run.last_date,
    run.late_fee_phrase,
    count(*) FILTER (WHERE s.status = 'sent'::text) AS messaged,
    count(*) FILTER (WHERE s.status = 'failed'::text) AS failed,
    COALESCE(sum(s.due_amount) FILTER (WHERE s.status = 'sent'::text), 0::bigint) AS money_quoted,
    count(*) FILTER (WHERE s.status = 'sent'::text AND COALESCE(paid.amount_paid, 0::bigint) > 0) AS families_paid,
    COALESCE(sum(paid.amount_paid) FILTER (WHERE s.status = 'sent'::text), 0::numeric) AS money_collected
   FROM public.whatsapp_campaign_runs run
     LEFT JOIN public.whatsapp_reminder_sends s ON s.run_id = run.id
     LEFT JOIN LATERAL ( SELECT sum(r.total_amount) AS amount_paid
           FROM public.receipts r
          WHERE r.student_id = s.student_id AND r.payment_date >= s.sent_on AND (run.last_date IS NULL OR r.payment_date <= run.last_date) AND r.payment_mode <> 'discount'::public.payment_mode AND NOT (EXISTS ( SELECT 1
                   FROM public.v_receipt_reversal_totals rr
                  WHERE rr.receipt_id = r.id AND rr.reversed_amount >= r.total_amount))) paid ON true
  GROUP BY run.id;

-- public.v_workbook_installment_balances
create materialized view if not exists public.v_workbook_installment_balances as
 WITH session_policy AS (
         SELECT DISTINCT ON (fee_policy_configs.academic_session_label) fee_policy_configs.academic_session_label
           FROM public.fee_policy_configs
          WHERE fee_policy_configs.calculation_model = 'workbook_v1'::text
          ORDER BY fee_policy_configs.academic_session_label, fee_policy_configs.updated_at DESC
        ), session_installments AS (
         SELECT i.id AS installment_id,
            i.student_id,
            s.admission_no,
            s.full_name AS student_name,
            s.father_name,
            s.primary_phone AS father_phone,
            c.session_label,
            i.class_id,
            c.class_name,
            private.normalize_workbook_class_label(c.class_name, c.stream_name) AS class_label,
            COALESCE(c.section, ''::text) AS section,
            COALESCE(c.stream_name, ''::text) AS stream_name,
            i.installment_no,
            i.installment_label,
            i.due_date,
            i.amount_due AS base_charge,
            i.status AS installment_status,
            i.late_fee_flat_amount,
            COALESCE(i.is_emi_late_fee, false) AS is_emi_late_fee,
            i.is_carry_forward,
            i.source_session_label,
            s.transport_route_id,
            route_row.route_name AS transport_route_name,
            route_row.route_code AS transport_route_code
           FROM public.installments i
             JOIN public.students s ON s.id = i.student_id
             JOIN public.classes c ON c.id = i.class_id
             JOIN session_policy policy_row ON policy_row.academic_session_label = c.session_label
             LEFT JOIN public.transport_routes route_row ON route_row.id = s.transport_route_id
          WHERE i.status <> 'cancelled'::public.installment_status
        ), rolled AS (
         SELECT session_installments.installment_id,
            session_installments.student_id,
            session_installments.admission_no,
            session_installments.student_name,
            session_installments.father_name,
            session_installments.father_phone,
            session_installments.session_label,
            session_installments.class_id,
            session_installments.class_name,
            session_installments.class_label,
            session_installments.section,
            session_installments.stream_name,
            session_installments.installment_no,
            session_installments.installment_label,
            session_installments.due_date,
            session_installments.base_charge,
            session_installments.installment_status,
            session_installments.late_fee_flat_amount,
            session_installments.is_emi_late_fee,
            session_installments.is_carry_forward,
            session_installments.source_session_label,
            session_installments.transport_route_id,
            session_installments.transport_route_name,
            session_installments.transport_route_code,
            COALESCE(payment_row.paid_amount, 0::bigint)::integer AS paid_amount,
            COALESCE(adjustment_row.adjustment_amount, 0::bigint)::integer AS adjustment_amount,
            GREATEST(COALESCE(payment_row.paid_amount, 0::bigint) + COALESCE(adjustment_row.cash_adjustment, 0::bigint), 0::bigint)::integer AS applied_amount,
            GREATEST(COALESCE(payment_row.discount_closeout_amount, 0::bigint) + COALESCE(adjustment_row.closeout_adjustment, 0::bigint), 0::bigint)::integer AS discount_closeout_amount,
            GREATEST(COALESCE(payment_row.paid_by_due_amount, 0::bigint) + COALESCE(payment_row.closeout_by_due_amount, 0::bigint) + COALESCE(adj_by_due_row.adjustment_by_due_amount, 0::bigint), 0::bigint)::integer AS settled_by_due_amount,
            payment_row.last_payment_date
           FROM session_installments
             LEFT JOIN LATERAL ( SELECT COALESCE(sum(payment_row_1.amount) FILTER (WHERE receipt_row.payment_mode <> 'discount'::public.payment_mode), 0::bigint) AS paid_amount,
                    COALESCE(sum(payment_row_1.amount) FILTER (WHERE receipt_row.payment_mode = 'discount'::public.payment_mode), 0::bigint) AS discount_closeout_amount,
                    COALESCE(sum(payment_row_1.amount) FILTER (WHERE receipt_row.payment_date <= session_installments.due_date AND receipt_row.payment_mode <> 'discount'::public.payment_mode), 0::bigint) AS paid_by_due_amount,
                    COALESCE(sum(payment_row_1.amount) FILTER (WHERE receipt_row.payment_date <= session_installments.due_date AND receipt_row.payment_mode = 'discount'::public.payment_mode), 0::bigint) AS closeout_by_due_amount,
                    max(receipt_row.payment_date) AS last_payment_date
                   FROM public.payments payment_row_1
                     JOIN public.receipts receipt_row ON receipt_row.id = payment_row_1.receipt_id
                  WHERE payment_row_1.installment_id = session_installments.installment_id) payment_row ON true
             LEFT JOIN LATERAL ( SELECT COALESCE(sum(adj.amount_delta), 0::bigint) AS adjustment_amount,
                    COALESCE(sum(adj.amount_delta) FILTER (WHERE adj_receipt.payment_mode <> 'discount'::public.payment_mode), 0::bigint) AS cash_adjustment,
                    COALESCE(sum(adj.amount_delta) FILTER (WHERE adj_receipt.payment_mode = 'discount'::public.payment_mode), 0::bigint) AS closeout_adjustment
                   FROM public.payment_adjustments adj
                     JOIN public.payments adj_payment ON adj_payment.id = adj.payment_id
                     JOIN public.receipts adj_receipt ON adj_receipt.id = adj_payment.receipt_id
                  WHERE adj.installment_id = session_installments.installment_id) adjustment_row ON true
             LEFT JOIN LATERAL ( SELECT COALESCE(sum(adj.amount_delta), 0::bigint) AS adjustment_by_due_amount
                   FROM public.payment_adjustments adj
                     JOIN public.payments adj_payment ON adj_payment.id = adj.payment_id
                     JOIN public.receipts adj_receipt ON adj_receipt.id = adj_payment.receipt_id
                  WHERE adj.installment_id = session_installments.installment_id AND adj_receipt.payment_date <= session_installments.due_date) adj_by_due_row ON true
        ), late_eval AS (
         SELECT rolled.installment_id,
            rolled.student_id,
            rolled.admission_no,
            rolled.student_name,
            rolled.father_name,
            rolled.father_phone,
            rolled.session_label,
            rolled.class_id,
            rolled.class_name,
            rolled.class_label,
            rolled.section,
            rolled.stream_name,
            rolled.installment_no,
            rolled.installment_label,
            rolled.due_date,
            rolled.base_charge,
            rolled.installment_status,
            rolled.late_fee_flat_amount,
            rolled.is_emi_late_fee,
            rolled.is_carry_forward,
            rolled.source_session_label,
            rolled.transport_route_id,
            rolled.transport_route_name,
            rolled.transport_route_code,
            rolled.paid_amount,
            rolled.adjustment_amount,
            rolled.applied_amount,
            rolled.discount_closeout_amount,
            rolled.settled_by_due_amount,
            rolled.last_payment_date,
                CASE
                    WHEN rolled.installment_status = 'waived'::public.installment_status THEN 0
                    WHEN COALESCE(rolled.late_fee_flat_amount, 0) <= 0 THEN 0
                    WHEN rolled.is_emi_late_fee THEN
                    CASE
                        WHEN CURRENT_DATE > rolled.due_date THEN rolled.late_fee_flat_amount
                        ELSE 0
                    END
                    WHEN rolled.base_charge <= 0 THEN 0
                    WHEN rolled.settled_by_due_amount >= rolled.base_charge THEN 0
                    WHEN CURRENT_DATE > rolled.due_date THEN rolled.late_fee_flat_amount
                    ELSE 0
                END AS raw_late_fee
           FROM rolled
        ), waiver_eval AS (
         SELECT late_eval.installment_id,
            late_eval.student_id,
            late_eval.admission_no,
            late_eval.student_name,
            late_eval.father_name,
            late_eval.father_phone,
            late_eval.session_label,
            late_eval.class_id,
            late_eval.class_name,
            late_eval.class_label,
            late_eval.section,
            late_eval.stream_name,
            late_eval.installment_no,
            late_eval.installment_label,
            late_eval.due_date,
            late_eval.base_charge,
            late_eval.installment_status,
            late_eval.late_fee_flat_amount,
            late_eval.is_emi_late_fee,
            late_eval.is_carry_forward,
            late_eval.source_session_label,
            late_eval.transport_route_id,
            late_eval.transport_route_name,
            late_eval.transport_route_code,
            late_eval.paid_amount,
            late_eval.adjustment_amount,
            late_eval.applied_amount,
            late_eval.discount_closeout_amount,
            late_eval.settled_by_due_amount,
            late_eval.last_payment_date,
            late_eval.raw_late_fee,
            LEAST(late_eval.raw_late_fee, COALESCE(waiver_row.waiver_amount, 0)) AS waiver_applied
           FROM late_eval
             LEFT JOIN public.v_effective_late_fee_waivers waiver_row ON waiver_row.installment_id = late_eval.installment_id
        ), split AS (
         SELECT waiver_eval.installment_id,
            waiver_eval.student_id,
            waiver_eval.admission_no,
            waiver_eval.student_name,
            waiver_eval.father_name,
            waiver_eval.father_phone,
            waiver_eval.session_label,
            waiver_eval.class_id,
            waiver_eval.class_name,
            waiver_eval.class_label,
            waiver_eval.section,
            waiver_eval.stream_name,
            waiver_eval.installment_no,
            waiver_eval.installment_label,
            waiver_eval.due_date,
            waiver_eval.base_charge,
            waiver_eval.installment_status,
            waiver_eval.late_fee_flat_amount,
            waiver_eval.is_emi_late_fee,
            waiver_eval.is_carry_forward,
            waiver_eval.source_session_label,
            waiver_eval.transport_route_id,
            waiver_eval.transport_route_name,
            waiver_eval.transport_route_code,
            waiver_eval.paid_amount,
            waiver_eval.adjustment_amount,
            waiver_eval.applied_amount,
            waiver_eval.discount_closeout_amount,
            waiver_eval.settled_by_due_amount,
            waiver_eval.last_payment_date,
            waiver_eval.raw_late_fee,
            waiver_eval.waiver_applied,
            GREATEST(waiver_eval.raw_late_fee - waiver_eval.waiver_applied, 0) AS final_late_fee,
            GREATEST(waiver_eval.applied_amount + waiver_eval.discount_closeout_amount, 0) AS settled_amount
           FROM waiver_eval
        ), spill AS (
         SELECT split.installment_id,
            split.student_id,
            split.admission_no,
            split.student_name,
            split.father_name,
            split.father_phone,
            split.session_label,
            split.class_id,
            split.class_name,
            split.class_label,
            split.section,
            split.stream_name,
            split.installment_no,
            split.installment_label,
            split.due_date,
            split.base_charge,
            split.installment_status,
            split.late_fee_flat_amount,
            split.is_emi_late_fee,
            split.is_carry_forward,
            split.source_session_label,
            split.transport_route_id,
            split.transport_route_name,
            split.transport_route_code,
            split.paid_amount,
            split.adjustment_amount,
            split.applied_amount,
            split.discount_closeout_amount,
            split.settled_by_due_amount,
            split.last_payment_date,
            split.raw_late_fee,
            split.waiver_applied,
            split.final_late_fee,
            split.settled_amount,
            GREATEST(split.settled_amount - (split.base_charge + split.final_late_fee), 0) AS row_surplus,
            GREATEST(split.base_charge + split.final_late_fee - split.settled_amount, 0) AS row_room
           FROM split
        ), carry AS (
         SELECT spill.installment_id,
            spill.student_id,
            spill.admission_no,
            spill.student_name,
            spill.father_name,
            spill.father_phone,
            spill.session_label,
            spill.class_id,
            spill.class_name,
            spill.class_label,
            spill.section,
            spill.stream_name,
            spill.installment_no,
            spill.installment_label,
            spill.due_date,
            spill.base_charge,
            spill.installment_status,
            spill.late_fee_flat_amount,
            spill.is_emi_late_fee,
            spill.is_carry_forward,
            spill.source_session_label,
            spill.transport_route_id,
            spill.transport_route_name,
            spill.transport_route_code,
            spill.paid_amount,
            spill.adjustment_amount,
            spill.applied_amount,
            spill.discount_closeout_amount,
            spill.settled_by_due_amount,
            spill.last_payment_date,
            spill.raw_late_fee,
            spill.waiver_applied,
            spill.final_late_fee,
            spill.settled_amount,
            spill.row_surplus,
            spill.row_room,
            LEAST(COALESCE(sum(spill.row_surplus) OVER w_before, 0::bigint), COALESCE(sum(spill.row_room) OVER w_through, 0::bigint))::integer AS cum_filled,
            LEAST(COALESCE(sum(spill.row_surplus) OVER w_before_prev, 0::bigint), COALESCE(sum(spill.row_room) OVER w_before, 0::bigint))::integer AS cum_filled_prev
           FROM spill
          WINDOW w_before AS (PARTITION BY spill.student_id ORDER BY spill.due_date, spill.installment_no ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), w_through AS (PARTITION BY spill.student_id ORDER BY spill.due_date, spill.installment_no ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW), w_before_prev AS (PARTITION BY spill.student_id ORDER BY spill.due_date, spill.installment_no ROWS BETWEEN UNBOUNDED PRECEDING AND 2 PRECEDING)
        ), settled AS (
         SELECT carry.installment_id,
            carry.student_id,
            carry.admission_no,
            carry.student_name,
            carry.father_name,
            carry.father_phone,
            carry.session_label,
            carry.class_id,
            carry.class_name,
            carry.class_label,
            carry.section,
            carry.stream_name,
            carry.installment_no,
            carry.installment_label,
            carry.due_date,
            carry.base_charge,
            carry.installment_status,
            carry.late_fee_flat_amount,
            carry.is_emi_late_fee,
            carry.is_carry_forward,
            carry.source_session_label,
            carry.transport_route_id,
            carry.transport_route_name,
            carry.transport_route_code,
            carry.paid_amount,
            carry.adjustment_amount,
            carry.applied_amount,
            carry.discount_closeout_amount,
            carry.settled_by_due_amount,
            carry.last_payment_date,
            carry.raw_late_fee,
            carry.waiver_applied,
            carry.final_late_fee,
            carry.settled_amount,
            carry.row_surplus,
            carry.row_room,
            carry.cum_filled,
            carry.cum_filled_prev,
            carry.settled_amount + GREATEST(carry.cum_filled - carry.cum_filled_prev, 0) AS effective_settled
           FROM carry
        )
 SELECT installment_id,
    student_id,
    admission_no,
    student_name,
    father_name,
    father_phone,
    session_label,
    class_id,
    class_name,
    class_label,
    section,
    stream_name,
    installment_no,
    installment_label,
    due_date,
    base_charge,
    paid_amount,
    discount_closeout_amount,
    adjustment_amount,
    applied_amount,
    raw_late_fee,
    waiver_applied,
    final_late_fee,
    GREATEST(base_charge + raw_late_fee - waiver_applied, 0) AS total_charge,
    GREATEST(base_charge - effective_settled, 0) AS pending_amount,
    GREATEST(final_late_fee - GREATEST(effective_settled - base_charge, 0), 0) AS late_fee_pending,
    GREATEST(base_charge - effective_settled, 0) + GREATEST(final_late_fee - GREATEST(effective_settled - base_charge, 0), 0) AS total_pending,
        CASE
            WHEN installment_status = 'waived'::public.installment_status THEN 'waived'::text
            WHEN GREATEST(base_charge - effective_settled, 0) <= 0 THEN 'paid'::text
            WHEN CURRENT_DATE > due_date THEN 'overdue'::text
            WHEN effective_settled > 0 THEN 'partial'::text
            ELSE 'pending'::text
        END AS balance_status,
        CASE
            WHEN raw_late_fee <= 0 THEN 'none'::text
            WHEN GREATEST(final_late_fee - GREATEST(effective_settled - base_charge, 0), 0) > 0 THEN 'pending'::text
            WHEN waiver_applied >= raw_late_fee THEN 'waived'::text
            ELSE 'paid'::text
        END AS late_fee_status,
    last_payment_date,
    transport_route_id,
    transport_route_name,
    transport_route_code,
    is_carry_forward,
    source_session_label,
    is_emi_late_fee
   FROM settled;

-- public.v_student_carry_forward_balances
create or replace view public.v_student_carry_forward_balances as
 SELECT cfb.id,
    cfb.student_id,
    s.admission_no,
    s.full_name AS student_name,
    s.father_name,
    s.primary_phone AS father_phone,
    i.class_id,
    private.normalize_workbook_class_label(c.class_name, c.stream_name) AS class_label,
    cfb.source_session_label,
    cfb.target_session_label,
    cfb.fee_head,
    cfb.original_amount,
    cfb.backing_installment_id,
    i.installment_no,
    i.installment_label,
    i.due_date,
    COALESCE(wib.applied_amount, 0) AS collected_amount,
    COALESCE(wib.pending_amount, cfb.original_amount) AS remaining_amount,
    COALESCE(wib.balance_status, 'pending'::text) AS balance_status,
    cfb.status,
    cfb.import_batch_id,
    cfb.import_row_id,
    cfb.created_at,
    cfb.updated_at
   FROM public.student_carry_forward_balances cfb
     JOIN public.students s ON s.id = cfb.student_id
     JOIN public.installments i ON i.id = cfb.backing_installment_id
     JOIN public.classes c ON c.id = i.class_id
     LEFT JOIN public.v_workbook_installment_balances wib ON wib.installment_id = i.id;

-- public.v_student_installment_facets
create or replace view public.v_student_installment_facets as
 SELECT student_id,
    session_label,
    count(*)::integer AS installment_count,
    count(*) FILTER (WHERE waiver_applied > 0)::integer AS late_fee_waived_count,
    COALESCE(sum(pending_amount) FILTER (WHERE is_carry_forward), 0::bigint)::integer AS carry_forward_pending_amount,
    COALESCE(sum(base_charge) FILTER (WHERE is_carry_forward), 0::bigint)::integer AS carry_forward_original_amount,
    COALESCE(sum(GREATEST(base_charge - GREATEST(paid_amount, 0) - GREATEST(adjustment_amount, 0), 0)) FILTER (WHERE balance_status = 'overdue'::text), 0::bigint)::integer AS overdue_base_amount,
    COALESCE(sum(GREATEST(late_fee_pending, 0)), 0::bigint)::integer AS pending_late_fee_amount
   FROM public.v_workbook_installment_balances b
  GROUP BY student_id, session_label;

-- public.v_student_repayment_plan_status
create or replace view public.v_student_repayment_plan_status as
 WITH as_of_day AS (
         SELECT (now() AT TIME ZONE 'Asia/Kolkata'::text)::date AS as_of
        ), item_state AS (
         SELECT i.plan_id,
            count(*)::integer AS item_count,
            COALESCE(sum(GREATEST(COALESCE(b.pending_amount, 0), 0)), 0::bigint)::integer AS remaining_balance,
            count(*) FILTER (WHERE COALESCE(b.base_charge, i.snapshot_base_charge) IS DISTINCT FROM i.snapshot_base_charge)::integer AS changed_item_count
           FROM public.student_repayment_plan_items i
             LEFT JOIN public.v_workbook_installment_balances b ON b.installment_id = i.installment_id
          GROUP BY i.plan_id
        ), plan_base AS (
         SELECT p.id,
            p.student_id,
            p.session_label,
            p.scope,
            p.opening_balance,
            p.monthly_amount,
            p.first_due_date,
            p.term_months,
            p.final_installment_amount,
            p.waived_late_fee_total,
            p.reason,
            p.client_request_id,
            p.lifecycle,
            p.supersedes_plan_id,
            p.superseded_by_plan_id,
            p.activated_by,
            p.activated_by_label,
            p.activated_at,
            p.cancelled_by,
            p.cancelled_at,
            p.cancellation_reason,
            p.created_by,
            p.updated_by,
            p.created_at,
            p.updated_at,
            COALESCE(s.item_count, 0) AS item_count,
            COALESCE(s.remaining_balance, 0) AS remaining_balance,
            GREATEST(p.opening_balance - COALESCE(s.remaining_balance, 0), 0) AS paid_to_date,
            COALESCE(s.changed_item_count, 0) AS changed_item_count
           FROM public.student_repayment_plans p
             LEFT JOIN item_state s ON s.plan_id = p.id
        ), schedule_roll AS (
         SELECT sch.plan_id,
            sch.sequence_no,
            sch.due_date,
            sch.amount,
            sum(sch.amount) OVER (PARTITION BY sch.plan_id ORDER BY sch.sequence_no ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)::integer AS cumulative_amount
           FROM public.student_repayment_schedule sch
        ), schedule_state AS (
         SELECT pb_1.id AS plan_id,
            COALESCE(sum(sr.amount) FILTER (WHERE sr.due_date <= d_1.as_of), 0::bigint)::integer AS expected_to_date,
            COALESCE(sum(sr.amount) FILTER (WHERE sr.due_date < d_1.as_of), 0::bigint)::integer AS expected_overdue,
            count(*) FILTER (WHERE sr.due_date < d_1.as_of AND sr.cumulative_amount > pb_1.paid_to_date)::integer AS missed_installment_count,
            count(*) FILTER (WHERE sr.cumulative_amount <= pb_1.paid_to_date)::integer AS paid_installment_count,
            max(sr.due_date) AS end_date
           FROM plan_base pb_1
             JOIN schedule_roll sr ON sr.plan_id = pb_1.id
             CROSS JOIN as_of_day d_1
          GROUP BY pb_1.id, pb_1.paid_to_date
        ), next_row AS (
         SELECT pb_1.id AS plan_id,
            nxt.sequence_no,
            nxt.due_date,
            nxt.amount,
            nxt.cumulative_amount
           FROM plan_base pb_1
             JOIN LATERAL ( SELECT sr.plan_id,
                    sr.sequence_no,
                    sr.due_date,
                    sr.amount,
                    sr.cumulative_amount
                   FROM schedule_roll sr
                  WHERE sr.plan_id = pb_1.id AND sr.cumulative_amount > pb_1.paid_to_date
                  ORDER BY sr.sequence_no
                 LIMIT 1) nxt ON true
        )
 SELECT pb.id AS plan_id,
    pb.student_id,
    pb.session_label,
    pb.scope,
    pb.lifecycle,
    pb.opening_balance,
    pb.monthly_amount,
    pb.first_due_date,
    pb.term_months,
    pb.final_installment_amount,
    pb.waived_late_fee_total,
    pb.reason,
    pb.supersedes_plan_id,
    pb.superseded_by_plan_id,
    pb.activated_at,
    pb.activated_by,
    pb.activated_by_label,
    pb.cancelled_at,
    pb.cancellation_reason,
    pb.item_count,
    pb.remaining_balance,
    pb.paid_to_date,
    COALESCE(ss.expected_to_date, 0) AS expected_to_date,
    COALESCE(ss.expected_overdue, 0) AS expected_overdue,
    GREATEST(COALESCE(ss.expected_to_date, 0) - pb.paid_to_date, 0) AS catch_up_amount,
    COALESCE(ss.missed_installment_count, 0) AS missed_installment_count,
    COALESCE(ss.paid_installment_count, 0) AS paid_installment_count,
    nr.sequence_no AS next_due_sequence_no,
    nr.due_date AS next_due_date,
        CASE
            WHEN nr.plan_id IS NULL THEN NULL::integer
            ELSE LEAST(nr.amount, nr.cumulative_amount - pb.paid_to_date)
        END AS next_due_amount,
    ss.end_date,
        CASE
            WHEN pb.remaining_balance <= 0 THEN 'completed'::text
            WHEN d.as_of < pb.first_due_date THEN 'upcoming'::text
            WHEN COALESCE(ss.missed_installment_count, 0) > 0 THEN 'behind'::text
            WHEN pb.paid_to_date < COALESCE(ss.expected_to_date, 0) THEN 'due'::text
            ELSE 'on_track'::text
        END AS payment_status,
    pb.changed_item_count > 0 OR (EXISTS ( SELECT 1
           FROM public.v_workbook_installment_balances nb
          WHERE nb.student_id = pb.student_id AND nb.session_label = pb.session_label AND nb.pending_amount > 0 AND (pb.scope = 'old_and_current'::text OR nb.is_carry_forward) AND NOT (EXISTS ( SELECT 1
                   FROM public.student_repayment_plan_items ni
                  WHERE ni.plan_id = pb.id AND ni.installment_id = nb.installment_id)))) AS plan_review_needed
   FROM plan_base pb
     CROSS JOIN as_of_day d
     LEFT JOIN schedule_state ss ON ss.plan_id = pb.id
     LEFT JOIN next_row nr ON nr.plan_id = pb.id;

-- public.v_workbook_student_financials
create materialized view if not exists public.v_workbook_student_financials as
 WITH session_policy AS (
         SELECT fee_policy_configs.academic_session_label,
            fee_policy_configs.installment_schedule,
            fee_policy_configs.new_student_academic_fee_amount,
            fee_policy_configs.old_student_academic_fee_amount
           FROM public.fee_policy_configs
          WHERE fee_policy_configs.calculation_model = 'workbook_v1'::text
          ORDER BY fee_policy_configs.academic_session_label, fee_policy_configs.updated_at DESC
        ), school_default AS (
         SELECT school_fee_defaults.tuition_fee_amount,
            school_fee_defaults.transport_fee_amount,
            school_fee_defaults.student_type_default
           FROM public.school_fee_defaults
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
                CASE
                    WHEN override_row.custom_tuition_fee_amount IS NOT NULL THEN 0
                    ELSE GREATEST(COALESCE(fee_row.tuition_fee_amount, school_default.tuition_fee_amount, 0) - COALESCE(conv.resulting_tuition, COALESCE(fee_row.tuition_fee_amount, school_default.tuition_fee_amount, 0)), 0)
                END AS conventional_discount_amount,
                CASE
                    WHEN override_row.custom_tuition_fee_amount IS NOT NULL THEN NULL::text
                    ELSE conv.policy_labels
                END AS conventional_discount_labels,
            COALESCE(override_row.late_fee_waiver_amount, 0) AS late_fee_waiver_amount,
            override_row.reason AS override_reason,
            count(*) OVER (PARTITION BY (NULLIF(TRIM(BOTH FROM s.admission_no), ''::text))) AS admission_no_count
           FROM public.students s
             JOIN public.classes c ON c.id = s.class_id
             JOIN session_policy ON session_policy.academic_session_label = c.session_label
             LEFT JOIN school_default ON true
             LEFT JOIN public.fee_settings fee_row ON fee_row.class_id = c.id AND fee_row.is_active = true
             LEFT JOIN public.student_fee_overrides override_row ON override_row.student_id = s.id AND override_row.is_active = true
             LEFT JOIN public.transport_routes route_row ON route_row.id = s.transport_route_id
             LEFT JOIN LATERAL ( SELECT LEAST(COALESCE(fee_row.tuition_fee_amount, school_default.tuition_fee_amount, 0), min(
                        CASE policy_row.calculation_type
                            WHEN 'tuition_zero'::text THEN 0
                            WHEN 'tuition_percentage'::text THEN round(COALESCE(fee_row.tuition_fee_amount, school_default.tuition_fee_amount, 0)::numeric * LEAST(GREATEST(COALESCE(policy_row.percentage, 0::numeric), 0::numeric), 100::numeric) / 100::numeric)::integer
                            ELSE GREATEST(COALESCE(policy_row.fixed_tuition_amount, 0), 0)
                        END)) AS resulting_tuition,
                    string_agg(policy_row.display_name, ', '::text ORDER BY policy_row.sort_order, policy_row.display_name) AS policy_labels
                   FROM public.student_conventional_discount_assignments assignment
                     JOIN public.conventional_discount_policies policy_row ON policy_row.id = assignment.policy_id AND policy_row.is_active = true
                  WHERE assignment.student_id = s.id AND assignment.is_active = true AND assignment.academic_session_label = c.session_label) conv ON true
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
            student_base.conventional_discount_amount,
            student_base.conventional_discount_labels,
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
            student_profile.conventional_discount_labels,
            student_profile.late_fee_waiver_amount,
            student_profile.override_reason,
            student_profile.admission_no_count,
            student_profile.academic_fee,
            GREATEST(0::bigint, student_profile.tuition_fee + student_profile.transport_fee + student_profile.academic_fee + student_profile.other_adjustment_amount) AS gross_base_before_discount,
            LEAST(COALESCE(student_profile.conventional_discount_amount, 0)::bigint, GREATEST(0::bigint, student_profile.tuition_fee + student_profile.transport_fee + student_profile.academic_fee + student_profile.other_adjustment_amount)) AS conventional_discount_amount,
            LEAST(GREATEST(COALESCE(student_profile.raw_discount_amount, 0) - COALESCE(student_profile.conventional_discount_amount, 0), 0)::bigint, GREATEST(0::bigint, GREATEST(0::bigint, student_profile.tuition_fee + student_profile.transport_fee + student_profile.academic_fee + student_profile.other_adjustment_amount) - COALESCE(student_profile.conventional_discount_amount, 0)::bigint)) AS student_discount_amount,
            LEAST((COALESCE(student_profile.conventional_discount_amount, 0) + GREATEST(COALESCE(student_profile.raw_discount_amount, 0) - COALESCE(student_profile.conventional_discount_amount, 0), 0))::bigint, GREATEST(0::bigint, student_profile.tuition_fee + student_profile.transport_fee + student_profile.academic_fee + student_profile.other_adjustment_amount)) AS discount_amount
           FROM student_profile
        ), installment_summary AS (
         SELECT v_workbook_installment_balances.student_id,
            COALESCE(sum(v_workbook_installment_balances.base_charge), 0::bigint)::integer AS base_charge_total,
            COALESCE(sum(v_workbook_installment_balances.final_late_fee), 0::bigint)::integer AS late_fee_total,
            COALESCE(sum(v_workbook_installment_balances.late_fee_pending), 0::bigint)::integer AS late_fee_pending_total,
            COALESCE(sum(v_workbook_installment_balances.waiver_applied), 0::bigint)::integer AS late_fee_waiver_total,
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
           FROM public.v_workbook_installment_balances
          GROUP BY v_workbook_installment_balances.student_id
        ), next_due AS (
         SELECT DISTINCT ON (v_workbook_installment_balances.student_id) v_workbook_installment_balances.student_id,
            v_workbook_installment_balances.due_date AS next_due_date,
            GREATEST(v_workbook_installment_balances.base_charge - v_workbook_installment_balances.applied_amount - v_workbook_installment_balances.discount_closeout_amount, 0) AS next_due_amount,
            v_workbook_installment_balances.installment_label AS next_due_label
           FROM public.v_workbook_installment_balances
          WHERE GREATEST(v_workbook_installment_balances.base_charge - v_workbook_installment_balances.applied_amount - v_workbook_installment_balances.discount_closeout_amount, 0) > 0
          ORDER BY v_workbook_installment_balances.student_id, v_workbook_installment_balances.due_date, v_workbook_installment_balances.installment_no
        ), last_payment AS (
         SELECT DISTINCT ON (receipts.student_id) receipts.student_id,
            receipts.payment_date AS last_payment_date,
            receipts.total_amount AS last_payment_amount
           FROM public.receipts
          ORDER BY receipts.student_id, receipts.payment_date DESC, receipts.created_at DESC
        ), students_with_ledger AS (
         SELECT DISTINCT installments.student_id
           FROM public.installments
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
    profile.conventional_discount_amount,
    profile.student_discount_amount,
    profile.conventional_discount_labels,
    COALESCE(summary.late_fee_waiver_total, 0) AS late_fee_waiver_amount,
    COALESCE(summary.base_charge_total::bigint,
        CASE
            WHEN ledger.student_id IS NOT NULL THEN 0::bigint
            ELSE GREATEST(profile.gross_base_before_discount - profile.discount_amount, 0::bigint)
        END) AS base_charge_total,
    COALESCE(summary.base_charge_total::bigint,
        CASE
            WHEN ledger.student_id IS NOT NULL THEN 0::bigint
            ELSE GREATEST(profile.gross_base_before_discount - profile.discount_amount, 0::bigint)
        END) AS base_total_due,
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
    COALESCE(summary.total_due::bigint,
        CASE
            WHEN ledger.student_id IS NOT NULL THEN 0::bigint
            ELSE GREATEST(profile.gross_base_before_discount - profile.discount_amount, 0::bigint)
        END) AS total_due,
    COALESCE(summary.total_paid, 0) AS total_paid,
    COALESCE(summary.total_discount_closeouts, 0) AS total_discount_closeouts,
    COALESCE(summary.outstanding_amount::bigint,
        CASE
            WHEN ledger.student_id IS NOT NULL THEN 0::bigint
            ELSE GREATEST(profile.gross_base_before_discount - profile.discount_amount, 0::bigint)
        END) AS outstanding_amount,
    COALESCE(summary.base_outstanding_amount::bigint,
        CASE
            WHEN ledger.student_id IS NOT NULL THEN 0::bigint
            ELSE GREATEST(profile.gross_base_before_discount - profile.discount_amount, 0::bigint)
        END) AS base_outstanding_amount,
    COALESCE(summary.late_fee_pending_total, 0) AS late_fee_outstanding_amount,
    next_due.next_due_date,
    next_due.next_due_amount,
    next_due.next_due_label,
    COALESCE(last_payment.last_payment_date, summary.last_payment_date) AS last_payment_date,
    COALESCE(last_payment.last_payment_amount, 0) AS last_payment_amount,
    COALESCE(summary.paid_installment_count, 0::bigint) AS paid_installment_count,
    COALESCE(summary.partly_paid_installment_count, 0::bigint) AS partly_paid_installment_count,
    COALESCE(summary.overdue_installment_count, 0::bigint) AS overdue_installment_count,
        CASE
            WHEN COALESCE(summary.total_due::bigint,
            CASE
                WHEN ledger.student_id IS NOT NULL THEN 0::bigint
                ELSE GREATEST(profile.gross_base_before_discount - profile.discount_amount, 0::bigint)
            END) <= 0 THEN ''::text
            WHEN COALESCE(summary.base_outstanding_amount::bigint,
            CASE
                WHEN ledger.student_id IS NOT NULL THEN 0::bigint
                ELSE GREATEST(profile.gross_base_before_discount - profile.discount_amount, 0::bigint)
            END) <= 0 THEN 'PAID'::text
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
     LEFT JOIN last_payment ON last_payment.student_id = profile.student_id
     LEFT JOIN students_with_ledger ledger ON ledger.student_id = profile.student_id;

-- public.v_ledger_policy_drift
create or replace view public.v_ledger_policy_drift as
 WITH ledger AS (
         SELECT i.student_id,
            c.session_label,
            sum(
                CASE
                    WHEN i.is_carry_forward THEN 0
                    ELSE i.amount_due
                END) AS ledger_net,
            count(*) FILTER (WHERE i.class_id <> s.class_id AND NOT i.is_carry_forward AND NOT COALESCE(i.is_emi_late_fee, false))::integer AS stale_class_rows,
            count(*) FILTER (WHERE i.class_id <> s.class_id AND (i.is_carry_forward OR COALESCE(i.is_emi_late_fee, false)))::integer AS stale_class_locked_rows
           FROM public.installments i
             JOIN public.students s ON s.id = i.student_id
             JOIN public.classes c ON c.id = i.class_id
          WHERE i.status <> 'cancelled'::public.installment_status
          GROUP BY i.student_id, c.session_label
        )
 SELECT f.student_id,
    f.admission_no,
    f.student_name,
    f.class_label,
    f.session_label,
    f.gross_base_before_discount - f.discount_amount AS policy_net,
    COALESCE(l.ledger_net, 0::bigint) AS ledger_net,
    f.gross_base_before_discount - f.discount_amount - COALESCE(l.ledger_net, 0::bigint) AS drift,
    l.student_id IS NOT NULL AS has_ledger,
    COALESCE(l.stale_class_rows, 0) AS stale_class_rows,
    COALESCE(l.stale_class_locked_rows, 0) AS stale_class_locked_rows
   FROM public.v_workbook_student_financials f
     LEFT JOIN ledger l ON l.student_id = f.student_id AND l.session_label = f.session_label
  WHERE f.record_status = 'active'::public.student_status;

-- public.v_notion_student_fee_summary
create or replace view public.v_notion_student_fee_summary as
 WITH explicit_family AS (
         SELECT DISTINCT ON (member.student_id, member.academic_session_label) member.student_id,
            member.academic_session_label AS session_label,
            group_record.id AS family_group_id,
            group_record.family_label,
            group_record.guardian_phone
           FROM public.student_family_members member
             JOIN public.student_family_groups group_record ON group_record.id = member.family_group_id
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
           FROM public.v_workbook_student_financials financials
             LEFT JOIN explicit_family ON explicit_family.student_id = financials.student_id AND explicit_family.session_label = financials.session_label
        ), last_receipt AS (
         SELECT DISTINCT ON (receipt_row.student_id) receipt_row.student_id,
            receipt_row.payment_date AS last_payment_date,
            receipt_row.total_amount AS last_payment_amount,
            receipt_row.payment_mode::text AS last_payment_mode,
            receipt_row.receipt_number AS last_receipt_no
           FROM public.receipts receipt_row
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
           FROM public.v_workbook_installment_balances balances
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
  WHERE student_keys.record_status = 'active'::public.student_status;

-- public.v_student_directory
create or replace view public.v_student_directory as
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
    s.status = 'active'::public.student_status AS seg_active,
    s.status = 'left'::public.student_status AS seg_left,
    s.status = 'graduated'::public.student_status AS seg_graduated,
    s.status <> 'active'::public.student_status AND COALESCE(f.outstanding_amount, 0::bigint) > 0 AS seg_left_owing,
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
    rp.plan_id IS NOT NULL AS seg_on_emi,
    COALESCE(rp.payment_status, ''::text) = 'due'::text AS seg_emi_due,
    COALESCE(rp.payment_status, ''::text) = 'behind'::text AS seg_emi_missed,
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
   FROM public.students s
     JOIN public.classes c ON c.id = s.class_id
     LEFT JOIN public.transport_routes r ON r.id = s.transport_route_id
     LEFT JOIN public.v_workbook_student_financials f ON f.student_id = s.id
     LEFT JOIN public.v_student_installment_facets i ON i.student_id = s.id
     LEFT JOIN public.v_student_conventional_discounts d ON d.student_id = s.id AND d.session_label = c.session_label
     LEFT JOIN public.v_student_manual_late_fee_waivers m ON m.student_id = s.id AND m.session_label = c.session_label
     LEFT JOIN public.student_fee_overrides o ON o.student_id = s.id AND o.is_active
     LEFT JOIN public.v_student_repayment_plan_status rp ON rp.student_id = s.id AND rp.lifecycle = 'active'::text;

-- public.v_student_financial_state
create materialized view if not exists public.v_student_financial_state as
 WITH blocked_rows AS (
         SELECT config_change_blocked_installments.student_id,
            count(*)::integer AS rows_kept_for_review
           FROM public.config_change_blocked_installments
          GROUP BY config_change_blocked_installments.student_id
        ), financials AS (
         SELECT v_workbook_student_financials.student_id,
            COALESCE(v_workbook_student_financials.total_due, GREATEST(v_workbook_student_financials.gross_base_before_discount - v_workbook_student_financials.discount_amount, 0::bigint) + COALESCE(v_workbook_student_financials.late_fee_total, 0))::integer AS revised_total_due,
            COALESCE(v_workbook_student_financials.total_paid, 0) AS total_paid,
            COALESCE(v_workbook_student_financials.outstanding_amount, 0::bigint)::integer AS installment_pending_amount,
            COALESCE(v_workbook_student_financials.late_fee_outstanding_amount, 0) AS late_fee_pending
           FROM public.v_workbook_student_financials
        )
 SELECT financials.student_id,
    financials.revised_total_due AS total_due,
    financials.total_paid,
    GREATEST(financials.revised_total_due - financials.total_paid, 0) AS pending_amount,
    GREATEST(financials.total_paid - financials.revised_total_due, 0) AS credit_balance,
    GREATEST(financials.total_paid - financials.revised_total_due, 0) AS overpaid_amount,
    GREATEST(financials.total_paid - financials.revised_total_due, 0) AS refundable_amount,
    COALESCE(blocked_rows.rows_kept_for_review, 0) AS rows_kept_for_review,
    financials.installment_pending_amount,
    financials.late_fee_pending
   FROM financials
     LEFT JOIN blocked_rows ON blocked_rows.student_id = financials.student_id;

-- public.v_notion_daily_collection_summary
create or replace view public.v_notion_daily_collection_summary as
 WITH sessions AS (
         SELECT DISTINCT classes.session_label AS session
           FROM public.classes
        ), summary_dates AS (
         SELECT sessions.session,
            CURRENT_DATE AS summary_date
           FROM sessions
        UNION
         SELECT class_row.session_label AS session,
            receipt_row.payment_date AS summary_date
           FROM public.receipts receipt_row
             JOIN public.students student_row ON student_row.id = receipt_row.student_id
             JOIN public.classes class_row ON class_row.id = student_row.class_id
        ), receipt_facts AS (
         SELECT class_row.session_label AS session,
            receipt_row.payment_date,
            receipt_row.id AS receipt_id,
                CASE
                    WHEN receipt_row.payment_mode::text = 'discount'::text THEN 0
                    ELSE receipt_row.total_amount
                END AS collected_amount
           FROM public.receipts receipt_row
             JOIN public.students student_row ON student_row.id = receipt_row.student_id
             JOIN public.classes class_row ON class_row.id = student_row.class_id
        ), class_dues AS (
         SELECT student_summary.session,
            student_summary.class,
            COALESCE(sum(student_summary.total_pending), 0::bigint)::integer AS pending_amount
           FROM public.v_notion_student_fee_summary student_summary
          GROUP BY student_summary.session, student_summary.class
        ), class_dues_json AS (
         SELECT class_dues.session,
            jsonb_object_agg(class_dues.class, class_dues.pending_amount ORDER BY class_dues.class) AS dues_by_class
           FROM class_dues
          GROUP BY class_dues.session
        ), defaulters AS (
         SELECT balances.session_label AS session,
            count(DISTINCT balances.student_id)::integer AS defaulter_count
           FROM public.v_workbook_installment_balances balances
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

-- public.v_notion_family_fee_summary
create or replace view public.v_notion_family_fee_summary as
 SELECT session,
    family_key,
    count(*)::integer AS sibling_count,
    COALESCE(sum(total_annual_fees_due), 0::bigint)::integer AS family_total_due,
    COALESCE(sum(total_paid_to_date), 0::bigint)::integer AS family_total_paid,
    COALESCE(sum(total_pending), 0::bigint)::integer AS family_total_pending,
    string_agg(student_name, ', '::text ORDER BY class, student_name) AS student_names
   FROM public.v_notion_student_fee_summary student_summary
  GROUP BY session, family_key;


-- ══ Triggers ════════════════════════════════════════════════════════════

CREATE TRIGGER audit_academic_sessions AFTER INSERT OR DELETE OR UPDATE ON public.academic_sessions FOR EACH ROW EXECUTE FUNCTION private.capture_audit_event();
CREATE TRIGGER ensure_single_current_academic_session BEFORE INSERT OR UPDATE ON public.academic_sessions FOR EACH ROW EXECUTE FUNCTION private.ensure_single_current_academic_session();
CREATE TRIGGER set_actor_columns_on_academic_sessions BEFORE INSERT OR UPDATE ON public.academic_sessions FOR EACH ROW EXECUTE FUNCTION private.set_actor_columns();
CREATE TRIGGER set_updated_at_on_academic_sessions BEFORE UPDATE ON public.academic_sessions FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER audit_logs_are_append_only BEFORE DELETE OR UPDATE ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION private.prevent_append_only_mutation();
CREATE TRIGGER audit_classes AFTER INSERT OR DELETE OR UPDATE ON public.classes FOR EACH ROW EXECUTE FUNCTION private.capture_audit_event();
CREATE TRIGGER refresh_financials_on_class AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.classes FOR EACH STATEMENT EXECUTE FUNCTION public.trigger_refresh_financial_views();
CREATE TRIGGER set_actor_columns_on_classes BEFORE INSERT OR UPDATE ON public.classes FOR EACH ROW EXECUTE FUNCTION private.set_actor_columns();
CREATE TRIGGER set_updated_at_on_classes BEFORE UPDATE ON public.classes FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER audit_collection_closures AFTER INSERT OR DELETE OR UPDATE ON public.collection_closures FOR EACH ROW EXECUTE FUNCTION private.capture_audit_event();
CREATE TRIGGER set_actor_columns_on_collection_closures BEFORE INSERT OR UPDATE ON public.collection_closures FOR EACH ROW EXECUTE FUNCTION private.set_actor_columns();
CREATE TRIGGER set_updated_at_on_collection_closures BEFORE UPDATE ON public.collection_closures FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER audit_config_change_batches AFTER INSERT OR DELETE OR UPDATE ON public.config_change_batches FOR EACH ROW EXECUTE FUNCTION private.capture_audit_event();
CREATE TRIGGER set_actor_columns_on_config_change_batches BEFORE INSERT OR UPDATE ON public.config_change_batches FOR EACH ROW EXECUTE FUNCTION private.set_actor_columns();
CREATE TRIGGER set_updated_at_on_config_change_batches BEFORE UPDATE ON public.config_change_batches FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER audit_config_change_blocked_installments AFTER INSERT OR DELETE OR UPDATE ON public.config_change_blocked_installments FOR EACH ROW EXECUTE FUNCTION private.capture_audit_event();
CREATE TRIGGER refresh_financials_on_blocked_installments AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.config_change_blocked_installments FOR EACH STATEMENT EXECUTE FUNCTION public.trigger_refresh_financial_views();
CREATE TRIGGER set_actor_columns_on_config_change_blocked_installments BEFORE INSERT OR UPDATE ON public.config_change_blocked_installments FOR EACH ROW EXECUTE FUNCTION private.set_actor_columns();
CREATE TRIGGER set_updated_at_on_config_change_blocked_installments BEFORE UPDATE ON public.config_change_blocked_installments FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER audit_conventional_discount_policies AFTER INSERT OR DELETE OR UPDATE ON public.conventional_discount_policies FOR EACH ROW EXECUTE FUNCTION private.capture_audit_event();
CREATE TRIGGER refresh_financials_on_conventional_policy AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.conventional_discount_policies FOR EACH STATEMENT EXECUTE FUNCTION public.trigger_refresh_financial_views();
CREATE TRIGGER set_actor_columns_on_conventional_discount_policies BEFORE INSERT OR UPDATE ON public.conventional_discount_policies FOR EACH ROW EXECUTE FUNCTION private.set_actor_columns();
CREATE TRIGGER set_updated_at_on_conventional_discount_policies BEFORE UPDATE ON public.conventional_discount_policies FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER audit_defaulter_recovery_state AFTER INSERT OR DELETE OR UPDATE ON public.defaulter_recovery_state FOR EACH ROW EXECUTE FUNCTION private.capture_audit_event();
CREATE TRIGGER set_actor_columns_on_defaulter_recovery_state BEFORE INSERT OR UPDATE ON public.defaulter_recovery_state FOR EACH ROW EXECUTE FUNCTION private.set_actor_columns();
CREATE TRIGGER set_updated_at_on_defaulter_recovery_state BEFORE UPDATE ON public.defaulter_recovery_state FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER audit_family_payments AFTER INSERT ON public.family_payments FOR EACH ROW EXECUTE FUNCTION private.capture_audit_event();
CREATE TRIGGER audit_fee_policy_configs AFTER INSERT OR DELETE OR UPDATE ON public.fee_policy_configs FOR EACH ROW EXECUTE FUNCTION private.capture_audit_event();
CREATE TRIGGER refresh_financials_on_fee_policy AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.fee_policy_configs FOR EACH STATEMENT EXECUTE FUNCTION public.trigger_refresh_financial_views();
CREATE TRIGGER set_actor_columns_on_fee_policy_configs BEFORE INSERT OR UPDATE ON public.fee_policy_configs FOR EACH ROW EXECUTE FUNCTION private.set_actor_columns();
CREATE TRIGGER set_updated_at_on_fee_policy_configs BEFORE UPDATE ON public.fee_policy_configs FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER audit_fee_settings AFTER INSERT OR DELETE OR UPDATE ON public.fee_settings FOR EACH ROW EXECUTE FUNCTION private.capture_audit_event();
CREATE TRIGGER refresh_financials_on_fee_setting AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.fee_settings FOR EACH STATEMENT EXECUTE FUNCTION public.trigger_refresh_financial_views();
CREATE TRIGGER set_actor_columns_on_fee_settings BEFORE INSERT OR UPDATE ON public.fee_settings FOR EACH ROW EXECUTE FUNCTION private.set_actor_columns();
CREATE TRIGGER set_updated_at_on_fee_settings BEFORE UPDATE ON public.fee_settings FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER audit_import_batches AFTER INSERT OR DELETE OR UPDATE ON public.import_batches FOR EACH ROW EXECUTE FUNCTION private.capture_audit_event();
CREATE TRIGGER set_actor_columns_on_import_batches BEFORE INSERT OR UPDATE ON public.import_batches FOR EACH ROW EXECUTE FUNCTION private.set_actor_columns();
CREATE TRIGGER set_updated_at_on_import_batches BEFORE UPDATE ON public.import_batches FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER audit_import_rows AFTER INSERT OR DELETE OR UPDATE ON public.import_rows FOR EACH ROW EXECUTE FUNCTION private.capture_audit_event();
CREATE TRIGGER set_actor_columns_on_import_rows BEFORE INSERT OR UPDATE ON public.import_rows FOR EACH ROW EXECUTE FUNCTION private.set_actor_columns();
CREATE TRIGGER set_updated_at_on_import_rows BEFORE UPDATE ON public.import_rows FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER audit_installments AFTER INSERT OR DELETE OR UPDATE ON public.installments FOR EACH ROW EXECUTE FUNCTION private.capture_audit_event();
CREATE TRIGGER refresh_financials_on_installment AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.installments FOR EACH STATEMENT EXECUTE FUNCTION public.trigger_refresh_financial_views();
CREATE TRIGGER set_actor_columns_on_installments BEFORE INSERT OR UPDATE ON public.installments FOR EACH ROW EXECUTE FUNCTION private.set_actor_columns();
CREATE TRIGGER set_updated_at_on_installments BEFORE UPDATE ON public.installments FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER audit_ledger_regeneration_batches AFTER INSERT OR DELETE OR UPDATE ON public.ledger_regeneration_batches FOR EACH ROW EXECUTE FUNCTION private.capture_audit_event();
CREATE TRIGGER set_actor_columns_on_ledger_regeneration_batches BEFORE INSERT OR UPDATE ON public.ledger_regeneration_batches FOR EACH ROW EXECUTE FUNCTION private.set_actor_columns();
CREATE TRIGGER set_updated_at_on_ledger_regeneration_batches BEFORE UPDATE ON public.ledger_regeneration_batches FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER audit_ledger_regeneration_rows AFTER INSERT OR DELETE OR UPDATE ON public.ledger_regeneration_rows FOR EACH ROW EXECUTE FUNCTION private.capture_audit_event();
CREATE TRIGGER set_actor_columns_on_ledger_regeneration_rows BEFORE INSERT OR UPDATE ON public.ledger_regeneration_rows FOR EACH ROW EXECUTE FUNCTION private.set_actor_columns();
CREATE TRIGGER set_updated_at_on_ledger_regeneration_rows BEFORE UPDATE ON public.ledger_regeneration_rows FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER notion_sync_log_is_append_only BEFORE DELETE OR UPDATE ON public.notion_sync_log FOR EACH ROW EXECUTE FUNCTION private.prevent_notion_sync_log_mutation();
CREATE TRIGGER audit_payment_adjustment_reviews AFTER INSERT OR DELETE OR UPDATE ON public.payment_adjustment_reviews FOR EACH ROW EXECUTE FUNCTION private.capture_audit_event();
CREATE TRIGGER payment_adjustment_reviews_are_append_only BEFORE DELETE OR UPDATE ON public.payment_adjustment_reviews FOR EACH ROW EXECUTE FUNCTION private.prevent_append_only_mutation();
CREATE TRIGGER set_created_by_on_payment_adjustment_reviews BEFORE INSERT ON public.payment_adjustment_reviews FOR EACH ROW EXECUTE FUNCTION private.set_created_by_column();
CREATE TRIGGER audit_payment_adjustments AFTER INSERT OR DELETE OR UPDATE ON public.payment_adjustments FOR EACH ROW EXECUTE FUNCTION private.capture_audit_event();
CREATE TRIGGER payment_adjustments_are_append_only BEFORE DELETE OR UPDATE ON public.payment_adjustments FOR EACH ROW EXECUTE FUNCTION private.prevent_append_only_mutation();
CREATE TRIGGER refresh_financials_on_payment_adjustment AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.payment_adjustments FOR EACH STATEMENT EXECUTE FUNCTION public.trigger_refresh_financial_views();
CREATE TRIGGER set_created_by_on_payment_adjustments BEFORE INSERT ON public.payment_adjustments FOR EACH ROW EXECUTE FUNCTION private.set_created_by_column();
CREATE TRIGGER audit_payments AFTER INSERT OR DELETE OR UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION private.capture_audit_event();
CREATE TRIGGER payments_are_append_only BEFORE DELETE OR UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION private.prevent_append_only_mutation();
CREATE TRIGGER refresh_financials_on_payment AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.payments FOR EACH STATEMENT EXECUTE FUNCTION public.trigger_refresh_financial_views();
CREATE TRIGGER set_created_by_on_payments BEFORE INSERT ON public.payments FOR EACH ROW EXECUTE FUNCTION private.set_created_by_column();
CREATE TRIGGER audit_prev_year_import_batches AFTER INSERT OR DELETE OR UPDATE ON public.prev_year_import_batches FOR EACH ROW EXECUTE FUNCTION private.capture_audit_event();
CREATE TRIGGER set_actor_columns_on_prev_year_import_batches BEFORE INSERT OR UPDATE ON public.prev_year_import_batches FOR EACH ROW EXECUTE FUNCTION private.set_actor_columns();
CREATE TRIGGER set_updated_at_on_prev_year_import_batches BEFORE UPDATE ON public.prev_year_import_batches FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER audit_prev_year_import_rows AFTER INSERT OR DELETE OR UPDATE ON public.prev_year_import_rows FOR EACH ROW EXECUTE FUNCTION private.capture_audit_event();
CREATE TRIGGER set_actor_columns_on_prev_year_import_rows BEFORE INSERT OR UPDATE ON public.prev_year_import_rows FOR EACH ROW EXECUTE FUNCTION private.set_actor_columns();
CREATE TRIGGER set_updated_at_on_prev_year_import_rows BEFORE UPDATE ON public.prev_year_import_rows FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER audit_promotion_run_entries AFTER INSERT OR DELETE OR UPDATE ON public.promotion_run_entries FOR EACH ROW EXECUTE FUNCTION private.capture_audit_event();
CREATE TRIGGER set_updated_at_on_promotion_run_entries BEFORE UPDATE ON public.promotion_run_entries FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER audit_promotion_runs AFTER INSERT OR DELETE OR UPDATE ON public.promotion_runs FOR EACH ROW EXECUTE FUNCTION private.capture_audit_event();
CREATE TRIGGER set_updated_at_on_promotion_runs BEFORE UPDATE ON public.promotion_runs FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER audit_receipt_adjustments AFTER INSERT OR DELETE OR UPDATE ON public.receipt_adjustments FOR EACH ROW EXECUTE FUNCTION private.capture_audit_event();
CREATE TRIGGER receipt_adjustments_are_append_only BEFORE DELETE OR UPDATE ON public.receipt_adjustments FOR EACH ROW EXECUTE FUNCTION private.prevent_receipt_adjustment_mutation();
CREATE TRIGGER refresh_financials_on_receipt_adjustment AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.receipt_adjustments FOR EACH STATEMENT EXECUTE FUNCTION public.trigger_refresh_financial_views();
CREATE TRIGGER set_created_by_on_receipt_adjustments BEFORE INSERT ON public.receipt_adjustments FOR EACH ROW EXECUTE FUNCTION private.set_created_by_column();
CREATE TRIGGER audit_receipts AFTER INSERT OR DELETE OR UPDATE ON public.receipts FOR EACH ROW EXECUTE FUNCTION private.capture_audit_event();
CREATE TRIGGER receipts_are_append_only BEFORE DELETE OR UPDATE ON public.receipts FOR EACH ROW EXECUTE FUNCTION private.protect_receipt_money_columns();
CREATE TRIGGER refresh_financials_on_receipt AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.receipts FOR EACH STATEMENT EXECUTE FUNCTION public.trigger_refresh_financial_views();
CREATE TRIGGER set_created_by_on_receipts BEFORE INSERT ON public.receipts FOR EACH ROW EXECUTE FUNCTION private.set_created_by_column();
CREATE TRIGGER audit_refund_requests AFTER INSERT OR DELETE OR UPDATE ON public.refund_requests FOR EACH ROW EXECUTE FUNCTION private.capture_audit_event();
CREATE TRIGGER set_actor_columns_on_refund_requests BEFORE INSERT OR UPDATE ON public.refund_requests FOR EACH ROW EXECUTE FUNCTION private.set_actor_columns();
CREATE TRIGGER set_updated_at_on_refund_requests BEFORE UPDATE ON public.refund_requests FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER audit_school_fee_defaults AFTER INSERT OR DELETE OR UPDATE ON public.school_fee_defaults FOR EACH ROW EXECUTE FUNCTION private.capture_audit_event();
CREATE TRIGGER set_actor_columns_on_school_fee_defaults BEFORE INSERT OR UPDATE ON public.school_fee_defaults FOR EACH ROW EXECUTE FUNCTION private.set_actor_columns();
CREATE TRIGGER set_updated_at_on_school_fee_defaults BEFORE UPDATE ON public.school_fee_defaults FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER audit_setup_progress AFTER INSERT OR DELETE OR UPDATE ON public.setup_progress FOR EACH ROW EXECUTE FUNCTION private.capture_audit_event();
CREATE TRIGGER set_actor_columns_on_setup_progress BEFORE INSERT OR UPDATE ON public.setup_progress FOR EACH ROW EXECUTE FUNCTION private.set_actor_columns();
CREATE TRIGGER set_updated_at_on_setup_progress BEFORE UPDATE ON public.setup_progress FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER audit_student_carry_forward_balances AFTER INSERT OR DELETE OR UPDATE ON public.student_carry_forward_balances FOR EACH ROW EXECUTE FUNCTION private.capture_audit_event();
CREATE TRIGGER set_actor_columns_on_student_carry_forward_balances BEFORE INSERT OR UPDATE ON public.student_carry_forward_balances FOR EACH ROW EXECUTE FUNCTION private.set_actor_columns();
CREATE TRIGGER set_updated_at_on_student_carry_forward_balances BEFORE UPDATE ON public.student_carry_forward_balances FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER audit_student_collection_flags AFTER INSERT OR DELETE OR UPDATE ON public.student_collection_flags FOR EACH ROW EXECUTE FUNCTION private.capture_audit_event();
CREATE TRIGGER set_actor_columns_on_student_collection_flags BEFORE INSERT OR UPDATE ON public.student_collection_flags FOR EACH ROW EXECUTE FUNCTION private.set_actor_columns();
CREATE TRIGGER set_updated_at_on_student_collection_flags BEFORE UPDATE ON public.student_collection_flags FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER audit_student_conventional_discount_assignments AFTER INSERT OR DELETE OR UPDATE ON public.student_conventional_discount_assignments FOR EACH ROW EXECUTE FUNCTION private.capture_audit_event();
CREATE TRIGGER enforce_max_active_conventional_discounts BEFORE INSERT OR UPDATE ON public.student_conventional_discount_assignments FOR EACH ROW EXECUTE FUNCTION private.enforce_max_active_conventional_discounts();
CREATE TRIGGER enforce_third_child_traceability_trg BEFORE INSERT OR UPDATE ON public.student_conventional_discount_assignments FOR EACH ROW EXECUTE FUNCTION private.enforce_third_child_traceability();
CREATE TRIGGER refresh_financials_on_conventional_assignment AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.student_conventional_discount_assignments FOR EACH STATEMENT EXECUTE FUNCTION public.trigger_refresh_financial_views();
CREATE TRIGGER set_updated_at_on_student_conventional_discount_assignments BEFORE UPDATE ON public.student_conventional_discount_assignments FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER audit_student_family_groups AFTER INSERT OR DELETE OR UPDATE ON public.student_family_groups FOR EACH ROW EXECUTE FUNCTION private.capture_audit_event();
CREATE TRIGGER set_actor_columns_on_student_family_groups BEFORE INSERT OR UPDATE ON public.student_family_groups FOR EACH ROW EXECUTE FUNCTION private.set_actor_columns();
CREATE TRIGGER set_updated_at_on_student_family_groups BEFORE UPDATE ON public.student_family_groups FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER audit_student_family_members AFTER INSERT OR DELETE OR UPDATE ON public.student_family_members FOR EACH ROW EXECUTE FUNCTION private.capture_audit_event();
CREATE TRIGGER set_updated_at_on_student_family_members BEFORE UPDATE ON public.student_family_members FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER audit_student_fee_overrides AFTER INSERT OR DELETE OR UPDATE ON public.student_fee_overrides FOR EACH ROW EXECUTE FUNCTION private.capture_audit_event();
CREATE TRIGGER refresh_financials_on_student_override AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.student_fee_overrides FOR EACH STATEMENT EXECUTE FUNCTION public.trigger_refresh_financial_views();
CREATE TRIGGER set_actor_columns_on_student_fee_overrides BEFORE INSERT OR UPDATE ON public.student_fee_overrides FOR EACH ROW EXECUTE FUNCTION private.set_actor_columns();
CREATE TRIGGER set_updated_at_on_student_fee_overrides BEFORE UPDATE ON public.student_fee_overrides FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER refresh_financials_on_late_fee_waiver AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.student_late_fee_waivers FOR EACH STATEMENT EXECUTE FUNCTION public.trigger_refresh_financial_views();
CREATE TRIGGER audit_student_repayment_emi_late_fees AFTER INSERT OR DELETE ON public.student_repayment_emi_late_fees FOR EACH ROW EXECUTE FUNCTION private.capture_audit_event();
CREATE TRIGGER student_repayment_emi_late_fees_write_once BEFORE UPDATE ON public.student_repayment_emi_late_fees FOR EACH ROW EXECUTE FUNCTION private.prevent_repayment_row_update();
CREATE TRIGGER audit_student_repayment_plan_items AFTER INSERT OR DELETE ON public.student_repayment_plan_items FOR EACH ROW EXECUTE FUNCTION private.capture_audit_event();
CREATE TRIGGER student_repayment_plan_items_write_once BEFORE UPDATE ON public.student_repayment_plan_items FOR EACH ROW EXECUTE FUNCTION private.prevent_repayment_row_update();
CREATE TRIGGER audit_student_repayment_plans AFTER INSERT OR DELETE OR UPDATE ON public.student_repayment_plans FOR EACH ROW EXECUTE FUNCTION private.capture_audit_event();
CREATE TRIGGER protect_terms_on_student_repayment_plans BEFORE UPDATE ON public.student_repayment_plans FOR EACH ROW EXECUTE FUNCTION private.protect_repayment_plan_terms();
CREATE TRIGGER set_actor_columns_on_student_repayment_plans BEFORE INSERT OR UPDATE ON public.student_repayment_plans FOR EACH ROW EXECUTE FUNCTION private.set_actor_columns();
CREATE TRIGGER set_updated_at_on_student_repayment_plans BEFORE UPDATE ON public.student_repayment_plans FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER audit_student_repayment_receipt_links AFTER INSERT OR DELETE ON public.student_repayment_receipt_links FOR EACH ROW EXECUTE FUNCTION private.capture_audit_event();
CREATE TRIGGER student_repayment_receipt_links_write_once BEFORE UPDATE ON public.student_repayment_receipt_links FOR EACH ROW EXECUTE FUNCTION private.prevent_repayment_row_update();
CREATE TRIGGER student_repayment_schedule_dates_ascend AFTER INSERT ON public.student_repayment_schedule REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION private.enforce_repayment_schedule_order();
CREATE TRIGGER student_repayment_schedule_write_once BEFORE UPDATE ON public.student_repayment_schedule FOR EACH ROW EXECUTE FUNCTION private.prevent_repayment_row_update();
CREATE TRIGGER audit_student_share_links AFTER INSERT OR DELETE OR UPDATE ON public.student_share_links FOR EACH ROW EXECUTE FUNCTION private.capture_audit_event();
CREATE TRIGGER audit_students AFTER INSERT OR DELETE OR UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION private.capture_audit_event();
CREATE TRIGGER refresh_financials_on_student AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.students FOR EACH STATEMENT EXECUTE FUNCTION public.trigger_refresh_financial_views();
CREATE TRIGGER set_actor_columns_on_students BEFORE INSERT OR UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION private.set_actor_columns();
CREATE TRIGGER set_updated_at_on_students BEFORE UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER audit_transport_routes AFTER INSERT OR DELETE OR UPDATE ON public.transport_routes FOR EACH ROW EXECUTE FUNCTION private.capture_audit_event();
CREATE TRIGGER refresh_financials_on_transport_route AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.transport_routes FOR EACH STATEMENT EXECUTE FUNCTION public.trigger_refresh_financial_views();
CREATE TRIGGER set_actor_columns_on_transport_routes BEFORE INSERT OR UPDATE ON public.transport_routes FOR EACH ROW EXECUTE FUNCTION private.set_actor_columns();
CREATE TRIGGER set_updated_at_on_transport_routes BEFORE UPDATE ON public.transport_routes FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER audit_users AFTER INSERT OR DELETE OR UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION private.capture_audit_event();
CREATE TRIGGER set_actor_columns_on_users BEFORE INSERT OR UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION private.set_actor_columns();
CREATE TRIGGER set_updated_at_on_users BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();

-- ══ Row level security ══════════════════════════════════════════════════

alter table public.academic_sessions enable row level security;
alter table public.app_settings enable row level security;
alter table public.audit_logs enable row level security;
alter table public.classes enable row level security;
alter table public.collection_closures enable row level security;
alter table public.config_change_batches enable row level security;
alter table public.config_change_blocked_installments enable row level security;
alter table public.conventional_discount_policies enable row level security;
alter table public.defaulter_contacts enable row level security;
alter table public.defaulter_recovery_state enable row level security;
alter table public.family_payments enable row level security;
alter table public.fee_policy_configs enable row level security;
alter table public.fee_settings enable row level security;
alter table public.import_batches enable row level security;
alter table public.import_rows enable row level security;
alter table public.installments enable row level security;
alter table public.late_fee_rule_change_snapshot enable row level security;
alter table public.late_fee_waiver_pool_snapshot enable row level security;
alter table public.ledger_regeneration_batches enable row level security;
alter table public.ledger_regeneration_rows enable row level security;
alter table public.notion_sync_log enable row level security;
alter table public.office_sync_events enable row level security;
alter table public.payment_adjustment_reviews enable row level security;
alter table public.payment_adjustments enable row level security;
alter table public.payment_import_batches enable row level security;
alter table public.payment_import_rows enable row level security;
alter table public.payments enable row level security;
alter table public.prev_year_import_batches enable row level security;
alter table public.prev_year_import_rows enable row level security;
alter table public.promotion_run_entries enable row level security;
alter table public.promotion_runs enable row level security;
alter table public.receipt_adjustments enable row level security;
alter table public.receipt_finance_adjustments enable row level security;
alter table public.receipts enable row level security;
alter table public.refund_requests enable row level security;
alter table public.school_fee_defaults enable row level security;
alter table public.session_reconcile_log enable row level security;
alter table public.setup_progress enable row level security;
alter table public.student_carry_forward_balances enable row level security;
alter table public.student_collection_flags enable row level security;
alter table public.student_conventional_discount_assignments enable row level security;
alter table public.student_family_groups enable row level security;
alter table public.student_family_members enable row level security;
alter table public.student_fee_overrides enable row level security;
alter table public.student_late_fee_waivers enable row level security;
alter table public.student_repayment_emi_late_fees enable row level security;
alter table public.student_repayment_plan_items enable row level security;
alter table public.student_repayment_plans enable row level security;
alter table public.student_repayment_receipt_links enable row level security;
alter table public.student_repayment_schedule enable row level security;
alter table public.student_session_reanchor_log enable row level security;
alter table public.student_share_links enable row level security;
alter table public.students enable row level security;
alter table public.transport_routes enable row level security;
alter table public.user_activity_events enable row level security;
alter table public.users enable row level security;
alter table public.whatsapp_campaign_runs enable row level security;
alter table public.whatsapp_campaigns enable row level security;
alter table public.whatsapp_reminder_sends enable row level security;
alter table public.whatsapp_templates enable row level security;
alter table public.workbook_materialized_view_refresh_queue enable row level security;

drop policy if exists "admin can create repayment plan items" on public.student_repayment_plan_items;
create policy "admin can create repayment plan items" on public.student_repayment_plan_items as PERMISSIVE for INSERT to authenticated with check (( SELECT public.has_permission('fees:repayment_plan'::text) AS has_permission));
drop policy if exists "admin can create repayment plans" on public.student_repayment_plans;
create policy "admin can create repayment plans" on public.student_repayment_plans as PERMISSIVE for INSERT to authenticated with check (( SELECT public.has_permission('fees:repayment_plan'::text) AS has_permission));
drop policy if exists "admin can create repayment schedule" on public.student_repayment_schedule;
create policy "admin can create repayment schedule" on public.student_repayment_schedule as PERMISSIVE for INSERT to authenticated with check (( SELECT public.has_permission('fees:repayment_plan'::text) AS has_permission));
drop policy if exists "admin can insert collection flags" on public.student_collection_flags;
create policy "admin can insert collection flags" on public.student_collection_flags as PERMISSIVE for INSERT to authenticated with check (( SELECT public.has_permission('students:write'::text) AS has_permission));
drop policy if exists "admin can insert promotion run entries" on public.promotion_run_entries;
create policy "admin can insert promotion run entries" on public.promotion_run_entries as PERMISSIVE for INSERT to authenticated with check (( SELECT public.has_permission('students:write'::text) AS has_permission));
drop policy if exists "admin can insert promotion runs" on public.promotion_runs;
create policy "admin can insert promotion runs" on public.promotion_runs as PERMISSIVE for INSERT to authenticated with check (( SELECT public.has_permission('students:write'::text) AS has_permission));
drop policy if exists "admin can move repayment plan lifecycle" on public.student_repayment_plans;
create policy "admin can move repayment plan lifecycle" on public.student_repayment_plans as PERMISSIVE for UPDATE to authenticated using (( SELECT public.has_permission('fees:repayment_plan'::text) AS has_permission)) with check (( SELECT public.has_permission('fees:repayment_plan'::text) AS has_permission));
drop policy if exists "admin can read promotion run entries" on public.promotion_run_entries;
create policy "admin can read promotion run entries" on public.promotion_run_entries as PERMISSIVE for SELECT to authenticated using (( SELECT public.has_permission('students:write'::text) AS has_permission));
drop policy if exists "admin can read promotion runs" on public.promotion_runs;
create policy "admin can read promotion runs" on public.promotion_runs as PERMISSIVE for SELECT to authenticated using (( SELECT public.has_permission('students:write'::text) AS has_permission));
drop policy if exists "admin can update collection flags" on public.student_collection_flags;
create policy "admin can update collection flags" on public.student_collection_flags as PERMISSIVE for UPDATE to authenticated using (( SELECT public.has_permission('students:write'::text) AS has_permission)) with check (( SELECT public.has_permission('students:write'::text) AS has_permission));
drop policy if exists "admin can update promotion run entries" on public.promotion_run_entries;
create policy "admin can update promotion run entries" on public.promotion_run_entries as PERMISSIVE for UPDATE to authenticated using (( SELECT public.has_permission('students:write'::text) AS has_permission)) with check (( SELECT public.has_permission('students:write'::text) AS has_permission));
drop policy if exists "admin can update promotion runs" on public.promotion_runs;
create policy "admin can update promotion runs" on public.promotion_runs as PERMISSIVE for UPDATE to authenticated using (( SELECT public.has_permission('students:write'::text) AS has_permission)) with check (( SELECT public.has_permission('students:write'::text) AS has_permission));
drop policy if exists "admins can insert setup progress" on public.setup_progress;
create policy "admins can insert setup progress" on public.setup_progress as PERMISSIVE for INSERT to authenticated with check (( SELECT public.has_permission('settings:write'::text) AS has_permission));
drop policy if exists "admins can update setup progress" on public.setup_progress;
create policy "admins can update setup progress" on public.setup_progress as PERMISSIVE for UPDATE to authenticated using (( SELECT public.has_permission('settings:write'::text) AS has_permission)) with check (( SELECT public.has_permission('settings:write'::text) AS has_permission));
drop policy if exists "authenticated can delete academic sessions" on public.academic_sessions;
create policy "authenticated can delete academic sessions" on public.academic_sessions as PERMISSIVE for DELETE to authenticated using (( SELECT public.has_permission('settings:write'::text) AS has_permission));
drop policy if exists "authenticated can delete conventional discount policies" on public.conventional_discount_policies;
create policy "authenticated can delete conventional discount policies" on public.conventional_discount_policies as PERMISSIVE for DELETE to authenticated using (( SELECT public.has_permission('fees:write'::text) AS has_permission));
drop policy if exists "authenticated can delete student conventional discounts" on public.student_conventional_discount_assignments;
create policy "authenticated can delete student conventional discounts" on public.student_conventional_discount_assignments as PERMISSIVE for DELETE to authenticated using (( SELECT public.has_permission('students:write'::text) AS has_permission));
drop policy if exists "authenticated can delete student family groups" on public.student_family_groups;
create policy "authenticated can delete student family groups" on public.student_family_groups as PERMISSIVE for DELETE to authenticated using (( SELECT public.has_permission('students:write'::text) AS has_permission));
drop policy if exists "authenticated can delete student family members" on public.student_family_members;
create policy "authenticated can delete student family members" on public.student_family_members as PERMISSIVE for DELETE to authenticated using (( SELECT public.has_permission('students:write'::text) AS has_permission));
drop policy if exists "authenticated can insert academic sessions" on public.academic_sessions;
create policy "authenticated can insert academic sessions" on public.academic_sessions as PERMISSIVE for INSERT to authenticated with check (( SELECT public.has_permission('settings:write'::text) AS has_permission));
drop policy if exists "authenticated can insert carry forward balances" on public.student_carry_forward_balances;
create policy "authenticated can insert carry forward balances" on public.student_carry_forward_balances as PERMISSIVE for INSERT to authenticated with check (( SELECT public.has_permission('fees:write'::text) AS has_permission));
drop policy if exists "authenticated can insert classes" on public.classes;
create policy "authenticated can insert classes" on public.classes as PERMISSIVE for INSERT to authenticated with check (( SELECT public.has_permission('fees:write'::text) AS has_permission));
drop policy if exists "authenticated can insert collection closures" on public.collection_closures;
create policy "authenticated can insert collection closures" on public.collection_closures as PERMISSIVE for INSERT to authenticated with check (( SELECT public.has_permission('finance:write'::text) AS has_permission));
drop policy if exists "authenticated can insert config change batches" on public.config_change_batches;
create policy "authenticated can insert config change batches" on public.config_change_batches as PERMISSIVE for INSERT to authenticated with check (( SELECT public.has_permission('fees:write'::text) AS has_permission));
drop policy if exists "authenticated can insert config change blocked installments" on public.config_change_blocked_installments;
create policy "authenticated can insert config change blocked installments" on public.config_change_blocked_installments as PERMISSIVE for INSERT to authenticated with check (( SELECT public.has_permission('fees:write'::text) AS has_permission));
drop policy if exists "authenticated can insert conventional discount policies" on public.conventional_discount_policies;
create policy "authenticated can insert conventional discount policies" on public.conventional_discount_policies as PERMISSIVE for INSERT to authenticated with check (( SELECT public.has_permission('fees:write'::text) AS has_permission));
drop policy if exists "authenticated can insert family payments" on public.family_payments;
create policy "authenticated can insert family payments" on public.family_payments as PERMISSIVE for INSERT to authenticated with check (( SELECT public.has_permission('payments:write'::text) AS has_permission));
drop policy if exists "authenticated can insert fee policy configs" on public.fee_policy_configs;
create policy "authenticated can insert fee policy configs" on public.fee_policy_configs as PERMISSIVE for INSERT to authenticated with check ((( SELECT auth.uid() AS uid) IS NOT NULL));
drop policy if exists "authenticated can insert fee settings" on public.fee_settings;
create policy "authenticated can insert fee settings" on public.fee_settings as PERMISSIVE for INSERT to authenticated with check (( SELECT public.has_permission('fees:write'::text) AS has_permission));
drop policy if exists "authenticated can insert installments" on public.installments;
create policy "authenticated can insert installments" on public.installments as PERMISSIVE for INSERT to authenticated with check (( SELECT public.has_permission('fees:write'::text) AS has_permission));
drop policy if exists "authenticated can insert ledger regeneration batches" on public.ledger_regeneration_batches;
create policy "authenticated can insert ledger regeneration batches" on public.ledger_regeneration_batches as PERMISSIVE for INSERT to authenticated with check (( SELECT public.has_permission('fees:write'::text) AS has_permission));
drop policy if exists "authenticated can insert ledger regeneration rows" on public.ledger_regeneration_rows;
create policy "authenticated can insert ledger regeneration rows" on public.ledger_regeneration_rows as PERMISSIVE for INSERT to authenticated with check (( SELECT public.has_permission('fees:write'::text) AS has_permission));
drop policy if exists "authenticated can insert payment adjustment reviews" on public.payment_adjustment_reviews;
create policy "authenticated can insert payment adjustment reviews" on public.payment_adjustment_reviews as PERMISSIVE for INSERT to authenticated with check (( SELECT public.has_permission('finance:approve'::text) AS has_permission));
drop policy if exists "authenticated can insert payment adjustments" on public.payment_adjustments;
create policy "authenticated can insert payment adjustments" on public.payment_adjustments as PERMISSIVE for INSERT to authenticated with check (( SELECT public.has_permission('payments:adjust'::text) AS has_permission));
drop policy if exists "authenticated can insert payments" on public.payments;
create policy "authenticated can insert payments" on public.payments as PERMISSIVE for INSERT to authenticated with check (( SELECT public.has_permission('payments:write'::text) AS has_permission));
drop policy if exists "authenticated can insert prev year import batches" on public.prev_year_import_batches;
create policy "authenticated can insert prev year import batches" on public.prev_year_import_batches as PERMISSIVE for INSERT to authenticated with check (( SELECT public.has_permission('fees:write'::text) AS has_permission));
drop policy if exists "authenticated can insert prev year import rows" on public.prev_year_import_rows;
create policy "authenticated can insert prev year import rows" on public.prev_year_import_rows as PERMISSIVE for INSERT to authenticated with check (( SELECT public.has_permission('fees:write'::text) AS has_permission));
drop policy if exists "authenticated can insert receipt adjustments" on public.receipt_adjustments;
create policy "authenticated can insert receipt adjustments" on public.receipt_adjustments as PERMISSIVE for INSERT to authenticated with check (( SELECT public.has_permission('payments:write'::text) AS has_permission));
drop policy if exists "authenticated can insert receipts" on public.receipts;
create policy "authenticated can insert receipts" on public.receipts as PERMISSIVE for INSERT to authenticated with check (( SELECT public.has_permission('payments:write'::text) AS has_permission));
drop policy if exists "authenticated can insert refund requests" on public.refund_requests;
create policy "authenticated can insert refund requests" on public.refund_requests as PERMISSIVE for INSERT to authenticated with check (( SELECT public.has_permission('finance:write'::text) AS has_permission));
drop policy if exists "authenticated can insert school fee defaults" on public.school_fee_defaults;
create policy "authenticated can insert school fee defaults" on public.school_fee_defaults as PERMISSIVE for INSERT to authenticated with check (( SELECT public.has_permission('fees:write'::text) AS has_permission));
drop policy if exists "authenticated can insert student conventional discounts" on public.student_conventional_discount_assignments;
create policy "authenticated can insert student conventional discounts" on public.student_conventional_discount_assignments as PERMISSIVE for INSERT to authenticated with check (( SELECT public.has_permission('students:write'::text) AS has_permission));
drop policy if exists "authenticated can insert student family groups" on public.student_family_groups;
create policy "authenticated can insert student family groups" on public.student_family_groups as PERMISSIVE for INSERT to authenticated with check (( SELECT public.has_permission('students:write'::text) AS has_permission));
drop policy if exists "authenticated can insert student family members" on public.student_family_members;
create policy "authenticated can insert student family members" on public.student_family_members as PERMISSIVE for INSERT to authenticated with check (( SELECT public.has_permission('students:write'::text) AS has_permission));
drop policy if exists "authenticated can insert student fee overrides" on public.student_fee_overrides;
create policy "authenticated can insert student fee overrides" on public.student_fee_overrides as PERMISSIVE for INSERT to authenticated with check (( SELECT public.has_permission('fees:write'::text) AS has_permission));
drop policy if exists "authenticated can insert students" on public.students;
create policy "authenticated can insert students" on public.students as PERMISSIVE for INSERT to authenticated with check (( SELECT public.has_permission('students:write'::text) AS has_permission));
drop policy if exists "authenticated can insert transport routes" on public.transport_routes;
create policy "authenticated can insert transport routes" on public.transport_routes as PERMISSIVE for INSERT to authenticated with check (( SELECT public.has_permission('fees:write'::text) AS has_permission));
drop policy if exists "authenticated can insert users" on public.users;
create policy "authenticated can insert users" on public.users as PERMISSIVE for INSERT to authenticated with check (( SELECT public.has_permission('staff:manage'::text) AS has_permission));
drop policy if exists "authenticated can read academic sessions" on public.academic_sessions;
create policy "authenticated can read academic sessions" on public.academic_sessions as PERMISSIVE for SELECT to authenticated using (( SELECT public.has_any_permission(ARRAY['dashboard:view'::text, 'students:view'::text, 'fees:view'::text, 'payments:view'::text, 'defaulters:view'::text, 'imports:view'::text, 'reports:view'::text, 'settings:view'::text]) AS has_any_permission));
drop policy if exists "authenticated can read app_settings" on public.app_settings;
create policy "authenticated can read app_settings" on public.app_settings as PERMISSIVE for SELECT to authenticated using (true);
drop policy if exists "authenticated can read audit logs" on public.audit_logs;
create policy "authenticated can read audit logs" on public.audit_logs as PERMISSIVE for SELECT to authenticated using (( SELECT public.has_permission('staff:manage'::text) AS has_permission));
drop policy if exists "authenticated can read carry forward balances" on public.student_carry_forward_balances;
create policy "authenticated can read carry forward balances" on public.student_carry_forward_balances as PERMISSIVE for SELECT to authenticated using (( SELECT public.has_permission('fees:view'::text) AS has_permission));
drop policy if exists "authenticated can read classes" on public.classes;
create policy "authenticated can read classes" on public.classes as PERMISSIVE for SELECT to authenticated using (( SELECT public.has_any_permission(ARRAY['dashboard:view'::text, 'students:view'::text, 'fees:view'::text, 'payments:view'::text, 'defaulters:view'::text, 'finance:view'::text]) AS has_any_permission));
drop policy if exists "authenticated can read collection closures" on public.collection_closures;
create policy "authenticated can read collection closures" on public.collection_closures as PERMISSIVE for SELECT to authenticated using (( SELECT public.has_permission('finance:view'::text) AS has_permission));
drop policy if exists "authenticated can read config change batches" on public.config_change_batches;
create policy "authenticated can read config change batches" on public.config_change_batches as PERMISSIVE for SELECT to authenticated using (( SELECT public.has_permission('fees:view'::text) AS has_permission));
drop policy if exists "authenticated can read config change blocked installments" on public.config_change_blocked_installments;
create policy "authenticated can read config change blocked installments" on public.config_change_blocked_installments as PERMISSIVE for SELECT to authenticated using (( SELECT public.has_permission('fees:view'::text) AS has_permission));
drop policy if exists "authenticated can read conventional discount policies" on public.conventional_discount_policies;
create policy "authenticated can read conventional discount policies" on public.conventional_discount_policies as PERMISSIVE for SELECT to authenticated using (( SELECT public.has_any_permission(ARRAY['fees:view'::text, 'students:view'::text, 'reports:view'::text]) AS has_any_permission));
drop policy if exists "authenticated can read family payments" on public.family_payments;
create policy "authenticated can read family payments" on public.family_payments as PERMISSIVE for SELECT to authenticated using (( SELECT public.has_any_permission(ARRAY['receipts:view'::text, 'payments:view'::text, 'reports:view'::text]) AS has_any_permission));
drop policy if exists "authenticated can read fee policy configs" on public.fee_policy_configs;
create policy "authenticated can read fee policy configs" on public.fee_policy_configs as PERMISSIVE for SELECT to authenticated using ((( SELECT auth.uid() AS uid) IS NOT NULL));
drop policy if exists "authenticated can read fee settings" on public.fee_settings;
create policy "authenticated can read fee settings" on public.fee_settings as PERMISSIVE for SELECT to authenticated using (( SELECT public.has_permission('fees:view'::text) AS has_permission));
drop policy if exists "authenticated can read installments" on public.installments;
create policy "authenticated can read installments" on public.installments as PERMISSIVE for SELECT to authenticated using (( SELECT public.has_any_permission(ARRAY['fees:view'::text, 'payments:view'::text, 'ledger:view'::text, 'defaulters:view'::text, 'finance:view'::text]) AS has_any_permission));
drop policy if exists "authenticated can read ledger regeneration batches" on public.ledger_regeneration_batches;
create policy "authenticated can read ledger regeneration batches" on public.ledger_regeneration_batches as PERMISSIVE for SELECT to authenticated using (( SELECT public.has_permission('fees:view'::text) AS has_permission));
drop policy if exists "authenticated can read ledger regeneration rows" on public.ledger_regeneration_rows;
create policy "authenticated can read ledger regeneration rows" on public.ledger_regeneration_rows as PERMISSIVE for SELECT to authenticated using (( SELECT public.has_permission('fees:view'::text) AS has_permission));
drop policy if exists "authenticated can read payment adjustment reviews" on public.payment_adjustment_reviews;
create policy "authenticated can read payment adjustment reviews" on public.payment_adjustment_reviews as PERMISSIVE for SELECT to authenticated using (( SELECT public.has_permission('finance:view'::text) AS has_permission));
drop policy if exists "authenticated can read payment adjustments" on public.payment_adjustments;
create policy "authenticated can read payment adjustments" on public.payment_adjustments as PERMISSIVE for SELECT to authenticated using (( SELECT public.has_any_permission(ARRAY['ledger:view'::text, 'defaulters:view'::text, 'dashboard:view'::text, 'finance:view'::text]) AS has_any_permission));
drop policy if exists "authenticated can read payments" on public.payments;
create policy "authenticated can read payments" on public.payments as PERMISSIVE for SELECT to authenticated using (( SELECT public.has_any_permission(ARRAY['payments:view'::text, 'ledger:view'::text, 'receipts:view'::text, 'dashboard:view'::text, 'finance:view'::text]) AS has_any_permission));
drop policy if exists "authenticated can read prev year import batches" on public.prev_year_import_batches;
create policy "authenticated can read prev year import batches" on public.prev_year_import_batches as PERMISSIVE for SELECT to authenticated using (( SELECT public.has_permission('fees:view'::text) AS has_permission));
drop policy if exists "authenticated can read prev year import rows" on public.prev_year_import_rows;
create policy "authenticated can read prev year import rows" on public.prev_year_import_rows as PERMISSIVE for SELECT to authenticated using (( SELECT public.has_permission('fees:view'::text) AS has_permission));
drop policy if exists "authenticated can read receipt adjustments" on public.receipt_adjustments;
create policy "authenticated can read receipt adjustments" on public.receipt_adjustments as PERMISSIVE for SELECT to authenticated using (( SELECT public.has_any_permission(ARRAY['payments:view'::text, 'receipts:view'::text, 'reports:view'::text, 'defaulters:view'::text]) AS has_any_permission));
drop policy if exists "authenticated can read receipt finance adjustments" on public.receipt_finance_adjustments;
create policy "authenticated can read receipt finance adjustments" on public.receipt_finance_adjustments as PERMISSIVE for SELECT to authenticated using (true);
drop policy if exists "authenticated can read receipts" on public.receipts;
create policy "authenticated can read receipts" on public.receipts as PERMISSIVE for SELECT to authenticated using (( SELECT public.has_any_permission(ARRAY['payments:view'::text, 'ledger:view'::text, 'receipts:view'::text, 'dashboard:view'::text, 'finance:view'::text]) AS has_any_permission));
drop policy if exists "authenticated can read refund requests" on public.refund_requests;
create policy "authenticated can read refund requests" on public.refund_requests as PERMISSIVE for SELECT to authenticated using (( SELECT public.has_permission('finance:view'::text) AS has_permission));
drop policy if exists "authenticated can read school fee defaults" on public.school_fee_defaults;
create policy "authenticated can read school fee defaults" on public.school_fee_defaults as PERMISSIVE for SELECT to authenticated using (( SELECT public.has_permission('fees:view'::text) AS has_permission));
drop policy if exists "authenticated can read student conventional discounts" on public.student_conventional_discount_assignments;
create policy "authenticated can read student conventional discounts" on public.student_conventional_discount_assignments as PERMISSIVE for SELECT to authenticated using (( SELECT public.has_any_permission(ARRAY['students:view'::text, 'fees:view'::text, 'payments:view'::text, 'reports:view'::text, 'defaulters:view'::text]) AS has_any_permission));
drop policy if exists "authenticated can read student family groups" on public.student_family_groups;
create policy "authenticated can read student family groups" on public.student_family_groups as PERMISSIVE for SELECT to authenticated using (( SELECT public.has_any_permission(ARRAY['students:view'::text, 'fees:view'::text, 'reports:view'::text]) AS has_any_permission));
drop policy if exists "authenticated can read student family members" on public.student_family_members;
create policy "authenticated can read student family members" on public.student_family_members as PERMISSIVE for SELECT to authenticated using (( SELECT public.has_any_permission(ARRAY['students:view'::text, 'fees:view'::text, 'reports:view'::text]) AS has_any_permission));
drop policy if exists "authenticated can read student fee overrides" on public.student_fee_overrides;
create policy "authenticated can read student fee overrides" on public.student_fee_overrides as PERMISSIVE for SELECT to authenticated using (( SELECT public.has_permission('fees:view'::text) AS has_permission));
drop policy if exists "authenticated can read students" on public.students;
create policy "authenticated can read students" on public.students as PERMISSIVE for SELECT to authenticated using (( SELECT public.has_any_permission(ARRAY['students:view'::text, 'payments:view'::text, 'ledger:view'::text, 'receipts:view'::text, 'defaulters:view'::text, 'dashboard:view'::text, 'finance:view'::text]) AS has_any_permission));
drop policy if exists "authenticated can read transport routes" on public.transport_routes;
create policy "authenticated can read transport routes" on public.transport_routes as PERMISSIVE for SELECT to authenticated using (( SELECT public.has_any_permission(ARRAY['students:view'::text, 'fees:view'::text, 'defaulters:view'::text]) AS has_any_permission));
drop policy if exists "authenticated can read users" on public.users;
create policy "authenticated can read users" on public.users as PERMISSIVE for SELECT to authenticated using (( SELECT public.has_any_permission(ARRAY['dashboard:view'::text, 'ledger:view'::text, 'receipts:view'::text, 'staff:manage'::text, 'finance:view'::text]) AS has_any_permission));
drop policy if exists "authenticated can update academic sessions" on public.academic_sessions;
create policy "authenticated can update academic sessions" on public.academic_sessions as PERMISSIVE for UPDATE to authenticated using (( SELECT public.has_permission('settings:write'::text) AS has_permission)) with check (( SELECT public.has_permission('settings:write'::text) AS has_permission));
drop policy if exists "authenticated can update carry forward balances" on public.student_carry_forward_balances;
create policy "authenticated can update carry forward balances" on public.student_carry_forward_balances as PERMISSIVE for UPDATE to authenticated using (( SELECT public.has_permission('fees:write'::text) AS has_permission)) with check (( SELECT public.has_permission('fees:write'::text) AS has_permission));
drop policy if exists "authenticated can update classes" on public.classes;
create policy "authenticated can update classes" on public.classes as PERMISSIVE for UPDATE to authenticated using (( SELECT public.has_permission('fees:write'::text) AS has_permission)) with check (( SELECT public.has_permission('fees:write'::text) AS has_permission));
drop policy if exists "authenticated can update collection closures" on public.collection_closures;
create policy "authenticated can update collection closures" on public.collection_closures as PERMISSIVE for UPDATE to authenticated using (( SELECT public.has_any_permission(ARRAY['finance:write'::text, 'finance:approve'::text]) AS has_any_permission)) with check (( SELECT public.has_any_permission(ARRAY['finance:write'::text, 'finance:approve'::text]) AS has_any_permission));
drop policy if exists "authenticated can update config change batches" on public.config_change_batches;
create policy "authenticated can update config change batches" on public.config_change_batches as PERMISSIVE for UPDATE to authenticated using (( SELECT public.has_permission('fees:write'::text) AS has_permission)) with check (( SELECT public.has_permission('fees:write'::text) AS has_permission));
drop policy if exists "authenticated can update config change blocked installments" on public.config_change_blocked_installments;
create policy "authenticated can update config change blocked installments" on public.config_change_blocked_installments as PERMISSIVE for UPDATE to authenticated using (( SELECT public.has_permission('fees:write'::text) AS has_permission)) with check (( SELECT public.has_permission('fees:write'::text) AS has_permission));
drop policy if exists "authenticated can update conventional discount policies" on public.conventional_discount_policies;
create policy "authenticated can update conventional discount policies" on public.conventional_discount_policies as PERMISSIVE for UPDATE to authenticated using (( SELECT public.has_permission('fees:write'::text) AS has_permission)) with check (( SELECT public.has_permission('fees:write'::text) AS has_permission));
drop policy if exists "authenticated can update fee policy configs" on public.fee_policy_configs;
create policy "authenticated can update fee policy configs" on public.fee_policy_configs as PERMISSIVE for UPDATE to authenticated using ((( SELECT auth.uid() AS uid) IS NOT NULL)) with check ((( SELECT auth.uid() AS uid) IS NOT NULL));
drop policy if exists "authenticated can update fee settings" on public.fee_settings;
create policy "authenticated can update fee settings" on public.fee_settings as PERMISSIVE for UPDATE to authenticated using (( SELECT public.has_permission('fees:write'::text) AS has_permission)) with check (( SELECT public.has_permission('fees:write'::text) AS has_permission));
drop policy if exists "authenticated can update installments" on public.installments;
create policy "authenticated can update installments" on public.installments as PERMISSIVE for UPDATE to authenticated using (( SELECT public.has_permission('fees:write'::text) AS has_permission)) with check (( SELECT public.has_permission('fees:write'::text) AS has_permission));
drop policy if exists "authenticated can update ledger regeneration batches" on public.ledger_regeneration_batches;
create policy "authenticated can update ledger regeneration batches" on public.ledger_regeneration_batches as PERMISSIVE for UPDATE to authenticated using (( SELECT public.has_permission('fees:write'::text) AS has_permission)) with check (( SELECT public.has_permission('fees:write'::text) AS has_permission));
drop policy if exists "authenticated can update ledger regeneration rows" on public.ledger_regeneration_rows;
create policy "authenticated can update ledger regeneration rows" on public.ledger_regeneration_rows as PERMISSIVE for UPDATE to authenticated using (( SELECT public.has_permission('fees:write'::text) AS has_permission)) with check (( SELECT public.has_permission('fees:write'::text) AS has_permission));
drop policy if exists "authenticated can update prev year import batches" on public.prev_year_import_batches;
create policy "authenticated can update prev year import batches" on public.prev_year_import_batches as PERMISSIVE for UPDATE to authenticated using (( SELECT public.has_permission('fees:write'::text) AS has_permission)) with check (( SELECT public.has_permission('fees:write'::text) AS has_permission));
drop policy if exists "authenticated can update prev year import rows" on public.prev_year_import_rows;
create policy "authenticated can update prev year import rows" on public.prev_year_import_rows as PERMISSIVE for UPDATE to authenticated using (( SELECT public.has_permission('fees:write'::text) AS has_permission)) with check (( SELECT public.has_permission('fees:write'::text) AS has_permission));
drop policy if exists "authenticated can update refund requests" on public.refund_requests;
create policy "authenticated can update refund requests" on public.refund_requests as PERMISSIVE for UPDATE to authenticated using (( SELECT public.has_any_permission(ARRAY['finance:write'::text, 'finance:approve'::text]) AS has_any_permission)) with check (( SELECT public.has_any_permission(ARRAY['finance:write'::text, 'finance:approve'::text]) AS has_any_permission));
drop policy if exists "authenticated can update school fee defaults" on public.school_fee_defaults;
create policy "authenticated can update school fee defaults" on public.school_fee_defaults as PERMISSIVE for UPDATE to authenticated using (( SELECT public.has_permission('fees:write'::text) AS has_permission)) with check (( SELECT public.has_permission('fees:write'::text) AS has_permission));
drop policy if exists "authenticated can update student conventional discounts" on public.student_conventional_discount_assignments;
create policy "authenticated can update student conventional discounts" on public.student_conventional_discount_assignments as PERMISSIVE for UPDATE to authenticated using (( SELECT public.has_permission('students:write'::text) AS has_permission)) with check (( SELECT public.has_permission('students:write'::text) AS has_permission));
drop policy if exists "authenticated can update student family groups" on public.student_family_groups;
create policy "authenticated can update student family groups" on public.student_family_groups as PERMISSIVE for UPDATE to authenticated using (( SELECT public.has_permission('students:write'::text) AS has_permission)) with check (( SELECT public.has_permission('students:write'::text) AS has_permission));
drop policy if exists "authenticated can update student family members" on public.student_family_members;
create policy "authenticated can update student family members" on public.student_family_members as PERMISSIVE for UPDATE to authenticated using (( SELECT public.has_permission('students:write'::text) AS has_permission)) with check (( SELECT public.has_permission('students:write'::text) AS has_permission));
drop policy if exists "authenticated can update student fee overrides" on public.student_fee_overrides;
create policy "authenticated can update student fee overrides" on public.student_fee_overrides as PERMISSIVE for UPDATE to authenticated using (( SELECT public.has_permission('fees:write'::text) AS has_permission)) with check (( SELECT public.has_permission('fees:write'::text) AS has_permission));
drop policy if exists "authenticated can update students" on public.students;
create policy "authenticated can update students" on public.students as PERMISSIVE for UPDATE to authenticated using (( SELECT public.has_permission('students:write'::text) AS has_permission)) with check (( SELECT public.has_permission('students:write'::text) AS has_permission));
drop policy if exists "authenticated can update transport routes" on public.transport_routes;
create policy "authenticated can update transport routes" on public.transport_routes as PERMISSIVE for UPDATE to authenticated using (( SELECT public.has_permission('fees:write'::text) AS has_permission)) with check (( SELECT public.has_permission('fees:write'::text) AS has_permission));
drop policy if exists "authenticated can update users" on public.users;
create policy "authenticated can update users" on public.users as PERMISSIVE for UPDATE to authenticated using (( SELECT public.has_permission('staff:manage'::text) AS has_permission)) with check (( SELECT public.has_permission('staff:manage'::text) AS has_permission));
drop policy if exists "defaulter_contacts: staff insert" on public.defaulter_contacts;
create policy "defaulter_contacts: staff insert" on public.defaulter_contacts as PERMISSIVE for INSERT to public with check ((( SELECT auth.role() AS role) = 'authenticated'::text));
drop policy if exists "defaulter_contacts: staff read" on public.defaulter_contacts;
create policy "defaulter_contacts: staff read" on public.defaulter_contacts as PERMISSIVE for SELECT to public using ((( SELECT auth.role() AS role) = 'authenticated'::text));
drop policy if exists "fees:view can read reconcile log" on public.session_reconcile_log;
create policy "fees:view can read reconcile log" on public.session_reconcile_log as PERMISSIVE for SELECT to authenticated using (( SELECT public.has_permission('fees:view'::text) AS has_permission));
drop policy if exists "fees:write can update reconcile log" on public.session_reconcile_log;
create policy "fees:write can update reconcile log" on public.session_reconcile_log as PERMISSIVE for UPDATE to authenticated using (( SELECT public.has_permission('fees:write'::text) AS has_permission));
drop policy if exists "fees:write can write reconcile log" on public.session_reconcile_log;
create policy "fees:write can write reconcile log" on public.session_reconcile_log as PERMISSIVE for INSERT to authenticated with check (( SELECT public.has_permission('fees:write'::text) AS has_permission));
drop policy if exists "notion sync can read classes" on public.classes;
create policy "notion sync can read classes" on public.classes as PERMISSIVE for SELECT to notion_fee_sync_role using (true);
drop policy if exists "notion sync can read fee_policy_configs" on public.fee_policy_configs;
create policy "notion sync can read fee_policy_configs" on public.fee_policy_configs as PERMISSIVE for SELECT to notion_fee_sync_role using (true);
drop policy if exists "notion sync can read fee_settings" on public.fee_settings;
create policy "notion sync can read fee_settings" on public.fee_settings as PERMISSIVE for SELECT to notion_fee_sync_role using (true);
drop policy if exists "notion sync can read installments" on public.installments;
create policy "notion sync can read installments" on public.installments as PERMISSIVE for SELECT to notion_fee_sync_role using (true);
drop policy if exists "notion sync can read payment_adjustments" on public.payment_adjustments;
create policy "notion sync can read payment_adjustments" on public.payment_adjustments as PERMISSIVE for SELECT to notion_fee_sync_role using (true);
drop policy if exists "notion sync can read payments" on public.payments;
create policy "notion sync can read payments" on public.payments as PERMISSIVE for SELECT to notion_fee_sync_role using (true);
drop policy if exists "notion sync can read receipts" on public.receipts;
create policy "notion sync can read receipts" on public.receipts as PERMISSIVE for SELECT to notion_fee_sync_role using (true);
drop policy if exists "notion sync can read school_fee_defaults" on public.school_fee_defaults;
create policy "notion sync can read school_fee_defaults" on public.school_fee_defaults as PERMISSIVE for SELECT to notion_fee_sync_role using (true);
drop policy if exists "notion sync can read student_family_groups" on public.student_family_groups;
create policy "notion sync can read student_family_groups" on public.student_family_groups as PERMISSIVE for SELECT to notion_fee_sync_role using (true);
drop policy if exists "notion sync can read student_family_members" on public.student_family_members;
create policy "notion sync can read student_family_members" on public.student_family_members as PERMISSIVE for SELECT to notion_fee_sync_role using (true);
drop policy if exists "notion sync can read student_fee_overrides" on public.student_fee_overrides;
create policy "notion sync can read student_fee_overrides" on public.student_fee_overrides as PERMISSIVE for SELECT to notion_fee_sync_role using (true);
drop policy if exists "notion sync can read students" on public.students;
create policy "notion sync can read students" on public.students as PERMISSIVE for SELECT to notion_fee_sync_role using (true);
drop policy if exists "notion sync can read transport_routes" on public.transport_routes;
create policy "notion sync can read transport_routes" on public.transport_routes as PERMISSIVE for SELECT to notion_fee_sync_role using (true);
drop policy if exists "notion sync role can insert log rows" on public.notion_sync_log;
create policy "notion sync role can insert log rows" on public.notion_sync_log as PERMISSIVE for INSERT to notion_fee_sync_role with check (true);
drop policy if exists "notion sync role can read log rows" on public.notion_sync_log;
create policy "notion sync role can read log rows" on public.notion_sync_log as PERMISSIVE for SELECT to notion_fee_sync_role using (true);
drop policy if exists "payment posting can link receipts to plans" on public.student_repayment_receipt_links;
create policy "payment posting can link receipts to plans" on public.student_repayment_receipt_links as PERMISSIVE for INSERT to authenticated with check (( SELECT public.has_permission('payments:write'::text) AS has_permission));
drop policy if exists "payment writers can insert receipt finance adjustments" on public.receipt_finance_adjustments;
create policy "payment writers can insert receipt finance adjustments" on public.receipt_finance_adjustments as PERMISSIVE for INSERT to authenticated with check (( SELECT public.has_permission('payments:write'::text) AS has_permission));
drop policy if exists "settings:write can delete app_settings" on public.app_settings;
create policy "settings:write can delete app_settings" on public.app_settings as PERMISSIVE for DELETE to authenticated using (( SELECT public.has_permission('settings:write'::text) AS has_permission));
drop policy if exists "settings:write can insert app_settings" on public.app_settings;
create policy "settings:write can insert app_settings" on public.app_settings as PERMISSIVE for INSERT to authenticated with check (( SELECT public.has_permission('settings:write'::text) AS has_permission));
drop policy if exists "settings:write can update app_settings" on public.app_settings;
create policy "settings:write can update app_settings" on public.app_settings as PERMISSIVE for UPDATE to authenticated using (( SELECT public.has_permission('settings:write'::text) AS has_permission)) with check (( SELECT public.has_permission('settings:write'::text) AS has_permission));
drop policy if exists "staff can grant late fee waivers" on public.student_late_fee_waivers;
create policy "staff can grant late fee waivers" on public.student_late_fee_waivers as PERMISSIVE for INSERT to authenticated with check (( SELECT public.has_permission('payments:waive_late_fee'::text) AS has_permission));
drop policy if exists "staff can insert import batches" on public.import_batches;
create policy "staff can insert import batches" on public.import_batches as PERMISSIVE for INSERT to authenticated with check (( SELECT public.has_permission('students:write'::text) AS has_permission));
drop policy if exists "staff can insert import rows" on public.import_rows;
create policy "staff can insert import rows" on public.import_rows as PERMISSIVE for INSERT to authenticated with check (( SELECT public.has_permission('students:write'::text) AS has_permission));
drop policy if exists "staff can insert office sync events" on public.office_sync_events;
create policy "staff can insert office sync events" on public.office_sync_events as PERMISSIVE for INSERT to authenticated with check ((( SELECT public.has_permission('students:write'::text) AS has_permission) OR ( SELECT public.has_permission('fees:write'::text) AS has_permission) OR ( SELECT public.has_permission('payments:write'::text) AS has_permission)));
drop policy if exists "staff can insert share links" on public.student_share_links;
create policy "staff can insert share links" on public.student_share_links as PERMISSIVE for INSERT to authenticated with check (( SELECT public.has_permission('students:write'::text) AS has_permission));
drop policy if exists "staff can insert student session reanchor log" on public.student_session_reanchor_log;
create policy "staff can insert student session reanchor log" on public.student_session_reanchor_log as PERMISSIVE for INSERT to authenticated with check (( SELECT public.has_permission('fees:write'::text) AS has_permission));
drop policy if exists "staff can read collection flags" on public.student_collection_flags;
create policy "staff can read collection flags" on public.student_collection_flags as PERMISSIVE for SELECT to authenticated using (( SELECT public.has_permission('defaulters:view'::text) AS has_permission));
drop policy if exists "staff can read emi late fees" on public.student_repayment_emi_late_fees;
create policy "staff can read emi late fees" on public.student_repayment_emi_late_fees as PERMISSIVE for SELECT to authenticated using (( SELECT public.has_any_permission(ARRAY['fees:view'::text, 'payments:view'::text, 'defaulters:view'::text, 'dashboard:view'::text]) AS has_any_permission));
drop policy if exists "staff can read import batches" on public.import_batches;
create policy "staff can read import batches" on public.import_batches as PERMISSIVE for SELECT to authenticated using ((( SELECT public.has_permission('imports:view'::text) AS has_permission) OR ( SELECT public.has_permission('students:write'::text) AS has_permission)));
drop policy if exists "staff can read import rows" on public.import_rows;
create policy "staff can read import rows" on public.import_rows as PERMISSIVE for SELECT to authenticated using ((( SELECT public.has_permission('imports:view'::text) AS has_permission) OR ( SELECT public.has_permission('students:write'::text) AS has_permission)));
drop policy if exists "staff can read late fee waivers" on public.student_late_fee_waivers;
create policy "staff can read late fee waivers" on public.student_late_fee_waivers as PERMISSIVE for SELECT to authenticated using (( SELECT public.has_any_permission(ARRAY['fees:view'::text, 'payments:view'::text]) AS has_any_permission));
drop policy if exists "staff can read office sync events" on public.office_sync_events;
create policy "staff can read office sync events" on public.office_sync_events as PERMISSIVE for SELECT to authenticated using (( SELECT public.has_any_permission(ARRAY['dashboard:view'::text, 'students:view'::text, 'fees:view'::text, 'payments:view'::text, 'reports:view'::text, 'defaulters:view'::text]) AS has_any_permission));
drop policy if exists "staff can read recovery state" on public.defaulter_recovery_state;
create policy "staff can read recovery state" on public.defaulter_recovery_state as PERMISSIVE for SELECT to authenticated using (( SELECT public.has_permission('defaulters:view'::text) AS has_permission));
drop policy if exists "staff can read repayment plan items" on public.student_repayment_plan_items;
create policy "staff can read repayment plan items" on public.student_repayment_plan_items as PERMISSIVE for SELECT to authenticated using (( SELECT public.has_any_permission(ARRAY['fees:view'::text, 'payments:view'::text, 'defaulters:view'::text, 'dashboard:view'::text]) AS has_any_permission));
drop policy if exists "staff can read repayment plans" on public.student_repayment_plans;
create policy "staff can read repayment plans" on public.student_repayment_plans as PERMISSIVE for SELECT to authenticated using (( SELECT public.has_any_permission(ARRAY['fees:view'::text, 'payments:view'::text, 'defaulters:view'::text, 'dashboard:view'::text]) AS has_any_permission));
drop policy if exists "staff can read repayment receipt links" on public.student_repayment_receipt_links;
create policy "staff can read repayment receipt links" on public.student_repayment_receipt_links as PERMISSIVE for SELECT to authenticated using (( SELECT public.has_any_permission(ARRAY['fees:view'::text, 'payments:view'::text, 'ledger:view'::text, 'receipts:view'::text, 'finance:view'::text, 'dashboard:view'::text]) AS has_any_permission));
drop policy if exists "staff can read repayment schedule" on public.student_repayment_schedule;
create policy "staff can read repayment schedule" on public.student_repayment_schedule as PERMISSIVE for SELECT to authenticated using (( SELECT public.has_any_permission(ARRAY['fees:view'::text, 'payments:view'::text, 'defaulters:view'::text, 'dashboard:view'::text]) AS has_any_permission));
drop policy if exists "staff can read setup progress" on public.setup_progress;
create policy "staff can read setup progress" on public.setup_progress as PERMISSIVE for SELECT to authenticated using (( SELECT public.has_permission('dashboard:view'::text) AS has_permission));
drop policy if exists "staff can read share links" on public.student_share_links;
create policy "staff can read share links" on public.student_share_links as PERMISSIVE for SELECT to authenticated using (( SELECT public.has_permission('students:view'::text) AS has_permission));
drop policy if exists "staff can read student session reanchor log" on public.student_session_reanchor_log;
create policy "staff can read student session reanchor log" on public.student_session_reanchor_log as PERMISSIVE for SELECT to authenticated using (( SELECT public.has_any_permission(ARRAY['students:view'::text, 'fees:view'::text, 'finance:view'::text]) AS has_any_permission));
drop policy if exists "staff can update import batches" on public.import_batches;
create policy "staff can update import batches" on public.import_batches as PERMISSIVE for UPDATE to authenticated using (( SELECT public.has_permission('students:write'::text) AS has_permission)) with check (( SELECT public.has_permission('students:write'::text) AS has_permission));
drop policy if exists "staff can update import rows" on public.import_rows;
create policy "staff can update import rows" on public.import_rows as PERMISSIVE for UPDATE to authenticated using (( SELECT public.has_permission('students:write'::text) AS has_permission)) with check (( SELECT public.has_permission('students:write'::text) AS has_permission));
drop policy if exists "staff can update recovery state" on public.defaulter_recovery_state;
create policy "staff can update recovery state" on public.defaulter_recovery_state as PERMISSIVE for UPDATE to authenticated using (( SELECT public.has_permission('defaulters:view'::text) AS has_permission)) with check (( SELECT public.has_permission('defaulters:view'::text) AS has_permission));
drop policy if exists "staff can update share links" on public.student_share_links;
create policy "staff can update share links" on public.student_share_links as PERMISSIVE for UPDATE to authenticated using (( SELECT public.has_permission('students:write'::text) AS has_permission)) with check (( SELECT public.has_permission('students:write'::text) AS has_permission));
drop policy if exists "staff can upsert recovery state" on public.defaulter_recovery_state;
create policy "staff can upsert recovery state" on public.defaulter_recovery_state as PERMISSIVE for INSERT to authenticated with check (( SELECT public.has_permission('defaulters:view'::text) AS has_permission));
drop policy if exists "staff can void late fee waivers" on public.student_late_fee_waivers;
create policy "staff can void late fee waivers" on public.student_late_fee_waivers as PERMISSIVE for UPDATE to authenticated using (( SELECT public.has_permission('payments:adjust'::text) AS has_permission)) with check (( SELECT public.has_permission('payments:adjust'::text) AS has_permission));
drop policy if exists "user_activity_events: staff insert" on public.user_activity_events;
create policy "user_activity_events: staff insert" on public.user_activity_events as PERMISSIVE for INSERT to public with check ((( SELECT auth.role() AS role) = 'authenticated'::text));
drop policy if exists "user_activity_events: staff read" on public.user_activity_events;
create policy "user_activity_events: staff read" on public.user_activity_events as PERMISSIVE for SELECT to public using ((( SELECT auth.role() AS role) = 'authenticated'::text));
drop policy if exists "whatsapp_campaign_runs: staff read" on public.whatsapp_campaign_runs;
create policy "whatsapp_campaign_runs: staff read" on public.whatsapp_campaign_runs as PERMISSIVE for SELECT to public using ((( SELECT auth.role() AS role) = 'authenticated'::text));
drop policy if exists "whatsapp_campaigns: staff read" on public.whatsapp_campaigns;
create policy "whatsapp_campaigns: staff read" on public.whatsapp_campaigns as PERMISSIVE for SELECT to public using ((( SELECT auth.role() AS role) = 'authenticated'::text));
drop policy if exists "whatsapp_reminder_sends: staff read" on public.whatsapp_reminder_sends;
create policy "whatsapp_reminder_sends: staff read" on public.whatsapp_reminder_sends as PERMISSIVE for SELECT to public using ((( SELECT auth.role() AS role) = 'authenticated'::text));
drop policy if exists "whatsapp_templates: admin write delete" on public.whatsapp_templates;
create policy "whatsapp_templates: admin write delete" on public.whatsapp_templates as PERMISSIVE for DELETE to public using ((( SELECT auth.role() AS role) = 'authenticated'::text));
drop policy if exists "whatsapp_templates: admin write insert" on public.whatsapp_templates;
create policy "whatsapp_templates: admin write insert" on public.whatsapp_templates as PERMISSIVE for INSERT to public with check ((( SELECT auth.role() AS role) = 'authenticated'::text));
drop policy if exists "whatsapp_templates: admin write update" on public.whatsapp_templates;
create policy "whatsapp_templates: admin write update" on public.whatsapp_templates as PERMISSIVE for UPDATE to public using ((( SELECT auth.role() AS role) = 'authenticated'::text)) with check ((( SELECT auth.role() AS role) = 'authenticated'::text));
drop policy if exists "whatsapp_templates: staff read" on public.whatsapp_templates;
create policy "whatsapp_templates: staff read" on public.whatsapp_templates as PERMISSIVE for SELECT to public using ((( SELECT auth.role() AS role) = 'authenticated'::text));
drop policy if exists payment_import_batches_insert on public.payment_import_batches;
create policy payment_import_batches_insert on public.payment_import_batches as PERMISSIVE for INSERT to authenticated with check (( SELECT public.has_permission('payments:bulk'::text) AS has_permission));
drop policy if exists payment_import_batches_select on public.payment_import_batches;
create policy payment_import_batches_select on public.payment_import_batches as PERMISSIVE for SELECT to authenticated using (( SELECT public.has_permission('payments:bulk'::text) AS has_permission));
drop policy if exists payment_import_batches_update on public.payment_import_batches;
create policy payment_import_batches_update on public.payment_import_batches as PERMISSIVE for UPDATE to authenticated using (( SELECT public.has_permission('payments:bulk'::text) AS has_permission)) with check (( SELECT public.has_permission('payments:bulk'::text) AS has_permission));
drop policy if exists payment_import_rows_insert on public.payment_import_rows;
create policy payment_import_rows_insert on public.payment_import_rows as PERMISSIVE for INSERT to authenticated with check (( SELECT public.has_permission('payments:bulk'::text) AS has_permission));
drop policy if exists payment_import_rows_select on public.payment_import_rows;
create policy payment_import_rows_select on public.payment_import_rows as PERMISSIVE for SELECT to authenticated using (( SELECT public.has_permission('payments:bulk'::text) AS has_permission));
drop policy if exists payment_import_rows_update on public.payment_import_rows;
create policy payment_import_rows_update on public.payment_import_rows as PERMISSIVE for UPDATE to authenticated using (( SELECT public.has_permission('payments:bulk'::text) AS has_permission)) with check (( SELECT public.has_permission('payments:bulk'::text) AS has_permission));

-- ══ Grants ══════════════════════════════════════════════════════════════

grant usage on schema private to authenticated;
grant usage on schema private to service_role;
grant usage on schema public to anon;
grant usage on schema public to authenticated;
grant usage on schema public to service_role;

grant DELETE on public.academic_sessions to anon;
grant DELETE on public.academic_sessions to authenticated;
grant DELETE on public.academic_sessions to service_role;
grant DELETE on public.app_settings to anon;
grant DELETE on public.app_settings to authenticated;
grant DELETE on public.app_settings to service_role;
grant DELETE on public.audit_logs to anon;
grant DELETE on public.audit_logs to authenticated;
grant DELETE on public.audit_logs to service_role;
grant DELETE on public.classes to anon;
grant DELETE on public.classes to authenticated;
grant DELETE on public.classes to service_role;
grant DELETE on public.collection_closures to anon;
grant DELETE on public.collection_closures to authenticated;
grant DELETE on public.collection_closures to service_role;
grant DELETE on public.config_change_batches to anon;
grant DELETE on public.config_change_batches to authenticated;
grant DELETE on public.config_change_batches to service_role;
grant DELETE on public.config_change_blocked_installments to anon;
grant DELETE on public.config_change_blocked_installments to authenticated;
grant DELETE on public.config_change_blocked_installments to service_role;
grant DELETE on public.conventional_discount_policies to anon;
grant DELETE on public.conventional_discount_policies to authenticated;
grant DELETE on public.conventional_discount_policies to service_role;
grant DELETE on public.defaulter_contacts to anon;
grant DELETE on public.defaulter_contacts to authenticated;
grant DELETE on public.defaulter_contacts to service_role;
grant DELETE on public.defaulter_recovery_state to anon;
grant DELETE on public.defaulter_recovery_state to authenticated;
grant DELETE on public.defaulter_recovery_state to service_role;
grant DELETE on public.family_payments to anon;
grant DELETE on public.family_payments to authenticated;
grant DELETE on public.family_payments to service_role;
grant DELETE on public.fee_policy_configs to anon;
grant DELETE on public.fee_policy_configs to authenticated;
grant DELETE on public.fee_policy_configs to service_role;
grant DELETE on public.fee_settings to anon;
grant DELETE on public.fee_settings to authenticated;
grant DELETE on public.fee_settings to service_role;
grant DELETE on public.import_batches to anon;
grant DELETE on public.import_batches to authenticated;
grant DELETE on public.import_batches to service_role;
grant DELETE on public.import_rows to anon;
grant DELETE on public.import_rows to authenticated;
grant DELETE on public.import_rows to service_role;
grant DELETE on public.installments to anon;
grant DELETE on public.installments to authenticated;
grant DELETE on public.installments to service_role;
grant DELETE on public.late_fee_rule_change_snapshot to service_role;
grant DELETE on public.late_fee_waiver_pool_snapshot to service_role;
grant DELETE on public.ledger_regeneration_batches to anon;
grant DELETE on public.ledger_regeneration_batches to authenticated;
grant DELETE on public.ledger_regeneration_batches to service_role;
grant DELETE on public.ledger_regeneration_rows to anon;
grant DELETE on public.ledger_regeneration_rows to authenticated;
grant DELETE on public.ledger_regeneration_rows to service_role;
grant DELETE on public.notion_sync_log to service_role;
grant DELETE on public.office_sync_events to anon;
grant DELETE on public.office_sync_events to authenticated;
grant DELETE on public.office_sync_events to service_role;
grant DELETE on public.payment_adjustment_reviews to anon;
grant DELETE on public.payment_adjustment_reviews to authenticated;
grant DELETE on public.payment_adjustment_reviews to service_role;
grant DELETE on public.payment_adjustments to anon;
grant DELETE on public.payment_adjustments to authenticated;
grant DELETE on public.payment_adjustments to service_role;
grant DELETE on public.payment_import_batches to anon;
grant DELETE on public.payment_import_batches to authenticated;
grant DELETE on public.payment_import_batches to service_role;
grant DELETE on public.payment_import_rows to anon;
grant DELETE on public.payment_import_rows to authenticated;
grant DELETE on public.payment_import_rows to service_role;
grant DELETE on public.payments to anon;
grant DELETE on public.payments to authenticated;
grant DELETE on public.payments to service_role;
grant DELETE on public.prev_year_import_batches to anon;
grant DELETE on public.prev_year_import_batches to authenticated;
grant DELETE on public.prev_year_import_batches to service_role;
grant DELETE on public.prev_year_import_rows to anon;
grant DELETE on public.prev_year_import_rows to authenticated;
grant DELETE on public.prev_year_import_rows to service_role;
grant DELETE on public.promotion_run_entries to anon;
grant DELETE on public.promotion_run_entries to authenticated;
grant DELETE on public.promotion_run_entries to service_role;
grant DELETE on public.promotion_runs to anon;
grant DELETE on public.promotion_runs to authenticated;
grant DELETE on public.promotion_runs to service_role;
grant DELETE on public.receipt_adjustments to anon;
grant DELETE on public.receipt_adjustments to authenticated;
grant DELETE on public.receipt_adjustments to service_role;
grant DELETE on public.receipt_finance_adjustments to anon;
grant DELETE on public.receipt_finance_adjustments to authenticated;
grant DELETE on public.receipt_finance_adjustments to service_role;
grant DELETE on public.receipts to anon;
grant DELETE on public.receipts to authenticated;
grant DELETE on public.receipts to service_role;
grant DELETE on public.refund_requests to anon;
grant DELETE on public.refund_requests to authenticated;
grant DELETE on public.refund_requests to service_role;
grant DELETE on public.school_fee_defaults to anon;
grant DELETE on public.school_fee_defaults to authenticated;
grant DELETE on public.school_fee_defaults to service_role;
grant DELETE on public.session_reconcile_log to anon;
grant DELETE on public.session_reconcile_log to authenticated;
grant DELETE on public.session_reconcile_log to service_role;
grant DELETE on public.setup_progress to anon;
grant DELETE on public.setup_progress to authenticated;
grant DELETE on public.setup_progress to service_role;
grant DELETE on public.student_carry_forward_balances to anon;
grant DELETE on public.student_carry_forward_balances to authenticated;
grant DELETE on public.student_carry_forward_balances to service_role;
grant DELETE on public.student_collection_flags to anon;
grant DELETE on public.student_collection_flags to authenticated;
grant DELETE on public.student_collection_flags to service_role;
grant DELETE on public.student_conventional_discount_assignments to anon;
grant DELETE on public.student_conventional_discount_assignments to authenticated;
grant DELETE on public.student_conventional_discount_assignments to service_role;
grant DELETE on public.student_family_groups to anon;
grant DELETE on public.student_family_groups to authenticated;
grant DELETE on public.student_family_groups to service_role;
grant DELETE on public.student_family_members to anon;
grant DELETE on public.student_family_members to authenticated;
grant DELETE on public.student_family_members to service_role;
grant DELETE on public.student_fee_overrides to anon;
grant DELETE on public.student_fee_overrides to authenticated;
grant DELETE on public.student_fee_overrides to service_role;
grant DELETE on public.student_late_fee_waivers to authenticated;
grant DELETE on public.student_late_fee_waivers to service_role;
grant DELETE on public.student_repayment_emi_late_fees to anon;
grant DELETE on public.student_repayment_emi_late_fees to authenticated;
grant DELETE on public.student_repayment_emi_late_fees to service_role;
grant DELETE on public.student_repayment_plan_items to anon;
grant DELETE on public.student_repayment_plan_items to authenticated;
grant DELETE on public.student_repayment_plan_items to service_role;
grant DELETE on public.student_repayment_plans to anon;
grant DELETE on public.student_repayment_plans to authenticated;
grant DELETE on public.student_repayment_plans to service_role;
grant DELETE on public.student_repayment_receipt_links to anon;
grant DELETE on public.student_repayment_receipt_links to authenticated;
grant DELETE on public.student_repayment_receipt_links to service_role;
grant DELETE on public.student_repayment_schedule to anon;
grant DELETE on public.student_repayment_schedule to authenticated;
grant DELETE on public.student_repayment_schedule to service_role;
grant DELETE on public.student_session_reanchor_log to anon;
grant DELETE on public.student_session_reanchor_log to authenticated;
grant DELETE on public.student_session_reanchor_log to service_role;
grant DELETE on public.student_share_links to anon;
grant DELETE on public.student_share_links to authenticated;
grant DELETE on public.student_share_links to service_role;
grant DELETE on public.students to anon;
grant DELETE on public.students to authenticated;
grant DELETE on public.students to service_role;
grant DELETE on public.transport_routes to anon;
grant DELETE on public.transport_routes to authenticated;
grant DELETE on public.transport_routes to service_role;
grant DELETE on public.user_activity_events to anon;
grant DELETE on public.user_activity_events to authenticated;
grant DELETE on public.user_activity_events to service_role;
grant DELETE on public.users to anon;
grant DELETE on public.users to authenticated;
grant DELETE on public.users to service_role;
grant DELETE on public.v_effective_late_fee_waivers to anon;
grant DELETE on public.v_effective_late_fee_waivers to authenticated;
grant DELETE on public.v_effective_late_fee_waivers to service_role;
grant DELETE on public.v_installment_balances to anon;
grant DELETE on public.v_installment_balances to authenticated;
grant DELETE on public.v_installment_balances to service_role;
grant DELETE on public.v_ledger_policy_drift to authenticated;
grant DELETE on public.v_ledger_policy_drift to service_role;
grant DELETE on public.v_notion_daily_collection_summary to service_role;
grant DELETE on public.v_notion_daily_summary to service_role;
grant DELETE on public.v_notion_family_fee_summary to service_role;
grant DELETE on public.v_notion_student_fee_summary to service_role;
grant DELETE on public.v_notion_student_fee_sync to service_role;
grant DELETE on public.v_outstanding_summary to anon;
grant DELETE on public.v_outstanding_summary to authenticated;
grant DELETE on public.v_outstanding_summary to service_role;
grant DELETE on public.v_receipt_effective_allocation_totals to authenticated;
grant DELETE on public.v_receipt_effective_allocation_totals to service_role;
grant DELETE on public.v_receipt_reversal_totals to anon;
grant DELETE on public.v_receipt_reversal_totals to authenticated;
grant DELETE on public.v_receipt_reversal_totals to service_role;
grant DELETE on public.v_student_carry_forward_balances to authenticated;
grant DELETE on public.v_student_carry_forward_balances to service_role;
grant DELETE on public.v_student_conventional_discounts to authenticated;
grant DELETE on public.v_student_conventional_discounts to service_role;
grant DELETE on public.v_student_directory to authenticated;
grant DELETE on public.v_student_directory to service_role;
grant DELETE on public.v_student_installment_facets to authenticated;
grant DELETE on public.v_student_installment_facets to service_role;
grant DELETE on public.v_student_manual_late_fee_waivers to authenticated;
grant DELETE on public.v_student_manual_late_fee_waivers to service_role;
grant DELETE on public.v_student_repayment_plan_status to authenticated;
grant DELETE on public.v_student_repayment_plan_status to service_role;
grant DELETE on public.v_transport_route_outstanding to anon;
grant DELETE on public.v_transport_route_outstanding to authenticated;
grant DELETE on public.v_transport_route_outstanding to service_role;
grant DELETE on public.v_whatsapp_run_outcomes to anon;
grant DELETE on public.v_whatsapp_run_outcomes to authenticated;
grant DELETE on public.v_whatsapp_run_outcomes to service_role;
grant DELETE on public.whatsapp_campaign_runs to anon;
grant DELETE on public.whatsapp_campaign_runs to authenticated;
grant DELETE on public.whatsapp_campaign_runs to service_role;
grant DELETE on public.whatsapp_campaigns to anon;
grant DELETE on public.whatsapp_campaigns to authenticated;
grant DELETE on public.whatsapp_campaigns to service_role;
grant DELETE on public.whatsapp_reminder_sends to anon;
grant DELETE on public.whatsapp_reminder_sends to authenticated;
grant DELETE on public.whatsapp_reminder_sends to service_role;
grant DELETE on public.whatsapp_templates to anon;
grant DELETE on public.whatsapp_templates to authenticated;
grant DELETE on public.whatsapp_templates to service_role;
grant DELETE on public.workbook_materialized_view_refresh_queue to service_role;
grant INSERT on public.academic_sessions to anon;
grant INSERT on public.academic_sessions to authenticated;
grant INSERT on public.academic_sessions to service_role;
grant INSERT on public.app_settings to anon;
grant INSERT on public.app_settings to authenticated;
grant INSERT on public.app_settings to service_role;
grant INSERT on public.audit_logs to anon;
grant INSERT on public.audit_logs to authenticated;
grant INSERT on public.audit_logs to service_role;
grant INSERT on public.classes to anon;
grant INSERT on public.classes to authenticated;
grant INSERT on public.classes to service_role;
grant INSERT on public.collection_closures to anon;
grant INSERT on public.collection_closures to authenticated;
grant INSERT on public.collection_closures to service_role;
grant INSERT on public.config_change_batches to anon;
grant INSERT on public.config_change_batches to authenticated;
grant INSERT on public.config_change_batches to service_role;
grant INSERT on public.config_change_blocked_installments to anon;
grant INSERT on public.config_change_blocked_installments to authenticated;
grant INSERT on public.config_change_blocked_installments to service_role;
grant INSERT on public.conventional_discount_policies to anon;
grant INSERT on public.conventional_discount_policies to authenticated;
grant INSERT on public.conventional_discount_policies to service_role;
grant INSERT on public.defaulter_contacts to anon;
grant INSERT on public.defaulter_contacts to authenticated;
grant INSERT on public.defaulter_contacts to service_role;
grant INSERT on public.defaulter_recovery_state to anon;
grant INSERT on public.defaulter_recovery_state to authenticated;
grant INSERT on public.defaulter_recovery_state to service_role;
grant INSERT on public.family_payments to anon;
grant INSERT on public.family_payments to authenticated;
grant INSERT on public.family_payments to service_role;
grant INSERT on public.fee_policy_configs to anon;
grant INSERT on public.fee_policy_configs to authenticated;
grant INSERT on public.fee_policy_configs to service_role;
grant INSERT on public.fee_settings to anon;
grant INSERT on public.fee_settings to authenticated;
grant INSERT on public.fee_settings to service_role;
grant INSERT on public.import_batches to anon;
grant INSERT on public.import_batches to authenticated;
grant INSERT on public.import_batches to service_role;
grant INSERT on public.import_rows to anon;
grant INSERT on public.import_rows to authenticated;
grant INSERT on public.import_rows to service_role;
grant INSERT on public.installments to anon;
grant INSERT on public.installments to authenticated;
grant INSERT on public.installments to service_role;
grant INSERT on public.late_fee_rule_change_snapshot to service_role;
grant INSERT on public.late_fee_waiver_pool_snapshot to service_role;
grant INSERT on public.ledger_regeneration_batches to anon;
grant INSERT on public.ledger_regeneration_batches to authenticated;
grant INSERT on public.ledger_regeneration_batches to service_role;
grant INSERT on public.ledger_regeneration_rows to anon;
grant INSERT on public.ledger_regeneration_rows to authenticated;
grant INSERT on public.ledger_regeneration_rows to service_role;
grant INSERT on public.notion_sync_log to service_role;
grant INSERT on public.office_sync_events to anon;
grant INSERT on public.office_sync_events to authenticated;
grant INSERT on public.office_sync_events to service_role;
grant INSERT on public.payment_adjustment_reviews to anon;
grant INSERT on public.payment_adjustment_reviews to authenticated;
grant INSERT on public.payment_adjustment_reviews to service_role;
grant INSERT on public.payment_adjustments to anon;
grant INSERT on public.payment_adjustments to authenticated;
grant INSERT on public.payment_adjustments to service_role;
grant INSERT on public.payment_import_batches to anon;
grant INSERT on public.payment_import_batches to authenticated;
grant INSERT on public.payment_import_batches to service_role;
grant INSERT on public.payment_import_rows to anon;
grant INSERT on public.payment_import_rows to authenticated;
grant INSERT on public.payment_import_rows to service_role;
grant INSERT on public.payments to anon;
grant INSERT on public.payments to authenticated;
grant INSERT on public.payments to service_role;
grant INSERT on public.prev_year_import_batches to anon;
grant INSERT on public.prev_year_import_batches to authenticated;
grant INSERT on public.prev_year_import_batches to service_role;
grant INSERT on public.prev_year_import_rows to anon;
grant INSERT on public.prev_year_import_rows to authenticated;
grant INSERT on public.prev_year_import_rows to service_role;
grant INSERT on public.promotion_run_entries to anon;
grant INSERT on public.promotion_run_entries to authenticated;
grant INSERT on public.promotion_run_entries to service_role;
grant INSERT on public.promotion_runs to anon;
grant INSERT on public.promotion_runs to authenticated;
grant INSERT on public.promotion_runs to service_role;
grant INSERT on public.receipt_adjustments to anon;
grant INSERT on public.receipt_adjustments to authenticated;
grant INSERT on public.receipt_adjustments to service_role;
grant INSERT on public.receipt_finance_adjustments to anon;
grant INSERT on public.receipt_finance_adjustments to authenticated;
grant INSERT on public.receipt_finance_adjustments to service_role;
grant INSERT on public.receipts to anon;
grant INSERT on public.receipts to authenticated;
grant INSERT on public.receipts to service_role;
grant INSERT on public.refund_requests to anon;
grant INSERT on public.refund_requests to authenticated;
grant INSERT on public.refund_requests to service_role;
grant INSERT on public.school_fee_defaults to anon;
grant INSERT on public.school_fee_defaults to authenticated;
grant INSERT on public.school_fee_defaults to service_role;
grant INSERT on public.session_reconcile_log to anon;
grant INSERT on public.session_reconcile_log to authenticated;
grant INSERT on public.session_reconcile_log to service_role;
grant INSERT on public.setup_progress to anon;
grant INSERT on public.setup_progress to authenticated;
grant INSERT on public.setup_progress to service_role;
grant INSERT on public.student_carry_forward_balances to anon;
grant INSERT on public.student_carry_forward_balances to authenticated;
grant INSERT on public.student_carry_forward_balances to service_role;
grant INSERT on public.student_collection_flags to anon;
grant INSERT on public.student_collection_flags to authenticated;
grant INSERT on public.student_collection_flags to service_role;
grant INSERT on public.student_conventional_discount_assignments to anon;
grant INSERT on public.student_conventional_discount_assignments to authenticated;
grant INSERT on public.student_conventional_discount_assignments to service_role;
grant INSERT on public.student_family_groups to anon;
grant INSERT on public.student_family_groups to authenticated;
grant INSERT on public.student_family_groups to service_role;
grant INSERT on public.student_family_members to anon;
grant INSERT on public.student_family_members to authenticated;
grant INSERT on public.student_family_members to service_role;
grant INSERT on public.student_fee_overrides to anon;
grant INSERT on public.student_fee_overrides to authenticated;
grant INSERT on public.student_fee_overrides to service_role;
grant INSERT on public.student_late_fee_waivers to authenticated;
grant INSERT on public.student_late_fee_waivers to service_role;
grant INSERT on public.student_repayment_emi_late_fees to anon;
grant INSERT on public.student_repayment_emi_late_fees to authenticated;
grant INSERT on public.student_repayment_emi_late_fees to service_role;
grant INSERT on public.student_repayment_plan_items to anon;
grant INSERT on public.student_repayment_plan_items to authenticated;
grant INSERT on public.student_repayment_plan_items to service_role;
grant INSERT on public.student_repayment_plans to anon;
grant INSERT on public.student_repayment_plans to authenticated;
grant INSERT on public.student_repayment_plans to service_role;
grant INSERT on public.student_repayment_receipt_links to anon;
grant INSERT on public.student_repayment_receipt_links to authenticated;
grant INSERT on public.student_repayment_receipt_links to service_role;
grant INSERT on public.student_repayment_schedule to anon;
grant INSERT on public.student_repayment_schedule to authenticated;
grant INSERT on public.student_repayment_schedule to service_role;
grant INSERT on public.student_session_reanchor_log to anon;
grant INSERT on public.student_session_reanchor_log to authenticated;
grant INSERT on public.student_session_reanchor_log to service_role;
grant INSERT on public.student_share_links to anon;
grant INSERT on public.student_share_links to authenticated;
grant INSERT on public.student_share_links to service_role;
grant INSERT on public.students to anon;
grant INSERT on public.students to authenticated;
grant INSERT on public.students to service_role;
grant INSERT on public.transport_routes to anon;
grant INSERT on public.transport_routes to authenticated;
grant INSERT on public.transport_routes to service_role;
grant INSERT on public.user_activity_events to anon;
grant INSERT on public.user_activity_events to authenticated;
grant INSERT on public.user_activity_events to service_role;
grant INSERT on public.users to anon;
grant INSERT on public.users to authenticated;
grant INSERT on public.users to service_role;
grant INSERT on public.v_effective_late_fee_waivers to anon;
grant INSERT on public.v_effective_late_fee_waivers to authenticated;
grant INSERT on public.v_effective_late_fee_waivers to service_role;
grant INSERT on public.v_installment_balances to anon;
grant INSERT on public.v_installment_balances to authenticated;
grant INSERT on public.v_installment_balances to service_role;
grant INSERT on public.v_ledger_policy_drift to authenticated;
grant INSERT on public.v_ledger_policy_drift to service_role;
grant INSERT on public.v_notion_daily_collection_summary to service_role;
grant INSERT on public.v_notion_daily_summary to service_role;
grant INSERT on public.v_notion_family_fee_summary to service_role;
grant INSERT on public.v_notion_student_fee_summary to service_role;
grant INSERT on public.v_notion_student_fee_sync to service_role;
grant INSERT on public.v_outstanding_summary to anon;
grant INSERT on public.v_outstanding_summary to authenticated;
grant INSERT on public.v_outstanding_summary to service_role;
grant INSERT on public.v_receipt_effective_allocation_totals to authenticated;
grant INSERT on public.v_receipt_effective_allocation_totals to service_role;
grant INSERT on public.v_receipt_reversal_totals to anon;
grant INSERT on public.v_receipt_reversal_totals to authenticated;
grant INSERT on public.v_receipt_reversal_totals to service_role;
grant INSERT on public.v_student_carry_forward_balances to authenticated;
grant INSERT on public.v_student_carry_forward_balances to service_role;
grant INSERT on public.v_student_conventional_discounts to authenticated;
grant INSERT on public.v_student_conventional_discounts to service_role;
grant INSERT on public.v_student_directory to authenticated;
grant INSERT on public.v_student_directory to service_role;
grant INSERT on public.v_student_installment_facets to authenticated;
grant INSERT on public.v_student_installment_facets to service_role;
grant INSERT on public.v_student_manual_late_fee_waivers to authenticated;
grant INSERT on public.v_student_manual_late_fee_waivers to service_role;
grant INSERT on public.v_student_repayment_plan_status to authenticated;
grant INSERT on public.v_student_repayment_plan_status to service_role;
grant INSERT on public.v_transport_route_outstanding to anon;
grant INSERT on public.v_transport_route_outstanding to authenticated;
grant INSERT on public.v_transport_route_outstanding to service_role;
grant INSERT on public.v_whatsapp_run_outcomes to anon;
grant INSERT on public.v_whatsapp_run_outcomes to authenticated;
grant INSERT on public.v_whatsapp_run_outcomes to service_role;
grant INSERT on public.whatsapp_campaign_runs to anon;
grant INSERT on public.whatsapp_campaign_runs to authenticated;
grant INSERT on public.whatsapp_campaign_runs to service_role;
grant INSERT on public.whatsapp_campaigns to anon;
grant INSERT on public.whatsapp_campaigns to authenticated;
grant INSERT on public.whatsapp_campaigns to service_role;
grant INSERT on public.whatsapp_reminder_sends to anon;
grant INSERT on public.whatsapp_reminder_sends to authenticated;
grant INSERT on public.whatsapp_reminder_sends to service_role;
grant INSERT on public.whatsapp_templates to anon;
grant INSERT on public.whatsapp_templates to authenticated;
grant INSERT on public.whatsapp_templates to service_role;
grant INSERT on public.workbook_materialized_view_refresh_queue to service_role;
grant REFERENCES on public.academic_sessions to anon;
grant REFERENCES on public.academic_sessions to authenticated;
grant REFERENCES on public.academic_sessions to service_role;
grant REFERENCES on public.app_settings to anon;
grant REFERENCES on public.app_settings to authenticated;
grant REFERENCES on public.app_settings to service_role;
grant REFERENCES on public.audit_logs to anon;
grant REFERENCES on public.audit_logs to authenticated;
grant REFERENCES on public.audit_logs to service_role;
grant REFERENCES on public.classes to anon;
grant REFERENCES on public.classes to authenticated;
grant REFERENCES on public.classes to service_role;
grant REFERENCES on public.collection_closures to anon;
grant REFERENCES on public.collection_closures to authenticated;
grant REFERENCES on public.collection_closures to service_role;
grant REFERENCES on public.config_change_batches to anon;
grant REFERENCES on public.config_change_batches to authenticated;
grant REFERENCES on public.config_change_batches to service_role;
grant REFERENCES on public.config_change_blocked_installments to anon;
grant REFERENCES on public.config_change_blocked_installments to authenticated;
grant REFERENCES on public.config_change_blocked_installments to service_role;
grant REFERENCES on public.conventional_discount_policies to anon;
grant REFERENCES on public.conventional_discount_policies to authenticated;
grant REFERENCES on public.conventional_discount_policies to service_role;
grant REFERENCES on public.defaulter_contacts to anon;
grant REFERENCES on public.defaulter_contacts to authenticated;
grant REFERENCES on public.defaulter_contacts to service_role;
grant REFERENCES on public.defaulter_recovery_state to anon;
grant REFERENCES on public.defaulter_recovery_state to authenticated;
grant REFERENCES on public.defaulter_recovery_state to service_role;
grant REFERENCES on public.family_payments to anon;
grant REFERENCES on public.family_payments to authenticated;
grant REFERENCES on public.family_payments to service_role;
grant REFERENCES on public.fee_policy_configs to anon;
grant REFERENCES on public.fee_policy_configs to authenticated;
grant REFERENCES on public.fee_policy_configs to service_role;
grant REFERENCES on public.fee_settings to anon;
grant REFERENCES on public.fee_settings to authenticated;
grant REFERENCES on public.fee_settings to service_role;
grant REFERENCES on public.import_batches to anon;
grant REFERENCES on public.import_batches to authenticated;
grant REFERENCES on public.import_batches to service_role;
grant REFERENCES on public.import_rows to anon;
grant REFERENCES on public.import_rows to authenticated;
grant REFERENCES on public.import_rows to service_role;
grant REFERENCES on public.installments to anon;
grant REFERENCES on public.installments to authenticated;
grant REFERENCES on public.installments to service_role;
grant REFERENCES on public.late_fee_rule_change_snapshot to service_role;
grant REFERENCES on public.late_fee_waiver_pool_snapshot to service_role;
grant REFERENCES on public.ledger_regeneration_batches to anon;
grant REFERENCES on public.ledger_regeneration_batches to authenticated;
grant REFERENCES on public.ledger_regeneration_batches to service_role;
grant REFERENCES on public.ledger_regeneration_rows to anon;
grant REFERENCES on public.ledger_regeneration_rows to authenticated;
grant REFERENCES on public.ledger_regeneration_rows to service_role;
grant REFERENCES on public.notion_sync_log to service_role;
grant REFERENCES on public.office_sync_events to anon;
grant REFERENCES on public.office_sync_events to authenticated;
grant REFERENCES on public.office_sync_events to service_role;
grant REFERENCES on public.payment_adjustment_reviews to anon;
grant REFERENCES on public.payment_adjustment_reviews to authenticated;
grant REFERENCES on public.payment_adjustment_reviews to service_role;
grant REFERENCES on public.payment_adjustments to anon;
grant REFERENCES on public.payment_adjustments to authenticated;
grant REFERENCES on public.payment_adjustments to service_role;
grant REFERENCES on public.payment_import_batches to anon;
grant REFERENCES on public.payment_import_batches to authenticated;
grant REFERENCES on public.payment_import_batches to service_role;
grant REFERENCES on public.payment_import_rows to anon;
grant REFERENCES on public.payment_import_rows to authenticated;
grant REFERENCES on public.payment_import_rows to service_role;
grant REFERENCES on public.payments to anon;
grant REFERENCES on public.payments to authenticated;
grant REFERENCES on public.payments to service_role;
grant REFERENCES on public.prev_year_import_batches to anon;
grant REFERENCES on public.prev_year_import_batches to authenticated;
grant REFERENCES on public.prev_year_import_batches to service_role;
grant REFERENCES on public.prev_year_import_rows to anon;
grant REFERENCES on public.prev_year_import_rows to authenticated;
grant REFERENCES on public.prev_year_import_rows to service_role;
grant REFERENCES on public.promotion_run_entries to anon;
grant REFERENCES on public.promotion_run_entries to authenticated;
grant REFERENCES on public.promotion_run_entries to service_role;
grant REFERENCES on public.promotion_runs to anon;
grant REFERENCES on public.promotion_runs to authenticated;
grant REFERENCES on public.promotion_runs to service_role;
grant REFERENCES on public.receipt_adjustments to anon;
grant REFERENCES on public.receipt_adjustments to authenticated;
grant REFERENCES on public.receipt_adjustments to service_role;
grant REFERENCES on public.receipt_finance_adjustments to anon;
grant REFERENCES on public.receipt_finance_adjustments to authenticated;
grant REFERENCES on public.receipt_finance_adjustments to service_role;
grant REFERENCES on public.receipts to anon;
grant REFERENCES on public.receipts to authenticated;
grant REFERENCES on public.receipts to service_role;
grant REFERENCES on public.refund_requests to anon;
grant REFERENCES on public.refund_requests to authenticated;
grant REFERENCES on public.refund_requests to service_role;
grant REFERENCES on public.school_fee_defaults to anon;
grant REFERENCES on public.school_fee_defaults to authenticated;
grant REFERENCES on public.school_fee_defaults to service_role;
grant REFERENCES on public.session_reconcile_log to anon;
grant REFERENCES on public.session_reconcile_log to authenticated;
grant REFERENCES on public.session_reconcile_log to service_role;
grant REFERENCES on public.setup_progress to anon;
grant REFERENCES on public.setup_progress to authenticated;
grant REFERENCES on public.setup_progress to service_role;
grant REFERENCES on public.student_carry_forward_balances to anon;
grant REFERENCES on public.student_carry_forward_balances to authenticated;
grant REFERENCES on public.student_carry_forward_balances to service_role;
grant REFERENCES on public.student_collection_flags to anon;
grant REFERENCES on public.student_collection_flags to authenticated;
grant REFERENCES on public.student_collection_flags to service_role;
grant REFERENCES on public.student_conventional_discount_assignments to anon;
grant REFERENCES on public.student_conventional_discount_assignments to authenticated;
grant REFERENCES on public.student_conventional_discount_assignments to service_role;
grant REFERENCES on public.student_family_groups to anon;
grant REFERENCES on public.student_family_groups to authenticated;
grant REFERENCES on public.student_family_groups to service_role;
grant REFERENCES on public.student_family_members to anon;
grant REFERENCES on public.student_family_members to authenticated;
grant REFERENCES on public.student_family_members to service_role;
grant REFERENCES on public.student_fee_overrides to anon;
grant REFERENCES on public.student_fee_overrides to authenticated;
grant REFERENCES on public.student_fee_overrides to service_role;
grant REFERENCES on public.student_late_fee_waivers to authenticated;
grant REFERENCES on public.student_late_fee_waivers to service_role;
grant REFERENCES on public.student_repayment_emi_late_fees to anon;
grant REFERENCES on public.student_repayment_emi_late_fees to authenticated;
grant REFERENCES on public.student_repayment_emi_late_fees to service_role;
grant REFERENCES on public.student_repayment_plan_items to anon;
grant REFERENCES on public.student_repayment_plan_items to authenticated;
grant REFERENCES on public.student_repayment_plan_items to service_role;
grant REFERENCES on public.student_repayment_plans to anon;
grant REFERENCES on public.student_repayment_plans to authenticated;
grant REFERENCES on public.student_repayment_plans to service_role;
grant REFERENCES on public.student_repayment_receipt_links to anon;
grant REFERENCES on public.student_repayment_receipt_links to authenticated;
grant REFERENCES on public.student_repayment_receipt_links to service_role;
grant REFERENCES on public.student_repayment_schedule to anon;
grant REFERENCES on public.student_repayment_schedule to authenticated;
grant REFERENCES on public.student_repayment_schedule to service_role;
grant REFERENCES on public.student_session_reanchor_log to anon;
grant REFERENCES on public.student_session_reanchor_log to authenticated;
grant REFERENCES on public.student_session_reanchor_log to service_role;
grant REFERENCES on public.student_share_links to anon;
grant REFERENCES on public.student_share_links to authenticated;
grant REFERENCES on public.student_share_links to service_role;
grant REFERENCES on public.students to anon;
grant REFERENCES on public.students to authenticated;
grant REFERENCES on public.students to service_role;
grant REFERENCES on public.transport_routes to anon;
grant REFERENCES on public.transport_routes to authenticated;
grant REFERENCES on public.transport_routes to service_role;
grant REFERENCES on public.user_activity_events to anon;
grant REFERENCES on public.user_activity_events to authenticated;
grant REFERENCES on public.user_activity_events to service_role;
grant REFERENCES on public.users to anon;
grant REFERENCES on public.users to authenticated;
grant REFERENCES on public.users to service_role;
grant REFERENCES on public.v_effective_late_fee_waivers to anon;
grant REFERENCES on public.v_effective_late_fee_waivers to authenticated;
grant REFERENCES on public.v_effective_late_fee_waivers to service_role;
grant REFERENCES on public.v_installment_balances to anon;
grant REFERENCES on public.v_installment_balances to authenticated;
grant REFERENCES on public.v_installment_balances to service_role;
grant REFERENCES on public.v_ledger_policy_drift to authenticated;
grant REFERENCES on public.v_ledger_policy_drift to service_role;
grant REFERENCES on public.v_notion_daily_collection_summary to service_role;
grant REFERENCES on public.v_notion_daily_summary to service_role;
grant REFERENCES on public.v_notion_family_fee_summary to service_role;
grant REFERENCES on public.v_notion_student_fee_summary to service_role;
grant REFERENCES on public.v_notion_student_fee_sync to service_role;
grant REFERENCES on public.v_outstanding_summary to anon;
grant REFERENCES on public.v_outstanding_summary to authenticated;
grant REFERENCES on public.v_outstanding_summary to service_role;
grant REFERENCES on public.v_receipt_effective_allocation_totals to authenticated;
grant REFERENCES on public.v_receipt_effective_allocation_totals to service_role;
grant REFERENCES on public.v_receipt_reversal_totals to anon;
grant REFERENCES on public.v_receipt_reversal_totals to authenticated;
grant REFERENCES on public.v_receipt_reversal_totals to service_role;
grant REFERENCES on public.v_student_carry_forward_balances to authenticated;
grant REFERENCES on public.v_student_carry_forward_balances to service_role;
grant REFERENCES on public.v_student_conventional_discounts to authenticated;
grant REFERENCES on public.v_student_conventional_discounts to service_role;
grant REFERENCES on public.v_student_directory to authenticated;
grant REFERENCES on public.v_student_directory to service_role;
grant REFERENCES on public.v_student_installment_facets to authenticated;
grant REFERENCES on public.v_student_installment_facets to service_role;
grant REFERENCES on public.v_student_manual_late_fee_waivers to authenticated;
grant REFERENCES on public.v_student_manual_late_fee_waivers to service_role;
grant REFERENCES on public.v_student_repayment_plan_status to authenticated;
grant REFERENCES on public.v_student_repayment_plan_status to service_role;
grant REFERENCES on public.v_transport_route_outstanding to anon;
grant REFERENCES on public.v_transport_route_outstanding to authenticated;
grant REFERENCES on public.v_transport_route_outstanding to service_role;
grant REFERENCES on public.v_whatsapp_run_outcomes to anon;
grant REFERENCES on public.v_whatsapp_run_outcomes to authenticated;
grant REFERENCES on public.v_whatsapp_run_outcomes to service_role;
grant REFERENCES on public.whatsapp_campaign_runs to anon;
grant REFERENCES on public.whatsapp_campaign_runs to authenticated;
grant REFERENCES on public.whatsapp_campaign_runs to service_role;
grant REFERENCES on public.whatsapp_campaigns to anon;
grant REFERENCES on public.whatsapp_campaigns to authenticated;
grant REFERENCES on public.whatsapp_campaigns to service_role;
grant REFERENCES on public.whatsapp_reminder_sends to anon;
grant REFERENCES on public.whatsapp_reminder_sends to authenticated;
grant REFERENCES on public.whatsapp_reminder_sends to service_role;
grant REFERENCES on public.whatsapp_templates to anon;
grant REFERENCES on public.whatsapp_templates to authenticated;
grant REFERENCES on public.whatsapp_templates to service_role;
grant REFERENCES on public.workbook_materialized_view_refresh_queue to service_role;
grant SELECT on public.academic_sessions to anon;
grant SELECT on public.academic_sessions to authenticated;
grant SELECT on public.academic_sessions to service_role;
grant SELECT on public.app_settings to anon;
grant SELECT on public.app_settings to authenticated;
grant SELECT on public.app_settings to service_role;
grant SELECT on public.audit_logs to anon;
grant SELECT on public.audit_logs to authenticated;
grant SELECT on public.audit_logs to service_role;
grant SELECT on public.classes to anon;
grant SELECT on public.classes to authenticated;
grant SELECT on public.classes to service_role;
grant SELECT on public.collection_closures to anon;
grant SELECT on public.collection_closures to authenticated;
grant SELECT on public.collection_closures to service_role;
grant SELECT on public.config_change_batches to anon;
grant SELECT on public.config_change_batches to authenticated;
grant SELECT on public.config_change_batches to service_role;
grant SELECT on public.config_change_blocked_installments to anon;
grant SELECT on public.config_change_blocked_installments to authenticated;
grant SELECT on public.config_change_blocked_installments to service_role;
grant SELECT on public.conventional_discount_policies to anon;
grant SELECT on public.conventional_discount_policies to authenticated;
grant SELECT on public.conventional_discount_policies to service_role;
grant SELECT on public.defaulter_contacts to anon;
grant SELECT on public.defaulter_contacts to authenticated;
grant SELECT on public.defaulter_contacts to service_role;
grant SELECT on public.defaulter_recovery_state to anon;
grant SELECT on public.defaulter_recovery_state to authenticated;
grant SELECT on public.defaulter_recovery_state to service_role;
grant SELECT on public.family_payments to anon;
grant SELECT on public.family_payments to authenticated;
grant SELECT on public.family_payments to service_role;
grant SELECT on public.fee_policy_configs to anon;
grant SELECT on public.fee_policy_configs to authenticated;
grant SELECT on public.fee_policy_configs to service_role;
grant SELECT on public.fee_settings to anon;
grant SELECT on public.fee_settings to authenticated;
grant SELECT on public.fee_settings to service_role;
grant SELECT on public.import_batches to anon;
grant SELECT on public.import_batches to authenticated;
grant SELECT on public.import_batches to service_role;
grant SELECT on public.import_rows to anon;
grant SELECT on public.import_rows to authenticated;
grant SELECT on public.import_rows to service_role;
grant SELECT on public.installments to anon;
grant SELECT on public.installments to authenticated;
grant SELECT on public.installments to service_role;
grant SELECT on public.late_fee_rule_change_snapshot to service_role;
grant SELECT on public.late_fee_waiver_pool_snapshot to service_role;
grant SELECT on public.ledger_regeneration_batches to anon;
grant SELECT on public.ledger_regeneration_batches to authenticated;
grant SELECT on public.ledger_regeneration_batches to service_role;
grant SELECT on public.ledger_regeneration_rows to anon;
grant SELECT on public.ledger_regeneration_rows to authenticated;
grant SELECT on public.ledger_regeneration_rows to service_role;
grant SELECT on public.notion_sync_log to service_role;
grant SELECT on public.office_sync_events to anon;
grant SELECT on public.office_sync_events to authenticated;
grant SELECT on public.office_sync_events to service_role;
grant SELECT on public.payment_adjustment_reviews to anon;
grant SELECT on public.payment_adjustment_reviews to authenticated;
grant SELECT on public.payment_adjustment_reviews to service_role;
grant SELECT on public.payment_adjustments to anon;
grant SELECT on public.payment_adjustments to authenticated;
grant SELECT on public.payment_adjustments to service_role;
grant SELECT on public.payment_import_batches to anon;
grant SELECT on public.payment_import_batches to authenticated;
grant SELECT on public.payment_import_batches to service_role;
grant SELECT on public.payment_import_rows to anon;
grant SELECT on public.payment_import_rows to authenticated;
grant SELECT on public.payment_import_rows to service_role;
grant SELECT on public.payments to anon;
grant SELECT on public.payments to authenticated;
grant SELECT on public.payments to service_role;
grant SELECT on public.prev_year_import_batches to anon;
grant SELECT on public.prev_year_import_batches to authenticated;
grant SELECT on public.prev_year_import_batches to service_role;
grant SELECT on public.prev_year_import_rows to anon;
grant SELECT on public.prev_year_import_rows to authenticated;
grant SELECT on public.prev_year_import_rows to service_role;
grant SELECT on public.promotion_run_entries to anon;
grant SELECT on public.promotion_run_entries to authenticated;
grant SELECT on public.promotion_run_entries to service_role;
grant SELECT on public.promotion_runs to anon;
grant SELECT on public.promotion_runs to authenticated;
grant SELECT on public.promotion_runs to service_role;
grant SELECT on public.receipt_adjustments to anon;
grant SELECT on public.receipt_adjustments to authenticated;
grant SELECT on public.receipt_adjustments to service_role;
grant SELECT on public.receipt_finance_adjustments to anon;
grant SELECT on public.receipt_finance_adjustments to authenticated;
grant SELECT on public.receipt_finance_adjustments to service_role;
grant SELECT on public.receipts to anon;
grant SELECT on public.receipts to authenticated;
grant SELECT on public.receipts to service_role;
grant SELECT on public.refund_requests to anon;
grant SELECT on public.refund_requests to authenticated;
grant SELECT on public.refund_requests to service_role;
grant SELECT on public.school_fee_defaults to anon;
grant SELECT on public.school_fee_defaults to authenticated;
grant SELECT on public.school_fee_defaults to service_role;
grant SELECT on public.session_reconcile_log to anon;
grant SELECT on public.session_reconcile_log to authenticated;
grant SELECT on public.session_reconcile_log to service_role;
grant SELECT on public.setup_progress to anon;
grant SELECT on public.setup_progress to authenticated;
grant SELECT on public.setup_progress to service_role;
grant SELECT on public.student_carry_forward_balances to anon;
grant SELECT on public.student_carry_forward_balances to authenticated;
grant SELECT on public.student_carry_forward_balances to service_role;
grant SELECT on public.student_collection_flags to anon;
grant SELECT on public.student_collection_flags to authenticated;
grant SELECT on public.student_collection_flags to service_role;
grant SELECT on public.student_conventional_discount_assignments to anon;
grant SELECT on public.student_conventional_discount_assignments to authenticated;
grant SELECT on public.student_conventional_discount_assignments to service_role;
grant SELECT on public.student_family_groups to anon;
grant SELECT on public.student_family_groups to authenticated;
grant SELECT on public.student_family_groups to service_role;
grant SELECT on public.student_family_members to anon;
grant SELECT on public.student_family_members to authenticated;
grant SELECT on public.student_family_members to service_role;
grant SELECT on public.student_fee_overrides to anon;
grant SELECT on public.student_fee_overrides to authenticated;
grant SELECT on public.student_fee_overrides to service_role;
grant SELECT on public.student_late_fee_waivers to authenticated;
grant SELECT on public.student_late_fee_waivers to service_role;
grant SELECT on public.student_repayment_emi_late_fees to anon;
grant SELECT on public.student_repayment_emi_late_fees to authenticated;
grant SELECT on public.student_repayment_emi_late_fees to service_role;
grant SELECT on public.student_repayment_plan_items to anon;
grant SELECT on public.student_repayment_plan_items to authenticated;
grant SELECT on public.student_repayment_plan_items to service_role;
grant SELECT on public.student_repayment_plans to anon;
grant SELECT on public.student_repayment_plans to authenticated;
grant SELECT on public.student_repayment_plans to service_role;
grant SELECT on public.student_repayment_receipt_links to anon;
grant SELECT on public.student_repayment_receipt_links to authenticated;
grant SELECT on public.student_repayment_receipt_links to service_role;
grant SELECT on public.student_repayment_schedule to anon;
grant SELECT on public.student_repayment_schedule to authenticated;
grant SELECT on public.student_repayment_schedule to service_role;
grant SELECT on public.student_session_reanchor_log to anon;
grant SELECT on public.student_session_reanchor_log to authenticated;
grant SELECT on public.student_session_reanchor_log to service_role;
grant SELECT on public.student_share_links to anon;
grant SELECT on public.student_share_links to authenticated;
grant SELECT on public.student_share_links to service_role;
grant SELECT on public.students to anon;
grant SELECT on public.students to authenticated;
grant SELECT on public.students to service_role;
grant SELECT on public.transport_routes to anon;
grant SELECT on public.transport_routes to authenticated;
grant SELECT on public.transport_routes to service_role;
grant SELECT on public.user_activity_events to anon;
grant SELECT on public.user_activity_events to authenticated;
grant SELECT on public.user_activity_events to service_role;
grant SELECT on public.users to anon;
grant SELECT on public.users to authenticated;
grant SELECT on public.users to service_role;
grant SELECT on public.v_effective_late_fee_waivers to anon;
grant SELECT on public.v_effective_late_fee_waivers to authenticated;
grant SELECT on public.v_effective_late_fee_waivers to service_role;
grant SELECT on public.v_installment_balances to anon;
grant SELECT on public.v_installment_balances to authenticated;
grant SELECT on public.v_installment_balances to service_role;
grant SELECT on public.v_ledger_policy_drift to authenticated;
grant SELECT on public.v_ledger_policy_drift to service_role;
grant SELECT on public.v_notion_daily_collection_summary to service_role;
grant SELECT on public.v_notion_daily_summary to service_role;
grant SELECT on public.v_notion_family_fee_summary to service_role;
grant SELECT on public.v_notion_student_fee_summary to service_role;
grant SELECT on public.v_notion_student_fee_sync to service_role;
grant SELECT on public.v_outstanding_summary to anon;
grant SELECT on public.v_outstanding_summary to authenticated;
grant SELECT on public.v_outstanding_summary to service_role;
grant SELECT on public.v_receipt_effective_allocation_totals to authenticated;
grant SELECT on public.v_receipt_effective_allocation_totals to service_role;
grant SELECT on public.v_receipt_reversal_totals to anon;
grant SELECT on public.v_receipt_reversal_totals to authenticated;
grant SELECT on public.v_receipt_reversal_totals to service_role;
grant SELECT on public.v_student_carry_forward_balances to authenticated;
grant SELECT on public.v_student_carry_forward_balances to service_role;
grant SELECT on public.v_student_conventional_discounts to authenticated;
grant SELECT on public.v_student_conventional_discounts to service_role;
grant SELECT on public.v_student_directory to authenticated;
grant SELECT on public.v_student_directory to service_role;
grant SELECT on public.v_student_installment_facets to authenticated;
grant SELECT on public.v_student_installment_facets to service_role;
grant SELECT on public.v_student_manual_late_fee_waivers to authenticated;
grant SELECT on public.v_student_manual_late_fee_waivers to service_role;
grant SELECT on public.v_student_repayment_plan_status to authenticated;
grant SELECT on public.v_student_repayment_plan_status to service_role;
grant SELECT on public.v_transport_route_outstanding to anon;
grant SELECT on public.v_transport_route_outstanding to authenticated;
grant SELECT on public.v_transport_route_outstanding to service_role;
grant SELECT on public.v_whatsapp_run_outcomes to anon;
grant SELECT on public.v_whatsapp_run_outcomes to authenticated;
grant SELECT on public.v_whatsapp_run_outcomes to service_role;
grant SELECT on public.whatsapp_campaign_runs to anon;
grant SELECT on public.whatsapp_campaign_runs to authenticated;
grant SELECT on public.whatsapp_campaign_runs to service_role;
grant SELECT on public.whatsapp_campaigns to anon;
grant SELECT on public.whatsapp_campaigns to authenticated;
grant SELECT on public.whatsapp_campaigns to service_role;
grant SELECT on public.whatsapp_reminder_sends to anon;
grant SELECT on public.whatsapp_reminder_sends to authenticated;
grant SELECT on public.whatsapp_reminder_sends to service_role;
grant SELECT on public.whatsapp_templates to anon;
grant SELECT on public.whatsapp_templates to authenticated;
grant SELECT on public.whatsapp_templates to service_role;
grant SELECT on public.workbook_materialized_view_refresh_queue to service_role;
grant TRIGGER on public.academic_sessions to anon;
grant TRIGGER on public.academic_sessions to authenticated;
grant TRIGGER on public.academic_sessions to service_role;
grant TRIGGER on public.app_settings to anon;
grant TRIGGER on public.app_settings to authenticated;
grant TRIGGER on public.app_settings to service_role;
grant TRIGGER on public.audit_logs to anon;
grant TRIGGER on public.audit_logs to authenticated;
grant TRIGGER on public.audit_logs to service_role;
grant TRIGGER on public.classes to anon;
grant TRIGGER on public.classes to authenticated;
grant TRIGGER on public.classes to service_role;
grant TRIGGER on public.collection_closures to anon;
grant TRIGGER on public.collection_closures to authenticated;
grant TRIGGER on public.collection_closures to service_role;
grant TRIGGER on public.config_change_batches to anon;
grant TRIGGER on public.config_change_batches to authenticated;
grant TRIGGER on public.config_change_batches to service_role;
grant TRIGGER on public.config_change_blocked_installments to anon;
grant TRIGGER on public.config_change_blocked_installments to authenticated;
grant TRIGGER on public.config_change_blocked_installments to service_role;
grant TRIGGER on public.conventional_discount_policies to anon;
grant TRIGGER on public.conventional_discount_policies to authenticated;
grant TRIGGER on public.conventional_discount_policies to service_role;
grant TRIGGER on public.defaulter_contacts to anon;
grant TRIGGER on public.defaulter_contacts to authenticated;
grant TRIGGER on public.defaulter_contacts to service_role;
grant TRIGGER on public.defaulter_recovery_state to anon;
grant TRIGGER on public.defaulter_recovery_state to authenticated;
grant TRIGGER on public.defaulter_recovery_state to service_role;
grant TRIGGER on public.family_payments to anon;
grant TRIGGER on public.family_payments to authenticated;
grant TRIGGER on public.family_payments to service_role;
grant TRIGGER on public.fee_policy_configs to anon;
grant TRIGGER on public.fee_policy_configs to authenticated;
grant TRIGGER on public.fee_policy_configs to service_role;
grant TRIGGER on public.fee_settings to anon;
grant TRIGGER on public.fee_settings to authenticated;
grant TRIGGER on public.fee_settings to service_role;
grant TRIGGER on public.import_batches to anon;
grant TRIGGER on public.import_batches to authenticated;
grant TRIGGER on public.import_batches to service_role;
grant TRIGGER on public.import_rows to anon;
grant TRIGGER on public.import_rows to authenticated;
grant TRIGGER on public.import_rows to service_role;
grant TRIGGER on public.installments to anon;
grant TRIGGER on public.installments to authenticated;
grant TRIGGER on public.installments to service_role;
grant TRIGGER on public.late_fee_rule_change_snapshot to service_role;
grant TRIGGER on public.late_fee_waiver_pool_snapshot to service_role;
grant TRIGGER on public.ledger_regeneration_batches to anon;
grant TRIGGER on public.ledger_regeneration_batches to authenticated;
grant TRIGGER on public.ledger_regeneration_batches to service_role;
grant TRIGGER on public.ledger_regeneration_rows to anon;
grant TRIGGER on public.ledger_regeneration_rows to authenticated;
grant TRIGGER on public.ledger_regeneration_rows to service_role;
grant TRIGGER on public.notion_sync_log to service_role;
grant TRIGGER on public.office_sync_events to anon;
grant TRIGGER on public.office_sync_events to authenticated;
grant TRIGGER on public.office_sync_events to service_role;
grant TRIGGER on public.payment_adjustment_reviews to anon;
grant TRIGGER on public.payment_adjustment_reviews to authenticated;
grant TRIGGER on public.payment_adjustment_reviews to service_role;
grant TRIGGER on public.payment_adjustments to anon;
grant TRIGGER on public.payment_adjustments to authenticated;
grant TRIGGER on public.payment_adjustments to service_role;
grant TRIGGER on public.payment_import_batches to anon;
grant TRIGGER on public.payment_import_batches to authenticated;
grant TRIGGER on public.payment_import_batches to service_role;
grant TRIGGER on public.payment_import_rows to anon;
grant TRIGGER on public.payment_import_rows to authenticated;
grant TRIGGER on public.payment_import_rows to service_role;
grant TRIGGER on public.payments to anon;
grant TRIGGER on public.payments to authenticated;
grant TRIGGER on public.payments to service_role;
grant TRIGGER on public.prev_year_import_batches to anon;
grant TRIGGER on public.prev_year_import_batches to authenticated;
grant TRIGGER on public.prev_year_import_batches to service_role;
grant TRIGGER on public.prev_year_import_rows to anon;
grant TRIGGER on public.prev_year_import_rows to authenticated;
grant TRIGGER on public.prev_year_import_rows to service_role;
grant TRIGGER on public.promotion_run_entries to anon;
grant TRIGGER on public.promotion_run_entries to authenticated;
grant TRIGGER on public.promotion_run_entries to service_role;
grant TRIGGER on public.promotion_runs to anon;
grant TRIGGER on public.promotion_runs to authenticated;
grant TRIGGER on public.promotion_runs to service_role;
grant TRIGGER on public.receipt_adjustments to anon;
grant TRIGGER on public.receipt_adjustments to authenticated;
grant TRIGGER on public.receipt_adjustments to service_role;
grant TRIGGER on public.receipt_finance_adjustments to anon;
grant TRIGGER on public.receipt_finance_adjustments to authenticated;
grant TRIGGER on public.receipt_finance_adjustments to service_role;
grant TRIGGER on public.receipts to anon;
grant TRIGGER on public.receipts to authenticated;
grant TRIGGER on public.receipts to service_role;
grant TRIGGER on public.refund_requests to anon;
grant TRIGGER on public.refund_requests to authenticated;
grant TRIGGER on public.refund_requests to service_role;
grant TRIGGER on public.school_fee_defaults to anon;
grant TRIGGER on public.school_fee_defaults to authenticated;
grant TRIGGER on public.school_fee_defaults to service_role;
grant TRIGGER on public.session_reconcile_log to anon;
grant TRIGGER on public.session_reconcile_log to authenticated;
grant TRIGGER on public.session_reconcile_log to service_role;
grant TRIGGER on public.setup_progress to anon;
grant TRIGGER on public.setup_progress to authenticated;
grant TRIGGER on public.setup_progress to service_role;
grant TRIGGER on public.student_carry_forward_balances to anon;
grant TRIGGER on public.student_carry_forward_balances to authenticated;
grant TRIGGER on public.student_carry_forward_balances to service_role;
grant TRIGGER on public.student_collection_flags to anon;
grant TRIGGER on public.student_collection_flags to authenticated;
grant TRIGGER on public.student_collection_flags to service_role;
grant TRIGGER on public.student_conventional_discount_assignments to anon;
grant TRIGGER on public.student_conventional_discount_assignments to authenticated;
grant TRIGGER on public.student_conventional_discount_assignments to service_role;
grant TRIGGER on public.student_family_groups to anon;
grant TRIGGER on public.student_family_groups to authenticated;
grant TRIGGER on public.student_family_groups to service_role;
grant TRIGGER on public.student_family_members to anon;
grant TRIGGER on public.student_family_members to authenticated;
grant TRIGGER on public.student_family_members to service_role;
grant TRIGGER on public.student_fee_overrides to anon;
grant TRIGGER on public.student_fee_overrides to authenticated;
grant TRIGGER on public.student_fee_overrides to service_role;
grant TRIGGER on public.student_late_fee_waivers to authenticated;
grant TRIGGER on public.student_late_fee_waivers to service_role;
grant TRIGGER on public.student_repayment_emi_late_fees to anon;
grant TRIGGER on public.student_repayment_emi_late_fees to authenticated;
grant TRIGGER on public.student_repayment_emi_late_fees to service_role;
grant TRIGGER on public.student_repayment_plan_items to anon;
grant TRIGGER on public.student_repayment_plan_items to authenticated;
grant TRIGGER on public.student_repayment_plan_items to service_role;
grant TRIGGER on public.student_repayment_plans to anon;
grant TRIGGER on public.student_repayment_plans to authenticated;
grant TRIGGER on public.student_repayment_plans to service_role;
grant TRIGGER on public.student_repayment_receipt_links to anon;
grant TRIGGER on public.student_repayment_receipt_links to authenticated;
grant TRIGGER on public.student_repayment_receipt_links to service_role;
grant TRIGGER on public.student_repayment_schedule to anon;
grant TRIGGER on public.student_repayment_schedule to authenticated;
grant TRIGGER on public.student_repayment_schedule to service_role;
grant TRIGGER on public.student_session_reanchor_log to anon;
grant TRIGGER on public.student_session_reanchor_log to authenticated;
grant TRIGGER on public.student_session_reanchor_log to service_role;
grant TRIGGER on public.student_share_links to anon;
grant TRIGGER on public.student_share_links to authenticated;
grant TRIGGER on public.student_share_links to service_role;
grant TRIGGER on public.students to anon;
grant TRIGGER on public.students to authenticated;
grant TRIGGER on public.students to service_role;
grant TRIGGER on public.transport_routes to anon;
grant TRIGGER on public.transport_routes to authenticated;
grant TRIGGER on public.transport_routes to service_role;
grant TRIGGER on public.user_activity_events to anon;
grant TRIGGER on public.user_activity_events to authenticated;
grant TRIGGER on public.user_activity_events to service_role;
grant TRIGGER on public.users to anon;
grant TRIGGER on public.users to authenticated;
grant TRIGGER on public.users to service_role;
grant TRIGGER on public.v_effective_late_fee_waivers to anon;
grant TRIGGER on public.v_effective_late_fee_waivers to authenticated;
grant TRIGGER on public.v_effective_late_fee_waivers to service_role;
grant TRIGGER on public.v_installment_balances to anon;
grant TRIGGER on public.v_installment_balances to authenticated;
grant TRIGGER on public.v_installment_balances to service_role;
grant TRIGGER on public.v_ledger_policy_drift to authenticated;
grant TRIGGER on public.v_ledger_policy_drift to service_role;
grant TRIGGER on public.v_notion_daily_collection_summary to service_role;
grant TRIGGER on public.v_notion_daily_summary to service_role;
grant TRIGGER on public.v_notion_family_fee_summary to service_role;
grant TRIGGER on public.v_notion_student_fee_summary to service_role;
grant TRIGGER on public.v_notion_student_fee_sync to service_role;
grant TRIGGER on public.v_outstanding_summary to anon;
grant TRIGGER on public.v_outstanding_summary to authenticated;
grant TRIGGER on public.v_outstanding_summary to service_role;
grant TRIGGER on public.v_receipt_effective_allocation_totals to authenticated;
grant TRIGGER on public.v_receipt_effective_allocation_totals to service_role;
grant TRIGGER on public.v_receipt_reversal_totals to anon;
grant TRIGGER on public.v_receipt_reversal_totals to authenticated;
grant TRIGGER on public.v_receipt_reversal_totals to service_role;
grant TRIGGER on public.v_student_carry_forward_balances to authenticated;
grant TRIGGER on public.v_student_carry_forward_balances to service_role;
grant TRIGGER on public.v_student_conventional_discounts to authenticated;
grant TRIGGER on public.v_student_conventional_discounts to service_role;
grant TRIGGER on public.v_student_directory to authenticated;
grant TRIGGER on public.v_student_directory to service_role;
grant TRIGGER on public.v_student_installment_facets to authenticated;
grant TRIGGER on public.v_student_installment_facets to service_role;
grant TRIGGER on public.v_student_manual_late_fee_waivers to authenticated;
grant TRIGGER on public.v_student_manual_late_fee_waivers to service_role;
grant TRIGGER on public.v_student_repayment_plan_status to authenticated;
grant TRIGGER on public.v_student_repayment_plan_status to service_role;
grant TRIGGER on public.v_transport_route_outstanding to anon;
grant TRIGGER on public.v_transport_route_outstanding to authenticated;
grant TRIGGER on public.v_transport_route_outstanding to service_role;
grant TRIGGER on public.v_whatsapp_run_outcomes to anon;
grant TRIGGER on public.v_whatsapp_run_outcomes to authenticated;
grant TRIGGER on public.v_whatsapp_run_outcomes to service_role;
grant TRIGGER on public.whatsapp_campaign_runs to anon;
grant TRIGGER on public.whatsapp_campaign_runs to authenticated;
grant TRIGGER on public.whatsapp_campaign_runs to service_role;
grant TRIGGER on public.whatsapp_campaigns to anon;
grant TRIGGER on public.whatsapp_campaigns to authenticated;
grant TRIGGER on public.whatsapp_campaigns to service_role;
grant TRIGGER on public.whatsapp_reminder_sends to anon;
grant TRIGGER on public.whatsapp_reminder_sends to authenticated;
grant TRIGGER on public.whatsapp_reminder_sends to service_role;
grant TRIGGER on public.whatsapp_templates to anon;
grant TRIGGER on public.whatsapp_templates to authenticated;
grant TRIGGER on public.whatsapp_templates to service_role;
grant TRIGGER on public.workbook_materialized_view_refresh_queue to service_role;
grant TRUNCATE on public.academic_sessions to anon;
grant TRUNCATE on public.academic_sessions to authenticated;
grant TRUNCATE on public.academic_sessions to service_role;
grant TRUNCATE on public.app_settings to anon;
grant TRUNCATE on public.app_settings to authenticated;
grant TRUNCATE on public.app_settings to service_role;
grant TRUNCATE on public.audit_logs to anon;
grant TRUNCATE on public.audit_logs to authenticated;
grant TRUNCATE on public.audit_logs to service_role;
grant TRUNCATE on public.classes to anon;
grant TRUNCATE on public.classes to authenticated;
grant TRUNCATE on public.classes to service_role;
grant TRUNCATE on public.collection_closures to anon;
grant TRUNCATE on public.collection_closures to authenticated;
grant TRUNCATE on public.collection_closures to service_role;
grant TRUNCATE on public.config_change_batches to anon;
grant TRUNCATE on public.config_change_batches to authenticated;
grant TRUNCATE on public.config_change_batches to service_role;
grant TRUNCATE on public.config_change_blocked_installments to anon;
grant TRUNCATE on public.config_change_blocked_installments to authenticated;
grant TRUNCATE on public.config_change_blocked_installments to service_role;
grant TRUNCATE on public.conventional_discount_policies to anon;
grant TRUNCATE on public.conventional_discount_policies to authenticated;
grant TRUNCATE on public.conventional_discount_policies to service_role;
grant TRUNCATE on public.defaulter_contacts to anon;
grant TRUNCATE on public.defaulter_contacts to authenticated;
grant TRUNCATE on public.defaulter_contacts to service_role;
grant TRUNCATE on public.defaulter_recovery_state to anon;
grant TRUNCATE on public.defaulter_recovery_state to authenticated;
grant TRUNCATE on public.defaulter_recovery_state to service_role;
grant TRUNCATE on public.family_payments to anon;
grant TRUNCATE on public.family_payments to authenticated;
grant TRUNCATE on public.family_payments to service_role;
grant TRUNCATE on public.fee_policy_configs to anon;
grant TRUNCATE on public.fee_policy_configs to authenticated;
grant TRUNCATE on public.fee_policy_configs to service_role;
grant TRUNCATE on public.fee_settings to anon;
grant TRUNCATE on public.fee_settings to authenticated;
grant TRUNCATE on public.fee_settings to service_role;
grant TRUNCATE on public.import_batches to anon;
grant TRUNCATE on public.import_batches to authenticated;
grant TRUNCATE on public.import_batches to service_role;
grant TRUNCATE on public.import_rows to anon;
grant TRUNCATE on public.import_rows to authenticated;
grant TRUNCATE on public.import_rows to service_role;
grant TRUNCATE on public.installments to anon;
grant TRUNCATE on public.installments to authenticated;
grant TRUNCATE on public.installments to service_role;
grant TRUNCATE on public.late_fee_rule_change_snapshot to service_role;
grant TRUNCATE on public.late_fee_waiver_pool_snapshot to service_role;
grant TRUNCATE on public.ledger_regeneration_batches to anon;
grant TRUNCATE on public.ledger_regeneration_batches to authenticated;
grant TRUNCATE on public.ledger_regeneration_batches to service_role;
grant TRUNCATE on public.ledger_regeneration_rows to anon;
grant TRUNCATE on public.ledger_regeneration_rows to authenticated;
grant TRUNCATE on public.ledger_regeneration_rows to service_role;
grant TRUNCATE on public.notion_sync_log to service_role;
grant TRUNCATE on public.office_sync_events to anon;
grant TRUNCATE on public.office_sync_events to authenticated;
grant TRUNCATE on public.office_sync_events to service_role;
grant TRUNCATE on public.payment_adjustment_reviews to anon;
grant TRUNCATE on public.payment_adjustment_reviews to authenticated;
grant TRUNCATE on public.payment_adjustment_reviews to service_role;
grant TRUNCATE on public.payment_adjustments to anon;
grant TRUNCATE on public.payment_adjustments to authenticated;
grant TRUNCATE on public.payment_adjustments to service_role;
grant TRUNCATE on public.payment_import_batches to anon;
grant TRUNCATE on public.payment_import_batches to authenticated;
grant TRUNCATE on public.payment_import_batches to service_role;
grant TRUNCATE on public.payment_import_rows to anon;
grant TRUNCATE on public.payment_import_rows to authenticated;
grant TRUNCATE on public.payment_import_rows to service_role;
grant TRUNCATE on public.payments to anon;
grant TRUNCATE on public.payments to authenticated;
grant TRUNCATE on public.payments to service_role;
grant TRUNCATE on public.prev_year_import_batches to anon;
grant TRUNCATE on public.prev_year_import_batches to authenticated;
grant TRUNCATE on public.prev_year_import_batches to service_role;
grant TRUNCATE on public.prev_year_import_rows to anon;
grant TRUNCATE on public.prev_year_import_rows to authenticated;
grant TRUNCATE on public.prev_year_import_rows to service_role;
grant TRUNCATE on public.promotion_run_entries to anon;
grant TRUNCATE on public.promotion_run_entries to authenticated;
grant TRUNCATE on public.promotion_run_entries to service_role;
grant TRUNCATE on public.promotion_runs to anon;
grant TRUNCATE on public.promotion_runs to authenticated;
grant TRUNCATE on public.promotion_runs to service_role;
grant TRUNCATE on public.receipt_adjustments to anon;
grant TRUNCATE on public.receipt_adjustments to authenticated;
grant TRUNCATE on public.receipt_adjustments to service_role;
grant TRUNCATE on public.receipt_finance_adjustments to anon;
grant TRUNCATE on public.receipt_finance_adjustments to authenticated;
grant TRUNCATE on public.receipt_finance_adjustments to service_role;
grant TRUNCATE on public.receipts to anon;
grant TRUNCATE on public.receipts to authenticated;
grant TRUNCATE on public.receipts to service_role;
grant TRUNCATE on public.refund_requests to anon;
grant TRUNCATE on public.refund_requests to authenticated;
grant TRUNCATE on public.refund_requests to service_role;
grant TRUNCATE on public.school_fee_defaults to anon;
grant TRUNCATE on public.school_fee_defaults to authenticated;
grant TRUNCATE on public.school_fee_defaults to service_role;
grant TRUNCATE on public.session_reconcile_log to anon;
grant TRUNCATE on public.session_reconcile_log to authenticated;
grant TRUNCATE on public.session_reconcile_log to service_role;
grant TRUNCATE on public.setup_progress to anon;
grant TRUNCATE on public.setup_progress to authenticated;
grant TRUNCATE on public.setup_progress to service_role;
grant TRUNCATE on public.student_carry_forward_balances to anon;
grant TRUNCATE on public.student_carry_forward_balances to authenticated;
grant TRUNCATE on public.student_carry_forward_balances to service_role;
grant TRUNCATE on public.student_collection_flags to anon;
grant TRUNCATE on public.student_collection_flags to authenticated;
grant TRUNCATE on public.student_collection_flags to service_role;
grant TRUNCATE on public.student_conventional_discount_assignments to anon;
grant TRUNCATE on public.student_conventional_discount_assignments to authenticated;
grant TRUNCATE on public.student_conventional_discount_assignments to service_role;
grant TRUNCATE on public.student_family_groups to anon;
grant TRUNCATE on public.student_family_groups to authenticated;
grant TRUNCATE on public.student_family_groups to service_role;
grant TRUNCATE on public.student_family_members to anon;
grant TRUNCATE on public.student_family_members to authenticated;
grant TRUNCATE on public.student_family_members to service_role;
grant TRUNCATE on public.student_fee_overrides to anon;
grant TRUNCATE on public.student_fee_overrides to authenticated;
grant TRUNCATE on public.student_fee_overrides to service_role;
grant TRUNCATE on public.student_late_fee_waivers to authenticated;
grant TRUNCATE on public.student_late_fee_waivers to service_role;
grant TRUNCATE on public.student_repayment_emi_late_fees to anon;
grant TRUNCATE on public.student_repayment_emi_late_fees to authenticated;
grant TRUNCATE on public.student_repayment_emi_late_fees to service_role;
grant TRUNCATE on public.student_repayment_plan_items to anon;
grant TRUNCATE on public.student_repayment_plan_items to authenticated;
grant TRUNCATE on public.student_repayment_plan_items to service_role;
grant TRUNCATE on public.student_repayment_plans to anon;
grant TRUNCATE on public.student_repayment_plans to authenticated;
grant TRUNCATE on public.student_repayment_plans to service_role;
grant TRUNCATE on public.student_repayment_receipt_links to anon;
grant TRUNCATE on public.student_repayment_receipt_links to authenticated;
grant TRUNCATE on public.student_repayment_receipt_links to service_role;
grant TRUNCATE on public.student_repayment_schedule to anon;
grant TRUNCATE on public.student_repayment_schedule to authenticated;
grant TRUNCATE on public.student_repayment_schedule to service_role;
grant TRUNCATE on public.student_session_reanchor_log to anon;
grant TRUNCATE on public.student_session_reanchor_log to authenticated;
grant TRUNCATE on public.student_session_reanchor_log to service_role;
grant TRUNCATE on public.student_share_links to anon;
grant TRUNCATE on public.student_share_links to authenticated;
grant TRUNCATE on public.student_share_links to service_role;
grant TRUNCATE on public.students to anon;
grant TRUNCATE on public.students to authenticated;
grant TRUNCATE on public.students to service_role;
grant TRUNCATE on public.transport_routes to anon;
grant TRUNCATE on public.transport_routes to authenticated;
grant TRUNCATE on public.transport_routes to service_role;
grant TRUNCATE on public.user_activity_events to anon;
grant TRUNCATE on public.user_activity_events to authenticated;
grant TRUNCATE on public.user_activity_events to service_role;
grant TRUNCATE on public.users to anon;
grant TRUNCATE on public.users to authenticated;
grant TRUNCATE on public.users to service_role;
grant TRUNCATE on public.v_effective_late_fee_waivers to anon;
grant TRUNCATE on public.v_effective_late_fee_waivers to authenticated;
grant TRUNCATE on public.v_effective_late_fee_waivers to service_role;
grant TRUNCATE on public.v_installment_balances to anon;
grant TRUNCATE on public.v_installment_balances to authenticated;
grant TRUNCATE on public.v_installment_balances to service_role;
grant TRUNCATE on public.v_ledger_policy_drift to authenticated;
grant TRUNCATE on public.v_ledger_policy_drift to service_role;
grant TRUNCATE on public.v_notion_daily_collection_summary to service_role;
grant TRUNCATE on public.v_notion_daily_summary to service_role;
grant TRUNCATE on public.v_notion_family_fee_summary to service_role;
grant TRUNCATE on public.v_notion_student_fee_summary to service_role;
grant TRUNCATE on public.v_notion_student_fee_sync to service_role;
grant TRUNCATE on public.v_outstanding_summary to anon;
grant TRUNCATE on public.v_outstanding_summary to authenticated;
grant TRUNCATE on public.v_outstanding_summary to service_role;
grant TRUNCATE on public.v_receipt_effective_allocation_totals to authenticated;
grant TRUNCATE on public.v_receipt_effective_allocation_totals to service_role;
grant TRUNCATE on public.v_receipt_reversal_totals to anon;
grant TRUNCATE on public.v_receipt_reversal_totals to authenticated;
grant TRUNCATE on public.v_receipt_reversal_totals to service_role;
grant TRUNCATE on public.v_student_carry_forward_balances to authenticated;
grant TRUNCATE on public.v_student_carry_forward_balances to service_role;
grant TRUNCATE on public.v_student_conventional_discounts to authenticated;
grant TRUNCATE on public.v_student_conventional_discounts to service_role;
grant TRUNCATE on public.v_student_directory to authenticated;
grant TRUNCATE on public.v_student_directory to service_role;
grant TRUNCATE on public.v_student_installment_facets to authenticated;
grant TRUNCATE on public.v_student_installment_facets to service_role;
grant TRUNCATE on public.v_student_manual_late_fee_waivers to authenticated;
grant TRUNCATE on public.v_student_manual_late_fee_waivers to service_role;
grant TRUNCATE on public.v_student_repayment_plan_status to authenticated;
grant TRUNCATE on public.v_student_repayment_plan_status to service_role;
grant TRUNCATE on public.v_transport_route_outstanding to anon;
grant TRUNCATE on public.v_transport_route_outstanding to authenticated;
grant TRUNCATE on public.v_transport_route_outstanding to service_role;
grant TRUNCATE on public.v_whatsapp_run_outcomes to anon;
grant TRUNCATE on public.v_whatsapp_run_outcomes to authenticated;
grant TRUNCATE on public.v_whatsapp_run_outcomes to service_role;
grant TRUNCATE on public.whatsapp_campaign_runs to anon;
grant TRUNCATE on public.whatsapp_campaign_runs to authenticated;
grant TRUNCATE on public.whatsapp_campaign_runs to service_role;
grant TRUNCATE on public.whatsapp_campaigns to anon;
grant TRUNCATE on public.whatsapp_campaigns to authenticated;
grant TRUNCATE on public.whatsapp_campaigns to service_role;
grant TRUNCATE on public.whatsapp_reminder_sends to anon;
grant TRUNCATE on public.whatsapp_reminder_sends to authenticated;
grant TRUNCATE on public.whatsapp_reminder_sends to service_role;
grant TRUNCATE on public.whatsapp_templates to anon;
grant TRUNCATE on public.whatsapp_templates to authenticated;
grant TRUNCATE on public.whatsapp_templates to service_role;
grant TRUNCATE on public.workbook_materialized_view_refresh_queue to service_role;
grant UPDATE on public.academic_sessions to anon;
grant UPDATE on public.academic_sessions to authenticated;
grant UPDATE on public.academic_sessions to service_role;
grant UPDATE on public.app_settings to anon;
grant UPDATE on public.app_settings to authenticated;
grant UPDATE on public.app_settings to service_role;
grant UPDATE on public.audit_logs to anon;
grant UPDATE on public.audit_logs to authenticated;
grant UPDATE on public.audit_logs to service_role;
grant UPDATE on public.classes to anon;
grant UPDATE on public.classes to authenticated;
grant UPDATE on public.classes to service_role;
grant UPDATE on public.collection_closures to anon;
grant UPDATE on public.collection_closures to authenticated;
grant UPDATE on public.collection_closures to service_role;
grant UPDATE on public.config_change_batches to anon;
grant UPDATE on public.config_change_batches to authenticated;
grant UPDATE on public.config_change_batches to service_role;
grant UPDATE on public.config_change_blocked_installments to anon;
grant UPDATE on public.config_change_blocked_installments to authenticated;
grant UPDATE on public.config_change_blocked_installments to service_role;
grant UPDATE on public.conventional_discount_policies to anon;
grant UPDATE on public.conventional_discount_policies to authenticated;
grant UPDATE on public.conventional_discount_policies to service_role;
grant UPDATE on public.defaulter_contacts to anon;
grant UPDATE on public.defaulter_contacts to authenticated;
grant UPDATE on public.defaulter_contacts to service_role;
grant UPDATE on public.defaulter_recovery_state to anon;
grant UPDATE on public.defaulter_recovery_state to authenticated;
grant UPDATE on public.defaulter_recovery_state to service_role;
grant UPDATE on public.family_payments to anon;
grant UPDATE on public.family_payments to authenticated;
grant UPDATE on public.family_payments to service_role;
grant UPDATE on public.fee_policy_configs to anon;
grant UPDATE on public.fee_policy_configs to authenticated;
grant UPDATE on public.fee_policy_configs to service_role;
grant UPDATE on public.fee_settings to anon;
grant UPDATE on public.fee_settings to authenticated;
grant UPDATE on public.fee_settings to service_role;
grant UPDATE on public.import_batches to anon;
grant UPDATE on public.import_batches to authenticated;
grant UPDATE on public.import_batches to service_role;
grant UPDATE on public.import_rows to anon;
grant UPDATE on public.import_rows to authenticated;
grant UPDATE on public.import_rows to service_role;
grant UPDATE on public.installments to anon;
grant UPDATE on public.installments to authenticated;
grant UPDATE on public.installments to service_role;
grant UPDATE on public.late_fee_rule_change_snapshot to service_role;
grant UPDATE on public.late_fee_waiver_pool_snapshot to service_role;
grant UPDATE on public.ledger_regeneration_batches to anon;
grant UPDATE on public.ledger_regeneration_batches to authenticated;
grant UPDATE on public.ledger_regeneration_batches to service_role;
grant UPDATE on public.ledger_regeneration_rows to anon;
grant UPDATE on public.ledger_regeneration_rows to authenticated;
grant UPDATE on public.ledger_regeneration_rows to service_role;
grant UPDATE on public.notion_sync_log to service_role;
grant UPDATE on public.office_sync_events to anon;
grant UPDATE on public.office_sync_events to authenticated;
grant UPDATE on public.office_sync_events to service_role;
grant UPDATE on public.payment_adjustment_reviews to anon;
grant UPDATE on public.payment_adjustment_reviews to authenticated;
grant UPDATE on public.payment_adjustment_reviews to service_role;
grant UPDATE on public.payment_adjustments to anon;
grant UPDATE on public.payment_adjustments to authenticated;
grant UPDATE on public.payment_adjustments to service_role;
grant UPDATE on public.payment_import_batches to anon;
grant UPDATE on public.payment_import_batches to authenticated;
grant UPDATE on public.payment_import_batches to service_role;
grant UPDATE on public.payment_import_rows to anon;
grant UPDATE on public.payment_import_rows to authenticated;
grant UPDATE on public.payment_import_rows to service_role;
grant UPDATE on public.payments to anon;
grant UPDATE on public.payments to authenticated;
grant UPDATE on public.payments to service_role;
grant UPDATE on public.prev_year_import_batches to anon;
grant UPDATE on public.prev_year_import_batches to authenticated;
grant UPDATE on public.prev_year_import_batches to service_role;
grant UPDATE on public.prev_year_import_rows to anon;
grant UPDATE on public.prev_year_import_rows to authenticated;
grant UPDATE on public.prev_year_import_rows to service_role;
grant UPDATE on public.promotion_run_entries to anon;
grant UPDATE on public.promotion_run_entries to authenticated;
grant UPDATE on public.promotion_run_entries to service_role;
grant UPDATE on public.promotion_runs to anon;
grant UPDATE on public.promotion_runs to authenticated;
grant UPDATE on public.promotion_runs to service_role;
grant UPDATE on public.receipt_adjustments to anon;
grant UPDATE on public.receipt_adjustments to authenticated;
grant UPDATE on public.receipt_adjustments to service_role;
grant UPDATE on public.receipt_finance_adjustments to anon;
grant UPDATE on public.receipt_finance_adjustments to authenticated;
grant UPDATE on public.receipt_finance_adjustments to service_role;
grant UPDATE on public.receipts to anon;
grant UPDATE on public.receipts to authenticated;
grant UPDATE on public.receipts to service_role;
grant UPDATE on public.refund_requests to anon;
grant UPDATE on public.refund_requests to authenticated;
grant UPDATE on public.refund_requests to service_role;
grant UPDATE on public.school_fee_defaults to anon;
grant UPDATE on public.school_fee_defaults to authenticated;
grant UPDATE on public.school_fee_defaults to service_role;
grant UPDATE on public.session_reconcile_log to anon;
grant UPDATE on public.session_reconcile_log to authenticated;
grant UPDATE on public.session_reconcile_log to service_role;
grant UPDATE on public.setup_progress to anon;
grant UPDATE on public.setup_progress to authenticated;
grant UPDATE on public.setup_progress to service_role;
grant UPDATE on public.student_carry_forward_balances to anon;
grant UPDATE on public.student_carry_forward_balances to authenticated;
grant UPDATE on public.student_carry_forward_balances to service_role;
grant UPDATE on public.student_collection_flags to anon;
grant UPDATE on public.student_collection_flags to authenticated;
grant UPDATE on public.student_collection_flags to service_role;
grant UPDATE on public.student_conventional_discount_assignments to anon;
grant UPDATE on public.student_conventional_discount_assignments to authenticated;
grant UPDATE on public.student_conventional_discount_assignments to service_role;
grant UPDATE on public.student_family_groups to anon;
grant UPDATE on public.student_family_groups to authenticated;
grant UPDATE on public.student_family_groups to service_role;
grant UPDATE on public.student_family_members to anon;
grant UPDATE on public.student_family_members to authenticated;
grant UPDATE on public.student_family_members to service_role;
grant UPDATE on public.student_fee_overrides to anon;
grant UPDATE on public.student_fee_overrides to authenticated;
grant UPDATE on public.student_fee_overrides to service_role;
grant UPDATE on public.student_late_fee_waivers to authenticated;
grant UPDATE on public.student_late_fee_waivers to service_role;
grant UPDATE on public.student_repayment_emi_late_fees to anon;
grant UPDATE on public.student_repayment_emi_late_fees to authenticated;
grant UPDATE on public.student_repayment_emi_late_fees to service_role;
grant UPDATE on public.student_repayment_plan_items to anon;
grant UPDATE on public.student_repayment_plan_items to authenticated;
grant UPDATE on public.student_repayment_plan_items to service_role;
grant UPDATE on public.student_repayment_plans to anon;
grant UPDATE on public.student_repayment_plans to authenticated;
grant UPDATE on public.student_repayment_plans to service_role;
grant UPDATE on public.student_repayment_receipt_links to anon;
grant UPDATE on public.student_repayment_receipt_links to authenticated;
grant UPDATE on public.student_repayment_receipt_links to service_role;
grant UPDATE on public.student_repayment_schedule to anon;
grant UPDATE on public.student_repayment_schedule to authenticated;
grant UPDATE on public.student_repayment_schedule to service_role;
grant UPDATE on public.student_session_reanchor_log to anon;
grant UPDATE on public.student_session_reanchor_log to authenticated;
grant UPDATE on public.student_session_reanchor_log to service_role;
grant UPDATE on public.student_share_links to anon;
grant UPDATE on public.student_share_links to authenticated;
grant UPDATE on public.student_share_links to service_role;
grant UPDATE on public.students to anon;
grant UPDATE on public.students to authenticated;
grant UPDATE on public.students to service_role;
grant UPDATE on public.transport_routes to anon;
grant UPDATE on public.transport_routes to authenticated;
grant UPDATE on public.transport_routes to service_role;
grant UPDATE on public.user_activity_events to anon;
grant UPDATE on public.user_activity_events to authenticated;
grant UPDATE on public.user_activity_events to service_role;
grant UPDATE on public.users to anon;
grant UPDATE on public.users to authenticated;
grant UPDATE on public.users to service_role;
grant UPDATE on public.v_effective_late_fee_waivers to anon;
grant UPDATE on public.v_effective_late_fee_waivers to authenticated;
grant UPDATE on public.v_effective_late_fee_waivers to service_role;
grant UPDATE on public.v_installment_balances to anon;
grant UPDATE on public.v_installment_balances to authenticated;
grant UPDATE on public.v_installment_balances to service_role;
grant UPDATE on public.v_ledger_policy_drift to authenticated;
grant UPDATE on public.v_ledger_policy_drift to service_role;
grant UPDATE on public.v_notion_daily_collection_summary to service_role;
grant UPDATE on public.v_notion_daily_summary to service_role;
grant UPDATE on public.v_notion_family_fee_summary to service_role;
grant UPDATE on public.v_notion_student_fee_summary to service_role;
grant UPDATE on public.v_notion_student_fee_sync to service_role;
grant UPDATE on public.v_outstanding_summary to anon;
grant UPDATE on public.v_outstanding_summary to authenticated;
grant UPDATE on public.v_outstanding_summary to service_role;
grant UPDATE on public.v_receipt_effective_allocation_totals to authenticated;
grant UPDATE on public.v_receipt_effective_allocation_totals to service_role;
grant UPDATE on public.v_receipt_reversal_totals to anon;
grant UPDATE on public.v_receipt_reversal_totals to authenticated;
grant UPDATE on public.v_receipt_reversal_totals to service_role;
grant UPDATE on public.v_student_carry_forward_balances to authenticated;
grant UPDATE on public.v_student_carry_forward_balances to service_role;
grant UPDATE on public.v_student_conventional_discounts to authenticated;
grant UPDATE on public.v_student_conventional_discounts to service_role;
grant UPDATE on public.v_student_directory to authenticated;
grant UPDATE on public.v_student_directory to service_role;
grant UPDATE on public.v_student_installment_facets to authenticated;
grant UPDATE on public.v_student_installment_facets to service_role;
grant UPDATE on public.v_student_manual_late_fee_waivers to authenticated;
grant UPDATE on public.v_student_manual_late_fee_waivers to service_role;
grant UPDATE on public.v_student_repayment_plan_status to authenticated;
grant UPDATE on public.v_student_repayment_plan_status to service_role;
grant UPDATE on public.v_transport_route_outstanding to anon;
grant UPDATE on public.v_transport_route_outstanding to authenticated;
grant UPDATE on public.v_transport_route_outstanding to service_role;
grant UPDATE on public.v_whatsapp_run_outcomes to anon;
grant UPDATE on public.v_whatsapp_run_outcomes to authenticated;
grant UPDATE on public.v_whatsapp_run_outcomes to service_role;
grant UPDATE on public.whatsapp_campaign_runs to anon;
grant UPDATE on public.whatsapp_campaign_runs to authenticated;
grant UPDATE on public.whatsapp_campaign_runs to service_role;
grant UPDATE on public.whatsapp_campaigns to anon;
grant UPDATE on public.whatsapp_campaigns to authenticated;
grant UPDATE on public.whatsapp_campaigns to service_role;
grant UPDATE on public.whatsapp_reminder_sends to anon;
grant UPDATE on public.whatsapp_reminder_sends to authenticated;
grant UPDATE on public.whatsapp_reminder_sends to service_role;
grant UPDATE on public.whatsapp_templates to anon;
grant UPDATE on public.whatsapp_templates to authenticated;
grant UPDATE on public.whatsapp_templates to service_role;
grant UPDATE on public.workbook_materialized_view_refresh_queue to service_role;

grant execute on function private.capture_audit_event() to service_role;
grant execute on function private.current_staff_role() to authenticated;
grant execute on function private.current_staff_role() to service_role;
grant execute on function private.enforce_max_active_conventional_discounts() to service_role;
grant execute on function private.enforce_max_active_conventional_discounts_in_schema() to service_role;
grant execute on function private.normalize_staff_role(text) to service_role;
grant execute on function private.normalize_workbook_class_label(text, text) to authenticated;
grant execute on function private.normalize_workbook_class_label(text, text) to service_role;
grant execute on function private.prevent_append_only_mutation() to service_role;
grant execute on function private.prevent_receipt_adjustment_mutation() to service_role;
grant execute on function private.protect_receipt_money_columns() to authenticated;
grant execute on function private.protect_receipt_money_columns() to service_role;
grant execute on function private.set_actor_columns() to service_role;
grant execute on function private.set_created_by_column() to service_role;
grant execute on function private.set_updated_at() to service_role;
grant execute on function private.sync_staff_profile_from_auth_user() to service_role;
grant execute on function private.vpps_apply_chunk(text, jsonb) to service_role;
grant execute on function private.workbook_installment_snapshot(uuid, date, boolean) to authenticated;
grant execute on function private.workbook_installment_snapshot(uuid, date, boolean) to service_role;
grant execute on function public.active_session_label() to authenticated;
grant execute on function public.active_session_label() to service_role;
grant execute on function public.cancel_student_repayment_plan(uuid, text) to authenticated;
grant execute on function public.cancel_student_repayment_plan(uuid, text) to service_role;
grant execute on function public.create_student_repayment_plan(uuid, text, text, integer, date, text, integer, uuid, uuid, date[]) to authenticated;
grant execute on function public.create_student_repayment_plan(uuid, text, text, integer, date, text, integer, uuid, uuid, date[]) to service_role;
grant execute on function public.delete_academic_session_safe(uuid) to authenticated;
grant execute on function public.delete_academic_session_safe(uuid) to service_role;
grant execute on function public.generate_schema_snapshot() to service_role;
grant execute on function public.get_dashboard_analytics(text) to authenticated;
grant execute on function public.get_dashboard_analytics(text) to service_role;
grant execute on function public.get_dashboard_fee_split(text) to authenticated;
grant execute on function public.get_dashboard_fee_split(text) to service_role;
grant execute on function public.get_dashboard_repayment_summary(text) to authenticated;
grant execute on function public.get_dashboard_repayment_summary(text) to service_role;
grant execute on function public.get_dashboard_summary(text, text) to authenticated;
grant execute on function public.get_dashboard_summary(text, text) to service_role;
grant execute on function public.get_student_directory_summary(text, uuid, uuid, text, text[], boolean) to authenticated;
grant execute on function public.get_student_directory_summary(text, uuid, uuid, text, text[], boolean) to service_role;
grant execute on function public.get_student_segment_counts(text, uuid, uuid, text, text[], boolean) to authenticated;
grant execute on function public.get_student_segment_counts(text, uuid, uuid, text, text[], boolean) to service_role;
grant execute on function public.has_any_permission(text[]) to authenticated;
grant execute on function public.has_any_permission(text[]) to service_role;
grant execute on function public.has_permission(text) to authenticated;
grant execute on function public.has_permission(text) to service_role;
grant execute on function public.import_student_batch_row(uuid, integer, text, uuid, text, date, text, text, text, text, text, uuid, public.student_status, text, integer, integer, integer, integer, jsonb, integer, integer, text, boolean) to authenticated;
grant execute on function public.import_student_batch_row(uuid, integer, text, uuid, text, date, text, text, text, text, text, uuid, public.student_status, text, integer, integer, integer, integer, jsonb, integer, integer, text, boolean) to service_role;
grant execute on function public.import_student_batch_row(uuid, integer, text, uuid, text, date, text, text, text, text, text, uuid, public.student_status, text, integer, integer, integer, integer, jsonb, integer, integer, text, boolean, text, integer, integer) to authenticated;
grant execute on function public.import_student_batch_row(uuid, integer, text, uuid, text, date, text, text, text, text, text, uuid, public.student_status, text, integer, integer, integer, integer, jsonb, integer, integer, text, boolean, text, integer, integer) to service_role;
grant execute on function public.post_corrected_payment(uuid, date, public.payment_mode, jsonb, uuid, text, text, text, text) to service_role;
grant execute on function public.post_student_payment(uuid, date, public.payment_mode, integer, text, text, text, text, uuid) to authenticated;
grant execute on function public.post_student_payment(uuid, date, public.payment_mode, integer, text, text, text, text, uuid) to service_role;
grant execute on function public.post_student_payment_with_adjustments(uuid, date, public.payment_mode, integer, text, text, text, text, uuid, integer, integer) to authenticated;
grant execute on function public.post_student_payment_with_adjustments(uuid, date, public.payment_mode, integer, text, text, text, text, uuid, integer, integer) to service_role;
grant execute on function public.preview_student_repayment_plan(uuid, text, text, integer, date) to authenticated;
grant execute on function public.preview_student_repayment_plan(uuid, text, text, integer, date) to service_role;
grant execute on function public.preview_workbook_payment_allocation(uuid, date) to authenticated;
grant execute on function public.preview_workbook_payment_allocation(uuid, date) to service_role;
grant execute on function public.process_refund_with_adjustment(uuid) to authenticated;
grant execute on function public.process_refund_with_adjustment(uuid) to service_role;
grant execute on function public.queue_workbook_materialized_view_refresh() to service_role;
grant execute on function public.realign_recent_import_students_to_active_session(uuid) to authenticated;
grant execute on function public.realign_recent_import_students_to_active_session(uuid) to service_role;
grant execute on function public.refresh_defaulter_recovery_state(text, date) to authenticated;
grant execute on function public.refresh_defaulter_recovery_state(text, date) to service_role;
grant execute on function public.refresh_financial_materialized_views(boolean) to service_role;
grant execute on function public.refresh_workbook_materialized_views_if_requested() to service_role;
grant execute on function public.reschedule_student_repayment_plan(uuid, integer, date, text, integer, uuid, date[]) to authenticated;
grant execute on function public.reschedule_student_repayment_plan(uuid, integer, date, text, integer, uuid, date[]) to service_role;
grant execute on function public.reverse_receipt_admin(uuid, text) to authenticated;
grant execute on function public.reverse_receipt_admin(uuid, text) to service_role;
grant execute on function public.rls_auto_enable() to service_role;
grant execute on function public.set_my_preferred_locale(text) to authenticated;
grant execute on function public.set_my_preferred_locale(text) to service_role;
grant execute on function public.sync_repayment_plan_late_fees(text, boolean, date) to authenticated;
grant execute on function public.sync_repayment_plan_late_fees(text, boolean, date) to service_role;
grant execute on function public.trigger_refresh_financial_views() to service_role;
grant execute on function public.undo_recent_payment(uuid, text) to authenticated;
grant execute on function public.undo_recent_payment(uuid, text) to service_role;
grant execute on function public.void_late_fee_waiver(uuid, text) to authenticated;
grant execute on function public.void_late_fee_waiver(uuid, text) to service_role;
grant execute on function public.vpps_apply_chunk_proxy(text, jsonb) to service_role;
grant execute on function public.waive_late_fee(uuid, integer, text, text, uuid, uuid, boolean) to authenticated;
grant execute on function public.waive_late_fee(uuid, integer, text, text, uuid, uuid, boolean) to service_role;


-- ══ Scheduled jobs (pg_cron) ════════════════════════════════════════════

-- charge-emi-late-fees-daily — active
select cron.schedule('charge-emi-late-fees-daily', '50 18 * * *', ' select public.sync_repayment_plan_late_fees(); ');

-- enqueue-workbook-refresh-daily — active
select cron.schedule('enqueue-workbook-refresh-daily', '35 18 * * *', 'select public.queue_workbook_materialized_view_refresh();');

-- notion-fee-sync-daily — active
select cron.schedule('notion-fee-sync-daily', '0 1 * * *', '
  select net.http_post(
    url := ''https://vgqyilgstjvgohrsiwkb.supabase.co/functions/v1/notion-fee-sync?source=cron'',
    headers := jsonb_build_object(
      ''Authorization'', ''Bearer <redacted-jwt>'',
      ''Content-Type'', ''application/json''
    ),
    body := ''{}''::jsonb,
    timeout_milliseconds := 30000
  );
  ');

-- notion-fee-sync-daily-test — active
select cron.schedule('notion-fee-sync-daily-test', '0 1 * * *', '
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = ''VPPS_SUPABASE_PROJECT_URL'')
      || ''/functions/v1/notion-fee-sync'',
    headers := jsonb_build_object(
      ''Content-Type'', ''application/json'',
      ''Authorization'', ''Bearer '' || (select decrypted_secret from vault.decrypted_secrets where name = ''VPPS_SUPABASE_ANON_KEY''),
      ''x-vpps-cron-secret'', (select decrypted_secret from vault.decrypted_secrets where name = ''VPPS_NOTION_FEE_SYNC_CRON_SECRET'')
    ),
    body := jsonb_build_object(
      ''session'', ''TEST-2026-27'',
      ''dry_run'', false,
      ''source'', ''pg_cron''
    )
  );
  ');

-- refresh-workbook-materialized-views — active
select cron.schedule('refresh-workbook-materialized-views', '*/2 * * * *', 'select public.refresh_workbook_materialized_views_if_requested();');
