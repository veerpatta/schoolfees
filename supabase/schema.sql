-- Shri Veer Patta Senior Secondary School — fee management schema
--
-- GENERATED ARTIFACT. Do not hand-edit. `supabase/migrations/` is the source of
-- truth; this is a readable snapshot of what those migrations add up to.
--
-- Generated 2026-08-09 from the live Mumbai project (vgqyilgstjvgohrsiwkb) at
-- migration 20260809110000, by introspecting pg_catalog — pg_get_viewdef,
-- pg_get_functiondef, pg_get_constraintdef, pg_get_indexdef, pg_get_triggerdef
-- and pg_policies. Not a pg_dump: `supabase db dump` needs Docker, which the
-- machine that generated this does not have. The object definitions are the
-- server's own text, so they are exact. The ordering and the `if not exists`
-- guards are this file's, chosen so it replays top to bottom on an empty
-- database.
--
-- The previous snapshot had drifted badly: it was missing 18 tables and 7 views
-- that exist in production, and several objects it did carry had been redefined
-- since. To refresh, re-run the introspection, or with Docker available:
--
--   supabase db dump --schema public,private -f supabase/schema.sql
--
-- Covers 53 tables, 17 views, 4 materialized views, 45 functions, 126 triggers,
-- 177 indexes, 410 constraints, 156 RLS policies and every grant across the
-- `public` and `private` schemas. Excludes the Supabase-managed `auth`,
-- `storage` and `extensions` schemas, all row data, and the pg_cron schedule —
-- that is listed as a comment at the end, because cron.schedule() is not
-- idempotent and re-running it would duplicate the jobs.
--
-- Two ordering notes, both load-bearing:
--
--   * `check_function_bodies` is turned off around the function section.
--     Functions and views are mutually recursive here — private.workbook_
--     installment_snapshot reads v_effective_late_fee_waivers, while
--     v_workbook_installment_balances is built on that same function, and
--     get_dashboard_fee_split then reads the matview. No pure ordering exists.
--     A view body is resolved at creation, a SQL function body is not once this
--     is off, so functions go first and the cycle resolves. This is what
--     pg_dump does for the same reason.
--
--   * Indexes on materialized views come after the view section, not with the
--     table indexes. The unique indexes there are not decoration: REFRESH
--     MATERIALIZED VIEW CONCURRENTLY requires one, and the app refreshes these
--     on a two-minute cron while staff are posting payments.
--
-- House rules this schema encodes, and that no migration should undo:
--
--   * payments and receipts are append-only. Corrections go through
--     payment_adjustments with an audit trail — never an UPDATE or DELETE.
--   * every RPC guarded by public.has_permission() must be called with the
--     user's JWT, never the service-role key: auth.uid() is null under service
--     role, so the guard raises for every caller.


-- Extensions ----------------------------------------------------------------

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_stat_statements with schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists supabase_vault with schema vault;
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists wrappers with schema extensions;


-- Schemas -------------------------------------------------------------------

create schema if not exists extensions;
create schema if not exists private;


-- Enum types ----------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'adjustment_type') then
    create type public.adjustment_type as enum ('reversal', 'correction', 'discount', 'writeoff');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'audit_action') then
    create type public.audit_action as enum ('insert', 'update', 'delete');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'cash_deposit_status') then
    create type public.cash_deposit_status as enum ('pending', 'deposited', 'carried_forward', 'not_applicable');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'class_status') then
    create type public.class_status as enum ('active', 'inactive', 'archived');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'collection_close_status') then
    create type public.collection_close_status as enum ('draft', 'pending_approval', 'closed', 'reopened');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'correction_review_status') then
    create type public.correction_review_status as enum ('reviewed', 'flagged', 'needs_followup');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'installment_status') then
    create type public.installment_status as enum ('scheduled', 'waived', 'cancelled');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'payment_mode') then
    create type public.payment_mode as enum ('cash', 'upi', 'bank_transfer', 'cheque', 'discount');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'reconciliation_status') then
    create type public.reconciliation_status as enum ('pending', 'in_review', 'cleared', 'issue_found');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'refund_request_status') then
    create type public.refund_request_status as enum ('pending_approval', 'approved', 'processed', 'rejected');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'staff_role') then
    create type public.staff_role as enum ('admin', 'accountant', 'view_only', 'teacher', 'fee_collector');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'student_status') then
    create type public.student_status as enum ('active', 'inactive', 'left', 'graduated');
  end if;
end $$;


-- Tables --------------------------------------------------------------------

create table if not exists private.vpps_direct_import_backups (
  id uuid default gen_random_uuid() not null,
  backup_label text not null,
  created_at timestamp with time zone default now() not null,
  table_counts jsonb not null,
  checksum_summary jsonb not null,
  snapshot jsonb not null
);

create table if not exists private.vpps_direct_import_stage_dues (
  import_name text not null,
  source_key text not null,
  payload jsonb not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists private.vpps_direct_import_stage_skipped (
  import_name text not null,
  source text not null,
  source_row_number integer not null,
  status text not null,
  payload jsonb not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists private.vpps_direct_import_stage_students (
  import_name text not null,
  source_key text not null,
  payload jsonb not null,
  created_at timestamp with time zone default now() not null
);

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

create table if not exists public.academic_sessions (
  id uuid default gen_random_uuid() not null,
  session_label text not null,
  status class_status default 'active'::class_status not null,
  is_current boolean default false not null,
  notes text,
  created_by uuid,
  updated_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.app_settings (
  key text not null,
  value text not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.audit_logs (
  id uuid default gen_random_uuid() not null,
  table_name text not null,
  record_id uuid not null,
  action audit_action not null,
  before_data jsonb,
  after_data jsonb,
  changed_by uuid,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.classes (
  id uuid default gen_random_uuid() not null,
  session_label text not null,
  class_name text not null,
  section text,
  stream_name text,
  sort_order integer default 0 not null,
  status class_status default 'active'::class_status not null,
  notes text,
  created_by uuid,
  updated_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.collection_closures (
  id uuid default gen_random_uuid() not null,
  payment_date date not null,
  status collection_close_status default 'draft'::collection_close_status not null,
  cash_deposit_status cash_deposit_status default 'pending'::cash_deposit_status not null,
  reconciliation_status reconciliation_status default 'pending'::reconciliation_status not null,
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

create table if not exists public.fee_policy_configs (
  id uuid default gen_random_uuid() not null,
  academic_session_label text not null,
  installment_schedule jsonb default '[]'::jsonb not null,
  late_fee_flat_amount integer default 1000 not null,
  custom_fee_heads jsonb default '[]'::jsonb not null,
  accepted_payment_modes payment_mode[] default ARRAY['cash'::payment_mode, 'upi'::payment_mode, 'bank_transfer'::payment_mode, 'cheque'::payment_mode] not null,
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
  amount_due integer default ((base_amount + transport_amount) - discount_amount),
  late_fee_flat_amount integer default 1000 not null,
  status installment_status default 'scheduled'::installment_status not null,
  notes text,
  created_by uuid,
  updated_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  is_carry_forward boolean default false not null,
  carry_forward_balance_id uuid,
  source_session_label text,
  target_session_label text,
  carry_forward_fee_head text
);

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

create table if not exists public.late_fee_waiver_pool_snapshot (
  student_id uuid not null,
  pool_amount integer not null,
  override_reason text,
  override_updated_at timestamp with time zone,
  captured_at timestamp with time zone default now() not null
);

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

create table if not exists public.payment_adjustment_reviews (
  id uuid default gen_random_uuid() not null,
  payment_adjustment_id uuid not null,
  review_status correction_review_status not null,
  review_note text,
  created_by uuid,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.payment_adjustments (
  id uuid default gen_random_uuid() not null,
  payment_id uuid not null,
  student_id uuid not null,
  installment_id uuid not null,
  adjustment_type adjustment_type not null,
  amount_delta integer not null,
  reason text not null,
  notes text,
  created_by uuid,
  created_at timestamp with time zone default now() not null
);

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

create table if not exists public.payment_import_rows (
  id uuid default gen_random_uuid() not null,
  batch_id uuid not null,
  row_number integer not null,
  raw_payload jsonb not null,
  admission_no text,
  student_id uuid,
  student_name text,
  payment_date date,
  payment_mode payment_mode,
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

create table if not exists public.promotion_run_entries (
  id uuid default gen_random_uuid() not null,
  run_id uuid not null,
  student_id uuid not null,
  previous_class_id uuid,
  new_class_id uuid,
  previous_status student_status,
  new_status student_status,
  credit_balance integer default 0 not null,
  opening_credit_amount integer default 0 not null,
  applied boolean default false not null,
  decision text default 'pending'::text not null,
  reason text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

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

create table if not exists public.receipt_adjustments (
  id uuid default gen_random_uuid() not null,
  receipt_id uuid not null,
  student_id uuid not null,
  installment_id uuid not null,
  adjustment_type adjustment_type not null,
  amount_delta integer not null,
  reason text not null,
  notes text,
  created_by uuid,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.receipt_finance_adjustments (
  id uuid default gen_random_uuid() not null,
  receipt_id uuid not null,
  student_id uuid not null,
  quick_discount_amount integer default 0 not null,
  quick_late_fee_waiver_amount integer default 0 not null,
  created_by uuid,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.receipts (
  id uuid default gen_random_uuid() not null,
  receipt_number text not null,
  student_id uuid not null,
  payment_date date default CURRENT_DATE not null,
  payment_mode payment_mode not null,
  total_amount integer not null,
  reference_number text,
  notes text,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  received_by text,
  client_request_id uuid,
  family_payment_id uuid
);

create table if not exists public.refund_requests (
  id uuid default gen_random_uuid() not null,
  refund_date date default CURRENT_DATE not null,
  receipt_id uuid not null,
  student_id uuid not null,
  requested_amount integer not null,
  refund_method payment_mode not null,
  refund_reference text,
  reason text not null,
  notes text,
  status refund_request_status default 'pending_approval'::refund_request_status not null,
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

create table if not exists public.student_collection_flags (
  id uuid default gen_random_uuid() not null,
  student_id uuid not null,
  session_label text not null,
  no_call boolean default true not null,
  reason text,
  created_by uuid,
  updated_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

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

create table if not exists public.student_session_reanchor_log (
  id uuid default gen_random_uuid() not null,
  student_id uuid not null,
  from_session text not null,
  to_session text not null,
  batch_id uuid,
  run_by uuid,
  run_at timestamp with time zone default now() not null
);

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
  status student_status default 'active'::student_status not null,
  joined_on date,
  left_on date,
  notes text,
  created_by uuid,
  updated_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  email text,
  photo_path text
);

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

create table if not exists public.user_activity_events (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  kind text not null,
  ref_id uuid,
  payload jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.users (
  id uuid not null,
  full_name text not null,
  role staff_role default 'view_only'::staff_role not null,
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

create table if not exists public.workbook_materialized_view_refresh_queue (
  queue_key text default 'workbook'::text not null,
  pending boolean default true not null,
  requested_at timestamp with time zone default now() not null,
  request_count bigint default 1 not null,
  last_refreshed_at timestamp with time zone
);


-- Constraints ---------------------------------------------------------------

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
alter table public.student_session_reanchor_log add constraint student_session_reanchor_log_pkey PRIMARY KEY (id);
alter table public.student_share_links add constraint student_share_links_pkey PRIMARY KEY (id);
alter table public.students add constraint students_pkey PRIMARY KEY (id);
alter table public.transport_routes add constraint transport_routes_pkey PRIMARY KEY (id);
alter table public.user_activity_events add constraint user_activity_events_pkey PRIMARY KEY (id);
alter table public.users add constraint users_pkey PRIMARY KEY (id);
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
alter table public.student_share_links add constraint student_share_links_token_key UNIQUE (token);
alter table public.students add constraint students_admission_no_key UNIQUE (admission_no);
alter table public.transport_routes add constraint transport_routes_route_code_key UNIQUE (route_code);
alter table private.vpps_direct_import_stage_dues add constraint vpps_direct_import_stage_dues_payload_object CHECK ((jsonb_typeof(payload) = 'object'::text));
alter table private.vpps_direct_import_stage_skipped add constraint vpps_direct_import_stage_skipped_payload_object CHECK ((jsonb_typeof(payload) = 'object'::text));
alter table private.vpps_direct_import_stage_students add constraint vpps_direct_import_stage_students_payload_object CHECK ((jsonb_typeof(payload) = 'object'::text));
alter table private.vpps_student_source_mapping add constraint vpps_student_source_mapping_matched_via_check CHECK ((matched_via = ANY (ARRAY['source_student_uid'::text, 'admission_no'::text, 'name_class_phone_fallback'::text, 'created_new'::text])));
alter table public.academic_sessions add constraint academic_sessions_check CHECK (((NOT is_current) OR (status = 'active'::class_status)));
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
alter table public.config_change_blocked_installments add constraint config_change_blocked_installments_reason_code_check CHECK ((reason_code = ANY (ARRAY['fully_paid'::text, 'partially_paid'::text, 'adjustment_posted'::text])));
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
alter table public.ledger_regeneration_rows add constraint ledger_regeneration_rows_reason_code_check CHECK ((reason_code = ANY (ARRAY['missing_installment'::text, 'already_in_sync'::text, 'fully_paid'::text, 'partially_paid'::text, 'adjustment_posted'::text, 'existing_waived'::text, 'existing_cancelled'::text, 'extra_installment'::text, 'missing_settings'::text])));
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
alter table public.receipt_adjustments add constraint receipt_adjustments_adjustment_type_check CHECK ((adjustment_type = ANY (ARRAY['discount'::adjustment_type, 'writeoff'::adjustment_type])));
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
alter table public.student_late_fee_waivers add constraint student_late_fee_waivers_source_check CHECK ((source = ANY (ARRAY['manual'::text, 'payment_desk'::text, 'migration'::text, 'grandfather'::text])));
alter table public.student_late_fee_waivers add constraint student_late_fee_waivers_void_complete CHECK ((((voided_at IS NULL) AND (voided_by IS NULL) AND (void_reason IS NULL)) OR ((voided_at IS NOT NULL) AND (length(btrim(COALESCE(void_reason, ''::text))) >= 4))));
alter table public.students add constraint students_check CHECK (((left_on IS NULL) OR (joined_on IS NULL) OR (left_on >= joined_on)));
alter table public.transport_routes add constraint transport_routes_annual_fee_amount_check CHECK ((annual_fee_amount >= 0));
alter table public.transport_routes add constraint transport_routes_default_installment_amount_check CHECK ((default_installment_amount >= 0));
alter table public.users add constraint users_preferred_locale_check CHECK (((preferred_locale IS NULL) OR (preferred_locale = ANY (ARRAY['en'::text, 'hi'::text, 'hi-en'::text]))));
alter table public.whatsapp_templates add constraint whatsapp_templates_category_check CHECK ((category = ANY (ARRAY['reminder'::text, 'final_reminder'::text, 'receipt'::text, 'custom'::text])));
alter table public.workbook_materialized_view_refresh_queue add constraint workbook_materialized_view_refresh_queue_singleton CHECK ((queue_key = ANY (ARRAY['workbook'::text, 'sibling_groups'::text])));
alter table private.vpps_student_source_mapping add constraint vpps_student_source_mapping_student_id_fkey FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE;
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
alter table public.config_change_blocked_installments add constraint config_change_blocked_installments_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES config_change_batches(id) ON DELETE CASCADE;
alter table public.config_change_blocked_installments add constraint config_change_blocked_installments_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.config_change_blocked_installments add constraint config_change_blocked_installments_installment_id_fkey FOREIGN KEY (installment_id) REFERENCES installments(id) ON DELETE RESTRICT;
alter table public.config_change_blocked_installments add constraint config_change_blocked_installments_student_id_fkey FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE RESTRICT;
alter table public.config_change_blocked_installments add constraint config_change_blocked_installments_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.conventional_discount_policies add constraint conventional_discount_policies_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.conventional_discount_policies add constraint conventional_discount_policies_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.defaulter_contacts add constraint defaulter_contacts_contacted_by_fkey FOREIGN KEY (contacted_by) REFERENCES auth.users(id);
alter table public.defaulter_contacts add constraint defaulter_contacts_student_id_fkey FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE;
alter table public.defaulter_recovery_state add constraint defaulter_recovery_state_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.defaulter_recovery_state add constraint defaulter_recovery_state_family_group_id_fkey FOREIGN KEY (family_group_id) REFERENCES student_family_groups(id) ON DELETE SET NULL;
alter table public.defaulter_recovery_state add constraint defaulter_recovery_state_last_resolved_contact_id_fkey FOREIGN KEY (last_resolved_contact_id) REFERENCES defaulter_contacts(id) ON DELETE SET NULL;
alter table public.defaulter_recovery_state add constraint defaulter_recovery_state_student_id_fkey FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE;
alter table public.defaulter_recovery_state add constraint defaulter_recovery_state_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.family_payments add constraint family_payments_family_group_id_fkey FOREIGN KEY (family_group_id) REFERENCES student_family_groups(id) ON DELETE RESTRICT;
alter table public.family_payments add constraint family_payments_posted_by_fkey FOREIGN KEY (posted_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.fee_policy_configs add constraint fee_policy_configs_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.fee_policy_configs add constraint fee_policy_configs_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.fee_settings add constraint fee_settings_class_id_fkey FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE RESTRICT;
alter table public.fee_settings add constraint fee_settings_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.fee_settings add constraint fee_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.import_batches add constraint import_batches_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.import_batches add constraint import_batches_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.import_rows add constraint import_rows_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES import_batches(id) ON DELETE CASCADE;
alter table public.import_rows add constraint import_rows_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.import_rows add constraint import_rows_duplicate_audit_target_student_id_fkey FOREIGN KEY (duplicate_audit_target_student_id) REFERENCES students(id) ON DELETE SET NULL;
alter table public.import_rows add constraint import_rows_duplicate_student_id_fkey FOREIGN KEY (duplicate_student_id) REFERENCES students(id) ON DELETE SET NULL;
alter table public.import_rows add constraint import_rows_imported_override_id_fkey FOREIGN KEY (imported_override_id) REFERENCES student_fee_overrides(id) ON DELETE SET NULL;
alter table public.import_rows add constraint import_rows_imported_student_id_fkey FOREIGN KEY (imported_student_id) REFERENCES students(id) ON DELETE SET NULL;
alter table public.import_rows add constraint import_rows_target_student_id_fkey FOREIGN KEY (target_student_id) REFERENCES students(id) ON DELETE SET NULL;
alter table public.import_rows add constraint import_rows_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.installments add constraint installments_carry_forward_balance_id_fkey FOREIGN KEY (carry_forward_balance_id) REFERENCES student_carry_forward_balances(id) ON DELETE SET NULL;
alter table public.installments add constraint installments_class_id_fkey FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE RESTRICT;
alter table public.installments add constraint installments_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.installments add constraint installments_fee_setting_id_fkey FOREIGN KEY (fee_setting_id) REFERENCES fee_settings(id) ON DELETE RESTRICT;
alter table public.installments add constraint installments_student_fee_override_id_fkey FOREIGN KEY (student_fee_override_id) REFERENCES student_fee_overrides(id) ON DELETE SET NULL;
alter table public.installments add constraint installments_student_id_fkey FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE;
alter table public.installments add constraint installments_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.ledger_regeneration_batches add constraint ledger_regeneration_batches_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.ledger_regeneration_batches add constraint ledger_regeneration_batches_policy_revision_id_fkey FOREIGN KEY (policy_revision_id) REFERENCES fee_policy_configs(id) ON DELETE SET NULL;
alter table public.ledger_regeneration_batches add constraint ledger_regeneration_batches_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.ledger_regeneration_rows add constraint ledger_regeneration_rows_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES ledger_regeneration_batches(id) ON DELETE CASCADE;
alter table public.ledger_regeneration_rows add constraint ledger_regeneration_rows_class_id_fkey FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE RESTRICT;
alter table public.ledger_regeneration_rows add constraint ledger_regeneration_rows_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.ledger_regeneration_rows add constraint ledger_regeneration_rows_fee_setting_id_fkey FOREIGN KEY (fee_setting_id) REFERENCES fee_settings(id) ON DELETE RESTRICT;
alter table public.ledger_regeneration_rows add constraint ledger_regeneration_rows_installment_id_fkey FOREIGN KEY (installment_id) REFERENCES installments(id) ON DELETE RESTRICT;
alter table public.ledger_regeneration_rows add constraint ledger_regeneration_rows_student_fee_override_id_fkey FOREIGN KEY (student_fee_override_id) REFERENCES student_fee_overrides(id) ON DELETE SET NULL;
alter table public.ledger_regeneration_rows add constraint ledger_regeneration_rows_student_id_fkey FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE RESTRICT;
alter table public.ledger_regeneration_rows add constraint ledger_regeneration_rows_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.office_sync_events add constraint office_sync_events_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
alter table public.payment_adjustment_reviews add constraint payment_adjustment_reviews_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.payment_adjustment_reviews add constraint payment_adjustment_reviews_payment_adjustment_id_fkey FOREIGN KEY (payment_adjustment_id) REFERENCES payment_adjustments(id) ON DELETE RESTRICT;
alter table public.payment_adjustments add constraint payment_adjustments_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.payment_adjustments add constraint payment_adjustments_payment_fk FOREIGN KEY (payment_id, student_id, installment_id) REFERENCES payments(id, student_id, installment_id) ON DELETE RESTRICT;
alter table public.payment_import_batches add constraint payment_import_batches_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
alter table public.payment_import_rows add constraint payment_import_rows_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES payment_import_batches(id) ON DELETE CASCADE;
alter table public.payment_import_rows add constraint payment_import_rows_receipt_id_fkey FOREIGN KEY (receipt_id) REFERENCES receipts(id);
alter table public.payment_import_rows add constraint payment_import_rows_student_id_fkey FOREIGN KEY (student_id) REFERENCES students(id);
alter table public.payments add constraint payments_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.payments add constraint payments_family_payment_id_fkey FOREIGN KEY (family_payment_id) REFERENCES family_payments(id) ON DELETE RESTRICT;
alter table public.payments add constraint payments_installment_fk FOREIGN KEY (installment_id, student_id) REFERENCES installments(id, student_id) ON DELETE RESTRICT;
alter table public.payments add constraint payments_receipt_fk FOREIGN KEY (receipt_id, student_id) REFERENCES receipts(id, student_id) ON DELETE RESTRICT;
alter table public.prev_year_import_batches add constraint prev_year_import_batches_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.prev_year_import_batches add constraint prev_year_import_batches_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.prev_year_import_rows add constraint prev_year_import_rows_applied_installment_id_fkey FOREIGN KEY (applied_installment_id) REFERENCES installments(id) ON DELETE SET NULL;
alter table public.prev_year_import_rows add constraint prev_year_import_rows_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES prev_year_import_batches(id) ON DELETE CASCADE;
alter table public.prev_year_import_rows add constraint prev_year_import_rows_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.prev_year_import_rows add constraint prev_year_import_rows_matched_student_id_fkey FOREIGN KEY (matched_student_id) REFERENCES students(id) ON DELETE SET NULL;
alter table public.prev_year_import_rows add constraint prev_year_import_rows_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.promotion_run_entries add constraint promotion_run_entries_new_class_id_fkey FOREIGN KEY (new_class_id) REFERENCES classes(id) ON DELETE SET NULL;
alter table public.promotion_run_entries add constraint promotion_run_entries_previous_class_id_fkey FOREIGN KEY (previous_class_id) REFERENCES classes(id) ON DELETE SET NULL;
alter table public.promotion_run_entries add constraint promotion_run_entries_run_id_fkey FOREIGN KEY (run_id) REFERENCES promotion_runs(id) ON DELETE CASCADE;
alter table public.promotion_run_entries add constraint promotion_run_entries_student_id_fkey FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE;
alter table public.promotion_runs add constraint promotion_runs_triggered_by_fkey FOREIGN KEY (triggered_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.receipt_adjustments add constraint receipt_adjustments_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.receipt_adjustments add constraint receipt_adjustments_installment_id_fkey FOREIGN KEY (installment_id) REFERENCES installments(id) ON DELETE RESTRICT;
alter table public.receipt_adjustments add constraint receipt_adjustments_receipt_id_fkey FOREIGN KEY (receipt_id) REFERENCES receipts(id) ON DELETE RESTRICT;
alter table public.receipt_adjustments add constraint receipt_adjustments_student_id_fkey FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE RESTRICT;
alter table public.receipt_finance_adjustments add constraint receipt_finance_adjustments_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.receipt_finance_adjustments add constraint receipt_finance_adjustments_receipt_id_fkey FOREIGN KEY (receipt_id) REFERENCES receipts(id) ON DELETE RESTRICT;
alter table public.receipt_finance_adjustments add constraint receipt_finance_adjustments_student_id_fkey FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE RESTRICT;
alter table public.receipts add constraint receipts_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.receipts add constraint receipts_family_payment_id_fkey FOREIGN KEY (family_payment_id) REFERENCES family_payments(id) ON DELETE RESTRICT;
alter table public.receipts add constraint receipts_student_id_fkey FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE RESTRICT;
alter table public.refund_requests add constraint refund_requests_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.refund_requests add constraint refund_requests_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.refund_requests add constraint refund_requests_processed_by_fkey FOREIGN KEY (processed_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.refund_requests add constraint refund_requests_receipt_id_fkey FOREIGN KEY (receipt_id) REFERENCES receipts(id) ON DELETE RESTRICT;
alter table public.refund_requests add constraint refund_requests_student_id_fkey FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE RESTRICT;
alter table public.refund_requests add constraint refund_requests_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.school_fee_defaults add constraint school_fee_defaults_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.school_fee_defaults add constraint school_fee_defaults_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.session_reconcile_log add constraint session_reconcile_log_run_by_fkey FOREIGN KEY (run_by) REFERENCES auth.users(id);
alter table public.setup_progress add constraint setup_progress_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.setup_progress add constraint setup_progress_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.student_carry_forward_balances add constraint student_carry_forward_balances_backing_installment_id_fkey FOREIGN KEY (backing_installment_id) REFERENCES installments(id) ON DELETE RESTRICT;
alter table public.student_carry_forward_balances add constraint student_carry_forward_balances_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.student_carry_forward_balances add constraint student_carry_forward_balances_import_batch_id_fkey FOREIGN KEY (import_batch_id) REFERENCES prev_year_import_batches(id) ON DELETE SET NULL;
alter table public.student_carry_forward_balances add constraint student_carry_forward_balances_import_row_id_fkey FOREIGN KEY (import_row_id) REFERENCES prev_year_import_rows(id) ON DELETE SET NULL;
alter table public.student_carry_forward_balances add constraint student_carry_forward_balances_student_id_fkey FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE RESTRICT;
alter table public.student_carry_forward_balances add constraint student_carry_forward_balances_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.student_collection_flags add constraint student_collection_flags_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.student_collection_flags add constraint student_collection_flags_student_id_fkey FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE;
alter table public.student_collection_flags add constraint student_collection_flags_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.student_conventional_discount_assignments add constraint student_conventional_discount_assignments_applied_by_fkey FOREIGN KEY (applied_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.student_conventional_discount_assignments add constraint student_conventional_discount_assignments_family_group_id_fkey FOREIGN KEY (family_group_id) REFERENCES student_family_groups(id) ON DELETE SET NULL;
alter table public.student_conventional_discount_assignments add constraint student_conventional_discount_assignments_policy_id_fkey FOREIGN KEY (policy_id) REFERENCES conventional_discount_policies(id) ON DELETE RESTRICT;
alter table public.student_conventional_discount_assignments add constraint student_conventional_discount_assignments_student_id_fkey FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE;
alter table public.student_family_groups add constraint student_family_groups_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.student_family_groups add constraint student_family_groups_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.student_family_members add constraint student_family_members_family_group_id_fkey FOREIGN KEY (family_group_id) REFERENCES student_family_groups(id) ON DELETE CASCADE;
alter table public.student_family_members add constraint student_family_members_student_id_fkey FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE;
alter table public.student_fee_overrides add constraint student_fee_overrides_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.student_fee_overrides add constraint student_fee_overrides_fee_setting_id_fkey FOREIGN KEY (fee_setting_id) REFERENCES fee_settings(id) ON DELETE RESTRICT;
alter table public.student_fee_overrides add constraint student_fee_overrides_student_id_fkey FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE;
alter table public.student_fee_overrides add constraint student_fee_overrides_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.student_late_fee_waivers add constraint student_late_fee_waivers_installment_fk FOREIGN KEY (installment_id, student_id) REFERENCES installments(id, student_id) ON DELETE CASCADE;
alter table public.student_late_fee_waivers add constraint student_late_fee_waivers_student_id_fkey FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE;
alter table public.student_late_fee_waivers add constraint student_late_fee_waivers_voided_by_fkey FOREIGN KEY (voided_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.student_late_fee_waivers add constraint student_late_fee_waivers_waived_by_fkey FOREIGN KEY (waived_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.student_session_reanchor_log add constraint student_session_reanchor_log_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES import_batches(id) ON DELETE SET NULL;
alter table public.student_session_reanchor_log add constraint student_session_reanchor_log_run_by_fkey FOREIGN KEY (run_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.student_session_reanchor_log add constraint student_session_reanchor_log_student_id_fkey FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE RESTRICT;
alter table public.student_share_links add constraint student_share_links_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.student_share_links add constraint student_share_links_student_id_fkey FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE;
alter table public.students add constraint students_class_id_fkey FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE RESTRICT;
alter table public.students add constraint students_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.students add constraint students_transport_route_id_fkey FOREIGN KEY (transport_route_id) REFERENCES transport_routes(id) ON DELETE SET NULL;
alter table public.students add constraint students_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.transport_routes add constraint transport_routes_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.transport_routes add constraint transport_routes_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.user_activity_events add constraint user_activity_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.users add constraint users_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.users add constraint users_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.users add constraint users_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.whatsapp_templates add constraint whatsapp_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


-- Indexes -------------------------------------------------------------------

create index if not exists vpps_student_source_mapping_student_id_idx on private.vpps_student_source_mapping using btree (student_id);
create unique index if not exists idx_academic_sessions_current_unique on public.academic_sessions using btree (is_current) where is_current;
create index if not exists idx_audit_logs_changed_by on public.audit_logs using btree (changed_by, created_at DESC);
create index if not exists idx_audit_logs_created_at on public.audit_logs using btree (created_at DESC);
create index if not exists idx_audit_logs_record on public.audit_logs using btree (table_name, record_id, created_at DESC);
create index if not exists idx_audit_logs_table_created on public.audit_logs using btree (table_name, created_at DESC);
create index if not exists idx_classes_created_by on public.classes using btree (created_by);
create index if not exists idx_classes_session_sort on public.classes using btree (session_label, sort_order, class_name);
create index if not exists idx_classes_session_status_sort on public.classes using btree (session_label, status, sort_order, class_name);
create unique index if not exists idx_classes_unique_active_per_session_ci on public.classes using btree (lower(session_label), lower(class_name), lower(COALESCE(section, ''::text)), lower(COALESCE(stream_name, ''::text))) where (status = 'active'::class_status);
create unique index if not exists idx_classes_unique_per_session on public.classes using btree (session_label, class_name, COALESCE(section, ''::text), COALESCE(stream_name, ''::text));
create index if not exists idx_classes_updated_by on public.classes using btree (updated_by);
create index if not exists idx_collection_closures_created_by on public.collection_closures using btree (created_by);
create index if not exists idx_collection_closures_payment_date on public.collection_closures using btree (payment_date DESC);
create index if not exists idx_collection_closures_status on public.collection_closures using btree (status, payment_date DESC);
create index if not exists idx_config_change_batches_scope_created on public.config_change_batches using btree (change_scope, created_at DESC);
create index if not exists idx_config_change_batches_status_created on public.config_change_batches using btree (status, created_at DESC);
create index if not exists idx_config_change_blocked_batch on public.config_change_blocked_installments using btree (batch_id, created_at);
create index if not exists idx_config_change_blocked_installments_installment_id on public.config_change_blocked_installments using btree (installment_id);
create index if not exists idx_config_change_blocked_student on public.config_change_blocked_installments using btree (student_id, due_date);
create index if not exists idx_conventional_discount_policies_session on public.conventional_discount_policies using btree (academic_session_label, is_active, sort_order);
create index if not exists defaulter_contacts_contacted_by_idx on public.defaulter_contacts using btree (contacted_by);
create index if not exists defaulter_contacts_session_idx on public.defaulter_contacts using btree (session_label, contacted_at DESC);
create index if not exists defaulter_contacts_student_recent_idx on public.defaulter_contacts using btree (student_id, contacted_at DESC);
create index if not exists defaulter_recovery_state_family_idx on public.defaulter_recovery_state using btree (family_group_id, session_label) where (family_group_id IS NOT NULL);
create index if not exists defaulter_recovery_state_last_contact_idx on public.defaulter_recovery_state using btree (last_resolved_contact_id) where (last_resolved_contact_id IS NOT NULL);
create index if not exists defaulter_recovery_state_session_stage_idx on public.defaulter_recovery_state using btree (session_label, recovery_stage);
create unique index if not exists idx_fee_policy_configs_active_singleton on public.fee_policy_configs using btree (is_active) where is_active;
create index if not exists idx_fee_policy_configs_created_by on public.fee_policy_configs using btree (created_by);
create index if not exists idx_fee_policy_configs_updated_by on public.fee_policy_configs using btree (updated_by);
create unique index if not exists idx_fee_settings_active_per_class on public.fee_settings using btree (class_id) where is_active;
create index if not exists idx_fee_settings_created_by on public.fee_settings using btree (created_by);
create index if not exists idx_fee_settings_updated_by on public.fee_settings using btree (updated_by);
create index if not exists idx_import_batches_created_at on public.import_batches using btree (created_at DESC);
create index if not exists idx_import_batches_created_by on public.import_batches using btree (created_by);
create index if not exists idx_import_batches_status_created_at on public.import_batches using btree (status, created_at DESC);
create index if not exists idx_import_batches_target_session_label on public.import_batches using btree (target_session_label) where (target_session_label IS NOT NULL);
create index if not exists idx_import_rows_audit_decision on public.import_rows using btree (batch_id, duplicate_audit_decision) where (duplicate_audit_decision IS NOT NULL);
create index if not exists idx_import_rows_batch_row_index on public.import_rows using btree (batch_id, row_index);
create index if not exists idx_import_rows_batch_status on public.import_rows using btree (batch_id, status);
create index if not exists idx_import_rows_duplicate_student on public.import_rows using btree (duplicate_student_id) where (duplicate_student_id IS NOT NULL);
create index if not exists idx_import_rows_imported_student on public.import_rows using btree (imported_student_id) where (imported_student_id IS NOT NULL);
create index if not exists idx_import_rows_operation on public.import_rows using btree (batch_id, import_operation);
create index if not exists idx_import_rows_review_status on public.import_rows using btree (batch_id, review_status) where (review_status <> 'pending'::text);
create index if not exists idx_import_rows_target_student on public.import_rows using btree (target_student_id) where (target_student_id IS NOT NULL);
create index if not exists idx_installments_carry_forward on public.installments using btree (student_id) where (is_carry_forward = true);
create index if not exists idx_installments_carry_forward_balance on public.installments using btree (carry_forward_balance_id) where (carry_forward_balance_id IS NOT NULL);
create index if not exists idx_installments_carry_forward_source_target on public.installments using btree (target_session_label, source_session_label, carry_forward_fee_head) where (is_carry_forward = true);
create index if not exists idx_installments_class_due_date on public.installments using btree (class_id, due_date);
create index if not exists idx_installments_class_status_due_date on public.installments using btree (class_id, status, due_date);
create index if not exists idx_installments_created_by on public.installments using btree (created_by);
create index if not exists idx_installments_fee_setting on public.installments using btree (fee_setting_id);
create index if not exists idx_installments_status_due_date on public.installments using btree (status, due_date);
create index if not exists idx_installments_student_class on public.installments using btree (student_id, class_id);
create index if not exists idx_installments_student_due_date on public.installments using btree (student_id, due_date);
create index if not exists idx_installments_student_fee_override on public.installments using btree (student_fee_override_id) where (student_fee_override_id IS NOT NULL);
create index if not exists idx_installments_student_id_status on public.installments using btree (student_id, status) where (status <> 'cancelled'::installment_status);
create index if not exists idx_installments_student_status_due_date on public.installments using btree (student_id, status, due_date);
create index if not exists idx_installments_updated_by on public.installments using btree (updated_by);
create index if not exists idx_ledger_regen_batches_created_at on public.ledger_regeneration_batches using btree (created_at DESC);
create index if not exists idx_ledger_regeneration_batches_policy_created on public.ledger_regeneration_batches using btree (policy_revision_id, created_at DESC);
create index if not exists idx_ledger_regeneration_batches_status_created on public.ledger_regeneration_batches using btree (status, created_at DESC);
create index if not exists idx_ledger_regeneration_rows_batch_action on public.ledger_regeneration_rows using btree (batch_id, action_needed);
create index if not exists idx_ledger_regeneration_rows_batch_created on public.ledger_regeneration_rows using btree (batch_id, created_at);
create index if not exists idx_ledger_regeneration_rows_student_due on public.ledger_regeneration_rows using btree (student_id, due_date);
create index if not exists idx_notion_sync_log_started on public.notion_sync_log using btree (run_started_at DESC);
create index if not exists idx_office_sync_events_entity on public.office_sync_events using btree (entity_type, entity_id);
create index if not exists idx_office_sync_events_session_created on public.office_sync_events using btree (session_label, created_at DESC);
create index if not exists office_sync_events_created_by_idx on public.office_sync_events using btree (created_by);
create index if not exists idx_payment_adjustment_reviews_adjustment on public.payment_adjustment_reviews using btree (payment_adjustment_id);
create index if not exists idx_payment_adjustment_reviews_status on public.payment_adjustment_reviews using btree (review_status, created_at DESC);
create index if not exists payment_adjustment_reviews_created_by_idx on public.payment_adjustment_reviews using btree (created_by);
create index if not exists idx_payment_adjustments_created_by on public.payment_adjustments using btree (created_by);
create index if not exists idx_payment_adjustments_installment_id on public.payment_adjustments using btree (installment_id, amount_delta);
create index if not exists idx_payment_adjustments_payment_student_installment on public.payment_adjustments using btree (payment_id, student_id, installment_id);
create index if not exists idx_payment_adjustments_student on public.payment_adjustments using btree (student_id, created_at DESC);
create index if not exists idx_payment_import_rows_batch_id on public.payment_import_rows using btree (batch_id, row_number);
create index if not exists idx_payments_created_at on public.payments using btree (created_at DESC);
create index if not exists idx_payments_created_by on public.payments using btree (created_by);
create index if not exists idx_payments_family_payment_id on public.payments using btree (family_payment_id);
create index if not exists idx_payments_installment_student on public.payments using btree (installment_id, student_id);
create index if not exists idx_payments_receipt_student on public.payments using btree (receipt_id, student_id);
create index if not exists idx_payments_student_created_at on public.payments using btree (student_id, created_at DESC);
create index if not exists idx_prev_year_import_batches_session_created on public.prev_year_import_batches using btree (session_label, created_at DESC);
create index if not exists idx_prev_year_import_batches_status_created on public.prev_year_import_batches using btree (status, created_at DESC);
create index if not exists idx_prev_year_import_rows_batch on public.prev_year_import_rows using btree (batch_id, row_index);
create index if not exists idx_prev_year_import_rows_installment on public.prev_year_import_rows using btree (applied_installment_id);
create index if not exists idx_prev_year_import_rows_student on public.prev_year_import_rows using btree (matched_student_id);
create index if not exists idx_promotion_run_entries_run_student on public.promotion_run_entries using btree (run_id, student_id);
create index if not exists idx_promotion_runs_status_triggered_at on public.promotion_runs using btree (status, triggered_at DESC);
create index if not exists idx_receipt_adjustments_installment_id on public.receipt_adjustments using btree (installment_id, amount_delta);
create index if not exists idx_receipt_adjustments_receipt on public.receipt_adjustments using btree (receipt_id, created_at DESC);
create index if not exists idx_receipt_adjustments_student on public.receipt_adjustments using btree (student_id, created_at DESC);
create index if not exists receipt_adjustments_created_by_idx on public.receipt_adjustments using btree (created_by);
create index if not exists idx_receipt_finance_adjustments_student_id on public.receipt_finance_adjustments using btree (student_id);
create index if not exists receipt_finance_adjustments_created_by_idx on public.receipt_finance_adjustments using btree (created_by);
create index if not exists idx_receipts_created_by on public.receipts using btree (created_by);
create index if not exists idx_receipts_duplicate_check on public.receipts using btree (student_id, payment_date, payment_mode, total_amount, created_at);
create index if not exists idx_receipts_duplicate_guard_lookup on public.receipts using btree (student_id, payment_date, payment_mode, total_amount, created_at DESC);
create index if not exists idx_receipts_family_payment_id on public.receipts using btree (family_payment_id);
create index if not exists idx_receipts_payment_date on public.receipts using btree (payment_date DESC);
create index if not exists idx_receipts_payment_date_created_at on public.receipts using btree (payment_date DESC, created_at DESC);
create index if not exists idx_receipts_reference_number on public.receipts using btree (reference_number) where (reference_number IS NOT NULL);
create index if not exists idx_receipts_student_id_created_at on public.receipts using btree (student_id, created_at DESC);
create index if not exists idx_receipts_student_payment_date_created_at on public.receipts using btree (student_id, payment_date DESC, created_at DESC);
create unique index if not exists receipts_student_client_request_id_unique on public.receipts using btree (student_id, client_request_id) where (client_request_id IS NOT NULL);
create index if not exists idx_refund_requests_created_by on public.refund_requests using btree (created_by);
create index if not exists idx_refund_requests_receipt on public.refund_requests using btree (receipt_id, refund_date DESC);
create index if not exists idx_refund_requests_refund_date on public.refund_requests using btree (refund_date DESC);
create index if not exists idx_refund_requests_status on public.refund_requests using btree (status, refund_date DESC);
create index if not exists idx_refund_requests_student_id on public.refund_requests using btree (student_id);
create unique index if not exists idx_school_fee_defaults_active_singleton on public.school_fee_defaults using btree (is_active) where is_active;
create index if not exists idx_school_fee_defaults_created_by on public.school_fee_defaults using btree (created_by);
create index if not exists idx_school_fee_defaults_updated_by on public.school_fee_defaults using btree (updated_by);
create index if not exists idx_session_reconcile_log_session_started on public.session_reconcile_log using btree (session_label, started_at DESC);
create unique index if not exists idx_setup_progress_active_singleton on public.setup_progress using btree (is_active) where is_active;
create index if not exists idx_setup_progress_created_by on public.setup_progress using btree (created_by);
create index if not exists idx_setup_progress_updated_by on public.setup_progress using btree (updated_by);
create unique index if not exists idx_student_carry_forward_active_unique on public.student_carry_forward_balances using btree (student_id, source_session_label, target_session_label, fee_head) where (status <> 'cancelled'::text);
create unique index if not exists idx_student_carry_forward_installment_unique on public.student_carry_forward_balances using btree (backing_installment_id) where (backing_installment_id IS NOT NULL);
create index if not exists idx_student_carry_forward_student on public.student_carry_forward_balances using btree (student_id, target_session_label);
create index if not exists idx_student_carry_forward_target_session on public.student_carry_forward_balances using btree (target_session_label, status, source_session_label);
create index if not exists student_collection_flags_session_idx on public.student_collection_flags using btree (session_label) where (no_call = true);
create unique index if not exists idx_student_conventional_discount_active_policy on public.student_conventional_discount_assignments using btree (student_id, academic_session_label, policy_id) where is_active;
create index if not exists idx_student_conventional_discount_assignments_family_group on public.student_conventional_discount_assignments using btree (family_group_id);
create index if not exists idx_student_conventional_discount_policy on public.student_conventional_discount_assignments using btree (policy_id, academic_session_label, is_active);
create index if not exists idx_student_conventional_discount_student_session on public.student_conventional_discount_assignments using btree (student_id, academic_session_label, is_active);
create index if not exists scda_applied_by_idx on public.student_conventional_discount_assignments using btree (applied_by);
create index if not exists student_family_groups_created_by_idx on public.student_family_groups using btree (created_by);
create index if not exists student_family_groups_updated_by_idx on public.student_family_groups using btree (updated_by);
create index if not exists idx_student_family_members_group on public.student_family_members using btree (family_group_id);
create index if not exists idx_student_family_members_student on public.student_family_members using btree (student_id, academic_session_label);
create unique index if not exists idx_student_family_members_student_session_unique on public.student_family_members using btree (student_id, academic_session_label);
create unique index if not exists idx_student_fee_overrides_active_per_student on public.student_fee_overrides using btree (student_id) where is_active;
create index if not exists idx_student_fee_overrides_created_by on public.student_fee_overrides using btree (created_by);
create index if not exists idx_student_fee_overrides_fee_setting on public.student_fee_overrides using btree (fee_setting_id);
create index if not exists idx_student_fee_overrides_updated_by on public.student_fee_overrides using btree (updated_by);
create index if not exists student_late_fee_waivers_installment_idx on public.student_late_fee_waivers using btree (installment_id) where (voided_at IS NULL);
create unique index if not exists student_late_fee_waivers_request_idx on public.student_late_fee_waivers using btree (student_id, client_request_id, installment_id) where (client_request_id IS NOT NULL);
create index if not exists student_late_fee_waivers_student_session_idx on public.student_late_fee_waivers using btree (student_id, session_label);
create index if not exists student_late_fee_waivers_waived_by_idx on public.student_late_fee_waivers using btree (waived_by);
create index if not exists idx_student_session_reanchor_log_batch on public.student_session_reanchor_log using btree (batch_id, run_at DESC) where (batch_id IS NOT NULL);
create index if not exists idx_student_session_reanchor_log_student on public.student_session_reanchor_log using btree (student_id, run_at DESC);
create index if not exists idx_student_share_links_active on public.student_share_links using btree (revoked_at, expires_at);
create index if not exists idx_student_share_links_student on public.student_share_links using btree (student_id, created_at DESC);
create index if not exists student_share_links_created_by_idx on public.student_share_links using btree (created_by);
create index if not exists idx_students_active_class_name on public.students using btree (class_id, lower(full_name)) where (status = 'active'::student_status);
create index if not exists idx_students_active_route_name on public.students using btree (transport_route_id, lower(full_name)) where ((status = 'active'::student_status) AND (transport_route_id IS NOT NULL));
create index if not exists idx_students_active_session_dashboard on public.students using btree (status, class_id) where (status = 'active'::student_status);
create index if not exists idx_students_admission_no_lookup on public.students using btree (admission_no);
create index if not exists idx_students_class_id on public.students using btree (class_id);
create index if not exists idx_students_class_status on public.students using btree (class_id, status);
create index if not exists idx_students_created_by on public.students using btree (created_by);
create index if not exists idx_students_full_name on public.students using btree (lower(full_name));
create index if not exists idx_students_primary_phone_lookup on public.students using btree (primary_phone) where ((primary_phone IS NOT NULL) AND (TRIM(BOTH FROM primary_phone) <> ''::text));
create index if not exists idx_students_transport_route on public.students using btree (transport_route_id) where (transport_route_id IS NOT NULL);
create index if not exists idx_students_updated_by on public.students using btree (updated_by);
create index if not exists idx_transport_routes_active on public.transport_routes using btree (is_active, route_name);
create index if not exists idx_transport_routes_annual_fee_amount on public.transport_routes using btree (annual_fee_amount) where (annual_fee_amount IS NOT NULL);
create index if not exists idx_transport_routes_created_by on public.transport_routes using btree (created_by);
create unique index if not exists idx_transport_routes_unique_active_name_ci on public.transport_routes using btree (lower(route_name)) where is_active;
create index if not exists idx_transport_routes_updated_by on public.transport_routes using btree (updated_by);
create index if not exists user_activity_events_kind_recent_idx on public.user_activity_events using btree (kind, created_at DESC);
create index if not exists user_activity_events_ref_recent_idx on public.user_activity_events using btree (ref_id, created_at DESC) where (ref_id IS NOT NULL);
create index if not exists user_activity_events_user_recent_idx on public.user_activity_events using btree (user_id, created_at DESC);
create index if not exists idx_users_created_by on public.users using btree (created_by);
create index if not exists idx_users_updated_by on public.users using btree (updated_by);
create index if not exists whatsapp_templates_active_idx on public.whatsapp_templates using btree (is_active, category, name);


-- Functions reference views and views reference functions; see the header.
set check_function_bodies = off;


-- Functions and procedures --------------------------------------------------

create or replace function private.capture_audit_event()
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

create or replace function private.current_staff_role()
 RETURNS staff_role
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'private'
AS $function$
  select coalesce(
    (
      select u.role
      from public.users as u
      where u.id = auth.uid()
        and u.is_active = true
      limit 1
    ),
    'view_only'::public.staff_role
  );
$function$
;

create or replace function private.enforce_max_active_conventional_discounts()
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

create or replace function private.enforce_max_active_conventional_discounts_in_schema()
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

create or replace function private.enforce_third_child_traceability()
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

create or replace function private.ensure_single_current_academic_session()
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

create or replace function private.normalize_staff_role(p_role text)
 RETURNS staff_role
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

create or replace function private.normalize_workbook_class_label(p_class_name text, p_stream_name text DEFAULT NULL::text)
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

create or replace function private.prevent_append_only_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'private', 'public', 'pg_temp'
AS $function$
begin
  raise exception '% is append-only and cannot be updated or deleted.', tg_table_name;
end;
$function$
;

create or replace function private.prevent_notion_sync_log_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
begin
  raise exception 'Notion sync log is append-only.';
end;
$function$
;

create or replace function private.prevent_receipt_adjustment_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'private', 'public', 'pg_temp'
AS $function$
begin
  raise exception 'Receipt adjustments are append-only.';
end;
$function$
;

create or replace function private.set_actor_columns()
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

create or replace function private.set_created_by_column()
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

create or replace function private.set_updated_at()
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

create or replace function private.sync_staff_profile_from_auth_user()
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

create or replace function private.vpps_apply_chunk(p_kind text, p_rows jsonb)
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

create or replace function private.workbook_installment_snapshot(p_student_id uuid DEFAULT NULL::uuid, p_as_of_date date DEFAULT CURRENT_DATE, p_include_candidate_late boolean DEFAULT false)
 RETURNS TABLE(installment_id uuid, student_id uuid, admission_no text, student_name text, father_name text, father_phone text, session_label text, class_id uuid, class_name text, class_label text, section text, stream_name text, installment_no smallint, installment_label text, due_date date, base_charge integer, paid_amount integer, adjustment_amount integer, applied_amount integer, raw_late_fee integer, waiver_applied integer, final_late_fee integer, total_charge integer, pending_amount integer, balance_status text, last_payment_date date, transport_route_id uuid, transport_route_name text, transport_route_code text)
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
      i.late_fee_flat_amount, s.transport_route_id,
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
      -- Each bucket nets only the adjustments belonging to it, so reversing a
      -- non-cash write-off cannot be swallowed by the cash floor.
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
      greatest(rolled.base_charge - greatest(rolled.applied_amount + rolled.discount_closeout_amount, 0), 0)::integer as base_pending_amount,
      case
        when rolled.installment_status = 'waived' then 0
        when coalesce(rolled.late_fee_flat_amount, 0) <= 0 then 0
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
  )
  select
    waiver_eval.installment_id, waiver_eval.student_id, waiver_eval.admission_no,
    waiver_eval.student_name, waiver_eval.father_name, waiver_eval.father_phone,
    waiver_eval.session_label, waiver_eval.class_id, waiver_eval.class_name,
    waiver_eval.class_label, waiver_eval.section, waiver_eval.stream_name,
    waiver_eval.installment_no, waiver_eval.installment_label, waiver_eval.due_date,
    waiver_eval.base_charge, waiver_eval.paid_amount, waiver_eval.adjustment_amount,
    waiver_eval.applied_amount, waiver_eval.raw_late_fee, waiver_eval.waiver_applied,
    greatest(waiver_eval.raw_late_fee - waiver_eval.waiver_applied, 0)::integer as final_late_fee,
    greatest(waiver_eval.base_charge + waiver_eval.raw_late_fee - waiver_eval.waiver_applied, 0)::integer as total_charge,
    greatest(
      waiver_eval.base_charge + waiver_eval.raw_late_fee - waiver_eval.waiver_applied
        - waiver_eval.applied_amount - waiver_eval.discount_closeout_amount, 0
    )::integer as pending_amount,
    case
      when waiver_eval.installment_status = 'waived' then 'waived'
      when greatest(
        waiver_eval.base_charge + waiver_eval.raw_late_fee - waiver_eval.waiver_applied
          - waiver_eval.applied_amount - waiver_eval.discount_closeout_amount, 0) <= 0 then 'paid'
      when waiver_eval.applied_amount > 0 or waiver_eval.discount_closeout_amount > 0 then 'partial'
      when p_as_of_date > waiver_eval.due_date then 'overdue'
      else 'pending'
    end as balance_status,
    waiver_eval.last_payment_date, waiver_eval.transport_route_id,
    waiver_eval.transport_route_name, waiver_eval.transport_route_code
  from waiver_eval
  order by waiver_eval.student_id, waiver_eval.installment_no;
$function$
;

create or replace function public.active_session_label()
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
  select value from public.app_settings where key = 'active_session_label'
$function$
;

create or replace function public.delete_academic_session_safe(p_session_id uuid)
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

create or replace function public.get_dashboard_fee_split(p_session_label text)
 RETURNS TABLE(current_year_expected integer, current_year_collected integer, current_year_pending integer, previous_year_original integer, previous_year_collected integer, previous_year_pending integer, late_fee_pending integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
  with scoped as (
    select
      b.is_carry_forward,
      b.base_charge,
      b.applied_amount,
      b.pending_amount,
      b.final_late_fee
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
      is_carry_forward,
      base_charge,
      least(greatest(applied_amount, 0), base_charge) as collected_against_base,
      pending_amount,
      least(greatest(final_late_fee, 0), pending_amount) as late_pending
    from scoped
  )
  select
    coalesce(sum(base_charge)             filter (where not is_carry_forward), 0)::integer,
    coalesce(sum(collected_against_base)  filter (where not is_carry_forward), 0)::integer,
    coalesce(sum(pending_amount - late_pending)
                                          filter (where not is_carry_forward), 0)::integer,
    coalesce(sum(base_charge)             filter (where is_carry_forward), 0)::integer,
    coalesce(sum(collected_against_base)  filter (where is_carry_forward), 0)::integer,
    coalesce(sum(pending_amount)          filter (where is_carry_forward), 0)::integer,
    coalesce(sum(late_pending)            filter (where not is_carry_forward), 0)::integer
  from per_row;
$function$
;

create or replace function public.get_dashboard_summary(p_session_label text, p_today text)
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

create or replace function public.get_student_directory_summary(p_session_label text, p_class_id uuid DEFAULT NULL::uuid, p_route_id uuid DEFAULT NULL::uuid, p_query text DEFAULT NULL::text, p_statuses text[] DEFAULT NULL::text[], p_active_classes_only boolean DEFAULT true)
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
        'fullyPaid',           count(*) filter (where seg_fully_paid),
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
        'lateFeeWaived',       count(*) filter (where seg_late_fee_waived)
      ) from scoped
    )
  );
$function$
;

create or replace function public.has_any_permission(p_permissions text[])
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

create or replace function public.has_permission(p_permission text)
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

create or replace function public.import_student_batch_row(p_batch_id uuid, p_row_index integer, p_full_name text, p_class_id uuid, p_admission_no text, p_date_of_birth date, p_father_name text, p_mother_name text, p_primary_phone text, p_secondary_phone text, p_address text, p_transport_route_id uuid, p_status student_status, p_notes text, p_custom_tuition_fee_amount integer, p_custom_transport_fee_amount integer, p_custom_books_fee_amount integer, p_custom_admission_activity_misc_fee_amount integer, p_custom_other_fee_heads jsonb, p_custom_late_fee_flat_amount integer, p_discount_amount integer, p_student_type_override text, p_transport_applies_override boolean)
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

create or replace function public.import_student_batch_row(p_batch_id uuid, p_row_index integer, p_full_name text, p_class_id uuid, p_admission_no text, p_date_of_birth date, p_father_name text, p_mother_name text, p_primary_phone text, p_secondary_phone text, p_address text, p_transport_route_id uuid, p_status student_status, p_notes text, p_custom_tuition_fee_amount integer, p_custom_transport_fee_amount integer, p_custom_books_fee_amount integer, p_custom_admission_activity_misc_fee_amount integer, p_custom_other_fee_heads jsonb, p_custom_late_fee_flat_amount integer, p_discount_amount integer, p_student_type_override text, p_transport_applies_override boolean, p_other_adjustment_head text DEFAULT NULL::text, p_other_adjustment_amount integer DEFAULT NULL::integer, p_late_fee_waiver_amount integer DEFAULT 0)
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

create or replace function public.post_student_payment(p_student_id uuid, p_payment_date date, p_payment_mode payment_mode, p_total_amount integer, p_reference_number text DEFAULT NULL::text, p_remarks text DEFAULT NULL::text, p_received_by text DEFAULT NULL::text, p_receipt_prefix text DEFAULT 'SVP'::text, p_client_request_id uuid DEFAULT NULL::uuid)
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
    select coalesce(sum(snapshot_row.pending_amount), 0)
    into total_outstanding
    from private.workbook_installment_snapshot(
      p_student_id,
      p_payment_date,
      true
    ) as snapshot_row
    where snapshot_row.pending_amount > 0;
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
        snapshot_row.pending_amount
      from private.workbook_installment_snapshot(
        p_student_id,
        p_payment_date,
        true
      ) as snapshot_row
      where snapshot_row.pending_amount > 0
      order by snapshot_row.due_date asc, snapshot_row.installment_no asc
    loop
      exit when remaining_amount <= 0;

      allocation_amount := least(remaining_amount, balance_row.pending_amount);

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

create or replace function public.post_student_payment_with_adjustments(p_student_id uuid, p_payment_date date, p_payment_mode payment_mode, p_total_amount integer, p_reference_number text DEFAULT NULL::text, p_remarks text DEFAULT NULL::text, p_received_by text DEFAULT NULL::text, p_receipt_prefix text DEFAULT 'SVP'::text, p_client_request_id uuid DEFAULT NULL::uuid, p_quick_discount_amount integer DEFAULT 0, p_quick_late_fee_waiver_amount integer DEFAULT 0)
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

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'installment_id', snapshot_row.installment_id,
        'pending_amount', snapshot_row.pending_amount,
        'due_date', snapshot_row.due_date,
        'installment_no', snapshot_row.installment_no
      )
      order by snapshot_row.due_date asc, snapshot_row.installment_no asc
    ),
    '[]'::jsonb
  )
  into v_workbook_snapshot
  from private.workbook_installment_snapshot(p_student_id, p_payment_date, true) as snapshot_row;

  select coalesce(sum(snapshot.pending_amount), 0)
  into v_total_pending
  from jsonb_to_recordset(v_workbook_snapshot) as snapshot(
    installment_id uuid,
    pending_amount integer,
    due_date date,
    installment_no smallint
  )
  where snapshot.pending_amount > 0;

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
    select snapshot.installment_id, snapshot.pending_amount, snapshot.due_date, snapshot.installment_no
    from jsonb_to_recordset(v_workbook_snapshot) as snapshot(
      installment_id uuid,
      pending_amount integer,
      due_date date,
      installment_no smallint
    )
    where snapshot.pending_amount > 0
    order by snapshot.due_date asc, snapshot.installment_no asc
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
    end if;
  end loop;

  if v_remaining_payment <> 0 or v_remaining_discount <> 0 or v_remaining_waiver <> 0 then
    raise exception 'Unable to allocate payment and concessions cleanly. Please retry.';
  end if;

  return query select v_candidate_receipt_id, v_candidate_receipt_number, p_total_amount;
end;
$function$
;

create or replace function public.preview_workbook_payment_allocation(p_student_id uuid, p_payment_date date)
 RETURNS TABLE(installment_id uuid, student_id uuid, admission_no text, student_name text, father_name text, father_phone text, session_label text, class_id uuid, class_name text, class_label text, section text, stream_name text, installment_no smallint, installment_label text, is_carry_forward boolean, source_session_label text, target_session_label text, carry_forward_fee_head text, due_date date, base_charge integer, paid_amount integer, adjustment_amount integer, applied_amount integer, raw_late_fee integer, waiver_applied integer, final_late_fee integer, total_charge integer, pending_amount integer, balance_status text, last_payment_date date, transport_route_id uuid, transport_route_name text, transport_route_code text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
  select
    snapshot_row.installment_id,
    snapshot_row.student_id,
    snapshot_row.admission_no,
    snapshot_row.student_name,
    snapshot_row.father_name,
    snapshot_row.father_phone,
    snapshot_row.session_label,
    snapshot_row.class_id,
    snapshot_row.class_name,
    snapshot_row.class_label,
    snapshot_row.section,
    snapshot_row.stream_name,
    snapshot_row.installment_no,
    snapshot_row.installment_label,
    coalesce(installment_row.is_carry_forward, false) as is_carry_forward,
    installment_row.source_session_label,
    installment_row.target_session_label,
    installment_row.carry_forward_fee_head,
    snapshot_row.due_date,
    snapshot_row.base_charge,
    snapshot_row.paid_amount,
    snapshot_row.adjustment_amount,
    snapshot_row.applied_amount,
    snapshot_row.raw_late_fee,
    snapshot_row.waiver_applied,
    snapshot_row.final_late_fee,
    snapshot_row.total_charge,
    snapshot_row.pending_amount,
    snapshot_row.balance_status,
    snapshot_row.last_payment_date,
    snapshot_row.transport_route_id,
    snapshot_row.transport_route_name,
    snapshot_row.transport_route_code
  from private.workbook_installment_snapshot(p_student_id, p_payment_date, true) as snapshot_row
  join public.installments as installment_row
    on installment_row.id = snapshot_row.installment_id
  where (
    coalesce(auth.role(), '') = 'service_role'
    or public.has_any_permission(array[
      'payments:view',
      'payments:write',
      'ledger:view',
      'receipts:view',
      'dashboard:view',
      'finance:view'
    ])
  )
    and snapshot_row.pending_amount > 0
  order by snapshot_row.due_date asc, snapshot_row.installment_no asc;
$function$
;

create or replace function public.process_refund_with_adjustment(p_refund_request_id uuid)
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

create or replace function public.queue_sibling_groups_refresh()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.workbook_materialized_view_refresh_queue
    (queue_key, pending, requested_at, request_count)
  values ('sibling_groups', true, now(), 1)
  on conflict (queue_key) do update
    set pending = true,
        requested_at = excluded.requested_at,
        request_count = public.workbook_materialized_view_refresh_queue.request_count + 1;

  return null;
end;
$function$
;

create or replace function public.queue_workbook_materialized_view_refresh()
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

create or replace function public.realign_recent_import_students_to_active_session(p_run_by uuid DEFAULT NULL::uuid)
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

create or replace function public.refresh_defaulter_recovery_state(p_session_label text, p_today date DEFAULT CURRENT_DATE)
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

create or replace function public.refresh_financial_materialized_views(p_concurrently boolean DEFAULT true)
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

create or replace function public.refresh_sibling_groups_if_requested()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_requested_at timestamptz;
begin
  select requested_at
    into v_requested_at
  from public.workbook_materialized_view_refresh_queue
  where queue_key = 'sibling_groups'
    and pending = true
  for update skip locked;

  if v_requested_at is null then
    return false;
  end if;

  refresh materialized view concurrently public.mv_student_sibling_groups;

  update public.workbook_materialized_view_refresh_queue
  set pending = false,
      last_refreshed_at = now(),
      request_count = 0
  where queue_key = 'sibling_groups';

  return true;
end;
$function$
;

create or replace function public.refresh_workbook_materialized_views_if_requested()
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

create or replace function public.rls_auto_enable()
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

create or replace function public.set_my_preferred_locale(p_locale text)
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

create or replace function public.trigger_refresh_financial_views()
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

create or replace function public.undo_recent_payment(p_receipt_id uuid, p_reason text DEFAULT NULL::text)
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

create or replace function public.void_late_fee_waiver(p_waiver_id uuid, p_reason text)
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

create or replace function public.vpps_apply_chunk_proxy(p_kind text, p_rows jsonb)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
  select private.vpps_apply_chunk(p_kind, p_rows);
$function$
;

create or replace function public.waive_late_fee(p_student_id uuid, p_amount integer, p_remarks text, p_session_label text DEFAULT NULL::text, p_client_request_id uuid DEFAULT NULL::uuid, p_installment_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(ok boolean, message text, new_waiver_amount integer, added_amount integer)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_pending_late_fee integer;
  v_charged_late_fee integer;
  v_remaining integer;
  v_take integer;
  v_added integer := 0;
  v_total_waiver integer;
  v_today text;
  v_audit text;
  v_row record;
  v_already_added integer;
begin
  if not public.has_permission('payments:waive_late_fee') then
    raise exception 'You do not have permission to waive late fees.';
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

  -- `remaining` is the late fee still OWED on the installment, not the late fee
  -- charged. pending_amount is what the installment has left outstanding across
  -- base and late fee together, so capping against it means a payment that has
  -- already covered the late fee removes it from the waivable pool.
  create temporary table _waivable on commit drop as
  select
    snap.installment_id,
    snap.installment_no,
    snap.due_date,
    snap.session_label,
    greatest(snap.final_late_fee, 0)::integer as charged,
    least(
      greatest(snap.final_late_fee, 0),
      greatest(snap.pending_amount, 0)
    )::integer as remaining
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
    -- Distinguish "there is no late fee" from "the late fee is already paid".
    -- They call for different actions, and telling a cashier the student has no
    -- late fee when the receipt in their hand says otherwise is worse than
    -- refusing.
    if v_charged_late_fee > 0 then
      return query select
        false,
        'This late fee has already been paid, so it cannot be waived. Reverse the receipt or raise a refund if it was collected in error.'::text,
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
      format('Waiver cannot exceed the current pending late fee (%s).', v_pending_late_fee)::text,
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
    if v_take > 0 then
      insert into public.student_late_fee_waivers (
        student_id, installment_id, session_label, amount, reason,
        source, client_request_id, waived_by
      ) values (
        p_student_id, v_row.installment_id, v_row.session_label, v_take, v_audit,
        case when p_installment_id is null then 'manual' else 'payment_desk' end,
        p_client_request_id, auth.uid()
      );
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


set check_function_bodies = on;


-- Views and materialized views (dependency order) ---------------------------

create or replace view public.v_effective_late_fee_waivers
with (security_invoker = true) as
 SELECT installment_id,
    student_id,
    sum(amount)::integer AS waiver_amount
   FROM student_late_fee_waivers
  WHERE voided_at IS NULL
  GROUP BY installment_id, student_id;

create or replace view public.v_installment_balances
with (security_invoker = true) as
 WITH payment_totals AS (
         SELECT payments.installment_id,
            COALESCE(sum(payments.amount), 0::bigint) AS payments_total
           FROM payments
          GROUP BY payments.installment_id
        ), adjustment_totals AS (
         SELECT payment_adjustments.installment_id,
            COALESCE(sum(payment_adjustments.amount_delta), 0::bigint) AS adjustments_total
           FROM payment_adjustments
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
            WHEN installments.status = 'waived'::installment_status THEN 0::bigint
            ELSE GREATEST(installments.amount_due - (COALESCE(payment_totals.payments_total, 0::bigint) + COALESCE(adjustment_totals.adjustments_total, 0::bigint)), 0::bigint)
        END AS outstanding_amount,
        CASE
            WHEN installments.status = 'waived'::installment_status THEN 'waived'::text
            WHEN installments.status = 'cancelled'::installment_status THEN 'cancelled'::text
            WHEN GREATEST(installments.amount_due - (COALESCE(payment_totals.payments_total, 0::bigint) + COALESCE(adjustment_totals.adjustments_total, 0::bigint)), 0::bigint) = 0 THEN 'paid'::text
            WHEN (COALESCE(payment_totals.payments_total, 0::bigint) + COALESCE(adjustment_totals.adjustments_total, 0::bigint)) > 0 THEN 'partial'::text
            WHEN CURRENT_DATE > installments.due_date THEN 'overdue'::text
            ELSE 'pending'::text
        END AS balance_status,
    students.transport_route_id,
    routes.route_name AS transport_route_name,
    routes.route_code AS transport_route_code
   FROM installments
     JOIN students ON students.id = installments.student_id
     JOIN classes ON classes.id = installments.class_id
     LEFT JOIN transport_routes routes ON routes.id = students.transport_route_id
     LEFT JOIN payment_totals ON payment_totals.installment_id = installments.id
     LEFT JOIN adjustment_totals ON adjustment_totals.installment_id = installments.id
  WHERE installments.status <> 'cancelled'::installment_status;

create or replace view public.v_receipt_effective_allocation_totals
with (security_invoker = true) as
 WITH payment_effective AS (
         SELECT payment_row.id AS payment_id,
            payment_row.receipt_id,
            payment_row.amount::bigint AS original_amount,
            COALESCE(sum(adjustment_row.amount_delta), 0::bigint) AS adjustment_amount
           FROM payments payment_row
             LEFT JOIN payment_adjustments adjustment_row ON adjustment_row.payment_id = payment_row.id AND adjustment_row.adjustment_type = 'correction'::adjustment_type
          GROUP BY payment_row.id, payment_row.receipt_id, payment_row.amount
        )
 SELECT receipt_row.id AS receipt_id,
    receipt_row.student_id,
    receipt_row.total_amount::bigint AS receipt_total,
    COALESCE(sum(payment_effective.original_amount), 0::numeric)::bigint AS original_allocation_total,
    COALESCE(sum(payment_effective.adjustment_amount), 0::numeric)::bigint AS adjustment_total,
    COALESCE(sum(payment_effective.original_amount + payment_effective.adjustment_amount), 0::numeric)::bigint AS effective_allocation_total,
    (COALESCE(sum(payment_effective.original_amount + payment_effective.adjustment_amount), 0::numeric) - receipt_row.total_amount::numeric)::bigint AS variance
   FROM receipts receipt_row
     LEFT JOIN payment_effective ON payment_effective.receipt_id = receipt_row.id
  GROUP BY receipt_row.id, receipt_row.student_id, receipt_row.total_amount;

create or replace view public.v_receipt_reversal_totals
with (security_invoker = true) as
 SELECT p.receipt_id,
    sum(- a.amount_delta)::integer AS reversed_amount
   FROM payment_adjustments a
     JOIN payments p ON p.id = a.payment_id
  WHERE a.adjustment_type = 'reversal'::adjustment_type AND a.amount_delta < 0
  GROUP BY p.receipt_id;

create or replace view public.v_student_conventional_discounts
with (security_invoker = true) as
 SELECT a.student_id,
    a.academic_session_label AS session_label,
    array_agg(p.code ORDER BY p.sort_order, p.code) AS policy_codes,
    string_agg(p.display_name, ', '::text ORDER BY p.sort_order, p.display_name) AS policy_labels
   FROM student_conventional_discount_assignments a
     JOIN conventional_discount_policies p ON p.id = a.policy_id
  WHERE a.is_active
  GROUP BY a.student_id, a.academic_session_label;

create or replace view public.v_student_manual_late_fee_waivers
with (security_invoker = true) as
 SELECT student_id,
    session_label,
    count(*)::integer AS manual_waiver_count,
    sum(amount)::integer AS manual_waiver_amount
   FROM student_late_fee_waivers w
  WHERE voided_at IS NULL AND (source = ANY (ARRAY['manual'::text, 'payment_desk'::text]))
  GROUP BY student_id, session_label;

create or replace view public.v_student_sibling_groups
with (security_invoker = true) as
 WITH student_phones AS (
         SELECT s.id AS student_id,
            c.session_label,
            s.father_name,
            regexp_replace(COALESCE(raw_phone.raw_value, ''::text), '[^0-9]'::text, ''::text, 'g'::text) AS normalized_phone
           FROM students s
             JOIN classes c ON c.id = s.class_id
             CROSS JOIN LATERAL ( VALUES (s.primary_phone), (s.secondary_phone)) raw_phone(raw_value)
          WHERE s.status = 'active'::student_status
        ), valid_student_phones AS (
         SELECT DISTINCT student_phones.student_id,
            student_phones.session_label,
            student_phones.father_name,
            student_phones.normalized_phone
           FROM student_phones
          WHERE student_phones.normalized_phone ~ '^[0-9]{10}$'::text AND (student_phones.normalized_phone <> ALL (ARRAY['9999999999'::text, '0000000000'::text, '1234567890'::text])) AND student_phones.normalized_phone !~ '^([0-9])\1{9}$'::text AND student_phones.normalized_phone !~ '([0-9])\1{6,}'::text
        ), phone_groups AS (
         SELECT valid_student_phones.session_label,
            valid_student_phones.normalized_phone,
            array_agg(valid_student_phones.student_id ORDER BY valid_student_phones.student_id) AS student_ids,
            count(DISTINCT valid_student_phones.student_id)::integer AS student_count
           FROM valid_student_phones
          GROUP BY valid_student_phones.session_label, valid_student_phones.normalized_phone
         HAVING count(DISTINCT valid_student_phones.student_id) >= 2
        ), detected_groups AS (
         SELECT md5(array_to_string(phone_groups.student_ids, '|'::text)) AS group_key,
            phone_groups.session_label,
            phone_groups.student_ids,
            phone_groups.student_count,
            array_agg(phone_groups.normalized_phone ORDER BY phone_groups.normalized_phone) AS phone_match
           FROM phone_groups
          GROUP BY phone_groups.session_label, phone_groups.student_ids, phone_groups.student_count
        ), existing_groups AS (
         SELECT group_record.id AS family_group_id,
            group_record.academic_session_label AS session_label,
            array_agg(member.student_id ORDER BY member.student_id) AS student_ids
           FROM student_family_groups group_record
             JOIN student_family_members member ON member.family_group_id = group_record.id AND member.academic_session_label = group_record.academic_session_label
          GROUP BY group_record.id, group_record.academic_session_label
        ), father_matches AS (
         SELECT detected_1.group_key,
            count(DISTINCT normalized_father.normalized_name) = 1 AND min(normalized_father.normalized_name) <> ''::text AS father_name_match
           FROM detected_groups detected_1
             JOIN students s ON s.id = ANY (detected_1.student_ids)
             CROSS JOIN LATERAL ( SELECT TRIM(BOTH FROM regexp_replace(regexp_replace(lower(COALESCE(s.father_name, ''::text)), '[^[:alnum:][:space:]]'::text, ' '::text, 'g'::text), '\s+'::text, ' '::text, 'g'::text)) AS normalized_name) normalized_father
          GROUP BY detected_1.group_key
        )
 SELECT detected.group_key,
    detected.session_label,
    detected.student_ids,
    detected.student_count,
    detected.phone_match,
    COALESCE(father_matches.father_name_match, false) AS father_name_match,
        CASE
            WHEN existing.family_group_id IS NOT NULL THEN 'confirmed'::text
            ELSE 'suspected'::text
        END AS confidence,
    existing.family_group_id AS existing_family_group_id
   FROM detected_groups detected
     LEFT JOIN father_matches ON father_matches.group_key = detected.group_key
     LEFT JOIN LATERAL ( SELECT existing_groups.family_group_id
           FROM existing_groups
          WHERE existing_groups.session_label = detected.session_label AND detected.student_ids <@ existing_groups.student_ids
          ORDER BY (array_length(existing_groups.student_ids, 1)), existing_groups.family_group_id
         LIMIT 1) existing ON true;

create materialized view if not exists public.mv_student_sibling_groups as
 SELECT group_key,
    session_label,
    student_ids,
    student_count,
    phone_match,
    father_name_match,
    confidence,
    existing_family_group_id
   FROM v_student_sibling_groups;

create or replace view public.v_notion_daily_summary
with (security_invoker = true) as
 SELECT session_label,
    count(DISTINCT student_id) AS total_students,
    sum(amount_due) AS total_due,
    sum(payments_total) AS total_paid,
    sum(outstanding_amount) AS total_pending,
    count(DISTINCT student_id) FILTER (WHERE balance_status = 'overdue'::text) AS defaulter_count,
    ( SELECT COALESCE(sum(p.amount), 0::bigint) AS "coalesce"
           FROM payments p
             JOIN installments i ON i.id = p.installment_id
          WHERE p.created_at::date = CURRENT_DATE) AS collected_today,
    now() AS computed_at
   FROM v_installment_balances b
  GROUP BY session_label;

create or replace view public.v_notion_student_fee_sync
with (security_invoker = true) as
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
           FROM v_installment_balances
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
           FROM payments p
          GROUP BY p.student_id
        ), last_pay_amt AS (
         SELECT DISTINCT ON (p.student_id) p.student_id,
            p.created_at AS last_payment_at,
            p.amount AS last_payment_amount
           FROM payments p
          ORDER BY p.student_id, p.created_at DESC
        ), fam AS (
         SELECT sfm.student_id,
            sfm.academic_session_label,
            sfg.family_label,
            sfg.guardian_name,
            sfg.guardian_phone,
            sfg.id AS family_group_id
           FROM student_family_members sfm
             JOIN student_family_groups sfg ON sfg.id = sfm.family_group_id
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
     JOIN students s ON s.id = sr.student_id
     LEFT JOIN last_pay_amt lpa ON lpa.student_id = sr.student_id
     LEFT JOIN fam f ON f.student_id = sr.student_id AND f.academic_session_label = sr.session_label;

create or replace view public.v_outstanding_summary
with (security_invoker = true) as
 SELECT session_label,
    class_name,
    section,
    stream_name,
    count(DISTINCT student_id) FILTER (WHERE outstanding_amount > 0) AS students_with_dues,
    count(*) FILTER (WHERE outstanding_amount > 0) AS open_installments,
    COALESCE(sum(outstanding_amount), 0::numeric) AS outstanding_amount
   FROM v_installment_balances
  WHERE balance_status <> ALL (ARRAY['paid'::text, 'cancelled'::text])
  GROUP BY session_label, class_name, section, stream_name;

create or replace view public.v_transport_route_outstanding
with (security_invoker = true) as
 SELECT COALESCE(transport_route_id::text, 'unassigned'::text) AS route_bucket,
    transport_route_id,
    COALESCE(transport_route_name, 'No route'::text) AS route_name,
    transport_route_code,
    count(DISTINCT student_id) AS students_with_dues,
    count(*) AS open_installments,
    count(*) FILTER (WHERE balance_status = 'overdue'::text) AS overdue_installments,
    COALESCE(sum(outstanding_amount), 0::numeric) AS outstanding_amount
   FROM v_installment_balances
  WHERE outstanding_amount > 0 AND (balance_status = ANY (ARRAY['partial'::text, 'overdue'::text, 'pending'::text]))
  GROUP BY (COALESCE(transport_route_id::text, 'unassigned'::text)), transport_route_id, (COALESCE(transport_route_name, 'No route'::text)), transport_route_code;

create materialized view if not exists public.v_workbook_installment_balances as
 WITH session_policy AS (
         SELECT DISTINCT ON (fee_policy_configs.academic_session_label) fee_policy_configs.academic_session_label
           FROM fee_policy_configs
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
            i.is_carry_forward,
            i.source_session_label,
            s.transport_route_id,
            route_row.route_name AS transport_route_name,
            route_row.route_code AS transport_route_code
           FROM installments i
             JOIN students s ON s.id = i.student_id
             JOIN classes c ON c.id = i.class_id
             JOIN session_policy policy_row ON policy_row.academic_session_label = c.session_label
             LEFT JOIN transport_routes route_row ON route_row.id = s.transport_route_id
          WHERE i.status <> 'cancelled'::installment_status
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
             LEFT JOIN LATERAL ( SELECT COALESCE(sum(payment_row_1.amount) FILTER (WHERE receipt_row.payment_mode <> 'discount'::payment_mode), 0::bigint) AS paid_amount,
                    COALESCE(sum(payment_row_1.amount) FILTER (WHERE receipt_row.payment_mode = 'discount'::payment_mode), 0::bigint) AS discount_closeout_amount,
                    COALESCE(sum(payment_row_1.amount) FILTER (WHERE receipt_row.payment_date <= session_installments.due_date AND receipt_row.payment_mode <> 'discount'::payment_mode), 0::bigint) AS paid_by_due_amount,
                    COALESCE(sum(payment_row_1.amount) FILTER (WHERE receipt_row.payment_date <= session_installments.due_date AND receipt_row.payment_mode = 'discount'::payment_mode), 0::bigint) AS closeout_by_due_amount,
                    max(receipt_row.payment_date) AS last_payment_date
                   FROM payments payment_row_1
                     JOIN receipts receipt_row ON receipt_row.id = payment_row_1.receipt_id
                  WHERE payment_row_1.installment_id = session_installments.installment_id) payment_row ON true
             LEFT JOIN LATERAL ( SELECT COALESCE(sum(adj.amount_delta), 0::bigint) AS adjustment_amount,
                    COALESCE(sum(adj.amount_delta) FILTER (WHERE adj_receipt.payment_mode <> 'discount'::payment_mode), 0::bigint) AS cash_adjustment,
                    COALESCE(sum(adj.amount_delta) FILTER (WHERE adj_receipt.payment_mode = 'discount'::payment_mode), 0::bigint) AS closeout_adjustment
                   FROM payment_adjustments adj
                     JOIN payments adj_payment ON adj_payment.id = adj.payment_id
                     JOIN receipts adj_receipt ON adj_receipt.id = adj_payment.receipt_id
                  WHERE adj.installment_id = session_installments.installment_id) adjustment_row ON true
             LEFT JOIN LATERAL ( SELECT COALESCE(sum(adj.amount_delta), 0::bigint) AS adjustment_by_due_amount
                   FROM payment_adjustments adj
                     JOIN payments adj_payment ON adj_payment.id = adj.payment_id
                     JOIN receipts adj_receipt ON adj_receipt.id = adj_payment.receipt_id
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
            GREATEST(rolled.base_charge - GREATEST(rolled.applied_amount + rolled.discount_closeout_amount, 0), 0) AS base_pending_amount,
                CASE
                    WHEN rolled.installment_status = 'waived'::installment_status THEN 0
                    WHEN COALESCE(rolled.late_fee_flat_amount, 0) <= 0 THEN 0
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
            late_eval.base_pending_amount,
            late_eval.raw_late_fee,
            LEAST(late_eval.raw_late_fee, COALESCE(waiver_row.waiver_amount, 0)) AS waiver_applied
           FROM late_eval
             LEFT JOIN v_effective_late_fee_waivers waiver_row ON waiver_row.installment_id = late_eval.installment_id
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
    GREATEST(raw_late_fee - waiver_applied, 0) AS final_late_fee,
    GREATEST(base_charge + raw_late_fee - waiver_applied, 0) AS total_charge,
    GREATEST(base_charge + raw_late_fee - waiver_applied - applied_amount - discount_closeout_amount, 0) AS pending_amount,
        CASE
            WHEN installment_status = 'waived'::installment_status THEN 'waived'::text
            WHEN GREATEST(base_charge + raw_late_fee - waiver_applied - applied_amount - discount_closeout_amount, 0) <= 0 THEN 'paid'::text
            WHEN CURRENT_DATE > due_date THEN 'overdue'::text
            WHEN applied_amount > 0 OR discount_closeout_amount > 0 THEN 'partial'::text
            ELSE 'pending'::text
        END AS balance_status,
    last_payment_date,
    transport_route_id,
    transport_route_name,
    transport_route_code,
    is_carry_forward,
    source_session_label
   FROM waiver_eval;

create or replace view public.v_student_carry_forward_balances
with (security_invoker = true) as
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
   FROM student_carry_forward_balances cfb
     JOIN students s ON s.id = cfb.student_id
     JOIN installments i ON i.id = cfb.backing_installment_id
     JOIN classes c ON c.id = i.class_id
     LEFT JOIN v_workbook_installment_balances wib ON wib.installment_id = i.id;

create or replace view public.v_student_installment_facets
with (security_invoker = true) as
 SELECT student_id,
    session_label,
    count(*)::integer AS installment_count,
    count(*) FILTER (WHERE waiver_applied > 0)::integer AS late_fee_waived_count,
    COALESCE(sum(pending_amount) FILTER (WHERE is_carry_forward), 0::bigint)::integer AS carry_forward_pending_amount,
    COALESCE(sum(base_charge) FILTER (WHERE is_carry_forward), 0::bigint)::integer AS carry_forward_original_amount,
    COALESCE(sum(GREATEST(base_charge - GREATEST(paid_amount, 0) - GREATEST(adjustment_amount, 0), 0)) FILTER (WHERE balance_status = 'overdue'::text), 0::bigint)::integer AS overdue_base_amount,
    COALESCE(sum(LEAST(GREATEST(final_late_fee, 0), GREATEST(pending_amount, 0))), 0::bigint)::integer AS pending_late_fee_amount
   FROM v_workbook_installment_balances b
  GROUP BY student_id, session_label;

create materialized view if not exists public.v_workbook_student_financials as
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
           FROM students s
             JOIN classes c ON c.id = s.class_id
             JOIN session_policy ON session_policy.academic_session_label = c.session_label
             LEFT JOIN school_default ON true
             LEFT JOIN fee_settings fee_row ON fee_row.class_id = c.id AND fee_row.is_active = true
             LEFT JOIN student_fee_overrides override_row ON override_row.student_id = s.id AND override_row.is_active = true
             LEFT JOIN transport_routes route_row ON route_row.id = s.transport_route_id
             LEFT JOIN LATERAL ( SELECT LEAST(COALESCE(fee_row.tuition_fee_amount, school_default.tuition_fee_amount, 0), min(
                        CASE policy_row.calculation_type
                            WHEN 'tuition_zero'::text THEN 0
                            WHEN 'tuition_percentage'::text THEN round(COALESCE(fee_row.tuition_fee_amount, school_default.tuition_fee_amount, 0)::numeric * LEAST(GREATEST(COALESCE(policy_row.percentage, 0::numeric), 0::numeric), 100::numeric) / 100::numeric)::integer
                            ELSE GREATEST(COALESCE(policy_row.fixed_tuition_amount, 0), 0)
                        END)) AS resulting_tuition,
                    string_agg(policy_row.display_name, ', '::text ORDER BY policy_row.sort_order, policy_row.display_name) AS policy_labels
                   FROM student_conventional_discount_assignments assignment
                     JOIN conventional_discount_policies policy_row ON policy_row.id = assignment.policy_id AND policy_row.is_active = true
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
        ), students_with_ledger AS (
         SELECT DISTINCT installments.student_id
           FROM installments
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

create or replace view public.v_notion_student_fee_summary as
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
    COALESCE(f.status_label, ''::text) = 'PARTLY PAID'::text AS seg_partly_paid,
    COALESCE(f.status_label, ''::text) = 'PAID'::text AS seg_fully_paid,
    COALESCE(f.status_label, ''::text) = 'NOT STARTED'::text AS seg_never_paid,
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
    COALESCE(i.late_fee_waived_count, 0) AS any_late_fee_waived_count
   FROM students s
     JOIN classes c ON c.id = s.class_id
     LEFT JOIN transport_routes r ON r.id = s.transport_route_id
     LEFT JOIN v_workbook_student_financials f ON f.student_id = s.id
     LEFT JOIN v_student_installment_facets i ON i.student_id = s.id
     LEFT JOIN v_student_conventional_discounts d ON d.student_id = s.id AND d.session_label = c.session_label
     LEFT JOIN v_student_manual_late_fee_waivers m ON m.student_id = s.id AND m.session_label = c.session_label
     LEFT JOIN student_fee_overrides o ON o.student_id = s.id AND o.is_active;

create materialized view if not exists public.v_student_financial_state as
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

create or replace view public.v_notion_daily_collection_summary as
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

create or replace view public.v_notion_family_fee_summary as
 SELECT session,
    family_key,
    count(*)::integer AS sibling_count,
    COALESCE(sum(total_annual_fees_due), 0::bigint)::integer AS family_total_due,
    COALESCE(sum(total_paid_to_date), 0::bigint)::integer AS family_total_paid,
    COALESCE(sum(total_pending), 0::bigint)::integer AS family_total_pending,
    string_agg(student_name, ', '::text ORDER BY class, student_name) AS student_names
   FROM v_notion_student_fee_summary student_summary
  GROUP BY session, family_key;


-- Materialized view indexes -------------------------------------------------

create unique index if not exists mv_student_sibling_groups_key_idx on public.mv_student_sibling_groups using btree (session_label, group_key);
create index if not exists mv_student_sibling_groups_student_ids_idx on public.mv_student_sibling_groups using gin (student_ids);
create unique index if not exists v_student_financial_state_idx on public.v_student_financial_state using btree (student_id);
create index if not exists idx_v_workbook_installments_session on public.v_workbook_installment_balances using btree (session_label);
create index if not exists idx_v_workbook_installments_student on public.v_workbook_installment_balances using btree (student_id);
create index if not exists idx_v_workbook_installments_student_carry on public.v_workbook_installment_balances using btree (student_id) where is_carry_forward;
create unique index if not exists v_workbook_installment_balances_idx on public.v_workbook_installment_balances using btree (installment_id);
create index if not exists idx_v_workbook_financials_session_status on public.v_workbook_student_financials using btree (session_label, record_status);
create unique index if not exists v_workbook_student_financials_idx on public.v_workbook_student_financials using btree (student_id);


-- Triggers ------------------------------------------------------------------

create or replace trigger audit_academic_sessions AFTER INSERT OR DELETE OR UPDATE ON public.academic_sessions FOR EACH ROW EXECUTE FUNCTION private.capture_audit_event();
create or replace trigger ensure_single_current_academic_session BEFORE INSERT OR UPDATE ON public.academic_sessions FOR EACH ROW EXECUTE FUNCTION private.ensure_single_current_academic_session();
create or replace trigger set_actor_columns_on_academic_sessions BEFORE INSERT OR UPDATE ON public.academic_sessions FOR EACH ROW EXECUTE FUNCTION private.set_actor_columns();
create or replace trigger set_updated_at_on_academic_sessions BEFORE UPDATE ON public.academic_sessions FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
create or replace trigger audit_logs_are_append_only BEFORE DELETE OR UPDATE ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION private.prevent_append_only_mutation();
create or replace trigger audit_classes AFTER INSERT OR DELETE OR UPDATE ON public.classes FOR EACH ROW EXECUTE FUNCTION private.capture_audit_event();
create or replace trigger refresh_financials_on_class AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.classes FOR EACH STATEMENT EXECUTE FUNCTION trigger_refresh_financial_views();
create or replace trigger set_actor_columns_on_classes BEFORE INSERT OR UPDATE ON public.classes FOR EACH ROW EXECUTE FUNCTION private.set_actor_columns();
create or replace trigger set_updated_at_on_classes BEFORE UPDATE ON public.classes FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
create or replace trigger audit_collection_closures AFTER INSERT OR DELETE OR UPDATE ON public.collection_closures FOR EACH ROW EXECUTE FUNCTION private.capture_audit_event();
create or replace trigger set_actor_columns_on_collection_closures BEFORE INSERT OR UPDATE ON public.collection_closures FOR EACH ROW EXECUTE FUNCTION private.set_actor_columns();
create or replace trigger set_updated_at_on_collection_closures BEFORE UPDATE ON public.collection_closures FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
create or replace trigger audit_config_change_batches AFTER INSERT OR DELETE OR UPDATE ON public.config_change_batches FOR EACH ROW EXECUTE FUNCTION private.capture_audit_event();
create or replace trigger set_actor_columns_on_config_change_batches BEFORE INSERT OR UPDATE ON public.config_change_batches FOR EACH ROW EXECUTE FUNCTION private.set_actor_columns();
create or replace trigger set_updated_at_on_config_change_batches BEFORE UPDATE ON public.config_change_batches FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
create or replace trigger audit_config_change_blocked_installments AFTER INSERT OR DELETE OR UPDATE ON public.config_change_blocked_installments FOR EACH ROW EXECUTE FUNCTION private.capture_audit_event();
create or replace trigger refresh_financials_on_blocked_installments AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.config_change_blocked_installments FOR EACH STATEMENT EXECUTE FUNCTION trigger_refresh_financial_views();
create or replace trigger set_actor_columns_on_config_change_blocked_installments BEFORE INSERT OR UPDATE ON public.config_change_blocked_installments FOR EACH ROW EXECUTE FUNCTION private.set_actor_columns();
create or replace trigger set_updated_at_on_config_change_blocked_installments BEFORE UPDATE ON public.config_change_blocked_installments FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
create or replace trigger audit_conventional_discount_policies AFTER INSERT OR DELETE OR UPDATE ON public.conventional_discount_policies FOR EACH ROW EXECUTE FUNCTION private.capture_audit_event();
create or replace trigger refresh_financials_on_conventional_policy AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.conventional_discount_policies FOR EACH STATEMENT EXECUTE FUNCTION trigger_refresh_financial_views();
create or replace trigger set_actor_columns_on_conventional_discount_policies BEFORE INSERT OR UPDATE ON public.conventional_discount_policies FOR EACH ROW EXECUTE FUNCTION private.set_actor_columns();
create or replace trigger set_updated_at_on_conventional_discount_policies BEFORE UPDATE ON public.conventional_discount_policies FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
create or replace trigger audit_defaulter_recovery_state AFTER INSERT OR DELETE OR UPDATE ON public.defaulter_recovery_state FOR EACH ROW EXECUTE FUNCTION private.capture_audit_event();
create or replace trigger set_actor_columns_on_defaulter_recovery_state BEFORE INSERT OR UPDATE ON public.defaulter_recovery_state FOR EACH ROW EXECUTE FUNCTION private.set_actor_columns();
create or replace trigger set_updated_at_on_defaulter_recovery_state BEFORE UPDATE ON public.defaulter_recovery_state FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
create or replace trigger audit_family_payments AFTER INSERT ON public.family_payments FOR EACH ROW EXECUTE FUNCTION private.capture_audit_event();
create or replace trigger audit_fee_policy_configs AFTER INSERT OR DELETE OR UPDATE ON public.fee_policy_configs FOR EACH ROW EXECUTE FUNCTION private.capture_audit_event();
create or replace trigger refresh_financials_on_fee_policy AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.fee_policy_configs FOR EACH STATEMENT EXECUTE FUNCTION trigger_refresh_financial_views();
create or replace trigger set_actor_columns_on_fee_policy_configs BEFORE INSERT OR UPDATE ON public.fee_policy_configs FOR EACH ROW EXECUTE FUNCTION private.set_actor_columns();
create or replace trigger set_updated_at_on_fee_policy_configs BEFORE UPDATE ON public.fee_policy_configs FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
create or replace trigger audit_fee_settings AFTER INSERT OR DELETE OR UPDATE ON public.fee_settings FOR EACH ROW EXECUTE FUNCTION private.capture_audit_event();
create or replace trigger refresh_financials_on_fee_setting AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.fee_settings FOR EACH STATEMENT EXECUTE FUNCTION trigger_refresh_financial_views();
create or replace trigger set_actor_columns_on_fee_settings BEFORE INSERT OR UPDATE ON public.fee_settings FOR EACH ROW EXECUTE FUNCTION private.set_actor_columns();
create or replace trigger set_updated_at_on_fee_settings BEFORE UPDATE ON public.fee_settings FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
create or replace trigger audit_import_batches AFTER INSERT OR DELETE OR UPDATE ON public.import_batches FOR EACH ROW EXECUTE FUNCTION private.capture_audit_event();
create or replace trigger set_actor_columns_on_import_batches BEFORE INSERT OR UPDATE ON public.import_batches FOR EACH ROW EXECUTE FUNCTION private.set_actor_columns();
create or replace trigger set_updated_at_on_import_batches BEFORE UPDATE ON public.import_batches FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
create or replace trigger audit_import_rows AFTER INSERT OR DELETE OR UPDATE ON public.import_rows FOR EACH ROW EXECUTE FUNCTION private.capture_audit_event();
create or replace trigger set_actor_columns_on_import_rows BEFORE INSERT OR UPDATE ON public.import_rows FOR EACH ROW EXECUTE FUNCTION private.set_actor_columns();
create or replace trigger set_updated_at_on_import_rows BEFORE UPDATE ON public.import_rows FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
create or replace trigger audit_installments AFTER INSERT OR DELETE OR UPDATE ON public.installments FOR EACH ROW EXECUTE FUNCTION private.capture_audit_event();
create or replace trigger refresh_financials_on_installment AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.installments FOR EACH STATEMENT EXECUTE FUNCTION trigger_refresh_financial_views();
create or replace trigger set_actor_columns_on_installments BEFORE INSERT OR UPDATE ON public.installments FOR EACH ROW EXECUTE FUNCTION private.set_actor_columns();
create or replace trigger set_updated_at_on_installments BEFORE UPDATE ON public.installments FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
create or replace trigger audit_ledger_regeneration_batches AFTER INSERT OR DELETE OR UPDATE ON public.ledger_regeneration_batches FOR EACH ROW EXECUTE FUNCTION private.capture_audit_event();
create or replace trigger set_actor_columns_on_ledger_regeneration_batches BEFORE INSERT OR UPDATE ON public.ledger_regeneration_batches FOR EACH ROW EXECUTE FUNCTION private.set_actor_columns();
create or replace trigger set_updated_at_on_ledger_regeneration_batches BEFORE UPDATE ON public.ledger_regeneration_batches FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
create or replace trigger audit_ledger_regeneration_rows AFTER INSERT OR DELETE OR UPDATE ON public.ledger_regeneration_rows FOR EACH ROW EXECUTE FUNCTION private.capture_audit_event();
create or replace trigger set_actor_columns_on_ledger_regeneration_rows BEFORE INSERT OR UPDATE ON public.ledger_regeneration_rows FOR EACH ROW EXECUTE FUNCTION private.set_actor_columns();
create or replace trigger set_updated_at_on_ledger_regeneration_rows BEFORE UPDATE ON public.ledger_regeneration_rows FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
create or replace trigger notion_sync_log_is_append_only BEFORE DELETE OR UPDATE ON public.notion_sync_log FOR EACH ROW EXECUTE FUNCTION private.prevent_notion_sync_log_mutation();
create or replace trigger audit_payment_adjustment_reviews AFTER INSERT OR DELETE OR UPDATE ON public.payment_adjustment_reviews FOR EACH ROW EXECUTE FUNCTION private.capture_audit_event();
create or replace trigger payment_adjustment_reviews_are_append_only BEFORE DELETE OR UPDATE ON public.payment_adjustment_reviews FOR EACH ROW EXECUTE FUNCTION private.prevent_append_only_mutation();
create or replace trigger set_created_by_on_payment_adjustment_reviews BEFORE INSERT ON public.payment_adjustment_reviews FOR EACH ROW EXECUTE FUNCTION private.set_created_by_column();
create or replace trigger audit_payment_adjustments AFTER INSERT OR DELETE OR UPDATE ON public.payment_adjustments FOR EACH ROW EXECUTE FUNCTION private.capture_audit_event();
create or replace trigger payment_adjustments_are_append_only BEFORE DELETE OR UPDATE ON public.payment_adjustments FOR EACH ROW EXECUTE FUNCTION private.prevent_append_only_mutation();
create or replace trigger refresh_financials_on_payment_adjustment AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.payment_adjustments FOR EACH STATEMENT EXECUTE FUNCTION trigger_refresh_financial_views();
create or replace trigger set_created_by_on_payment_adjustments BEFORE INSERT ON public.payment_adjustments FOR EACH ROW EXECUTE FUNCTION private.set_created_by_column();
create or replace trigger audit_payments AFTER INSERT OR DELETE OR UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION private.capture_audit_event();
create or replace trigger payments_are_append_only BEFORE DELETE OR UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION private.prevent_append_only_mutation();
create or replace trigger refresh_financials_on_payment AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.payments FOR EACH STATEMENT EXECUTE FUNCTION trigger_refresh_financial_views();
create or replace trigger set_created_by_on_payments BEFORE INSERT ON public.payments FOR EACH ROW EXECUTE FUNCTION private.set_created_by_column();
create or replace trigger audit_prev_year_import_batches AFTER INSERT OR DELETE OR UPDATE ON public.prev_year_import_batches FOR EACH ROW EXECUTE FUNCTION private.capture_audit_event();
create or replace trigger set_actor_columns_on_prev_year_import_batches BEFORE INSERT OR UPDATE ON public.prev_year_import_batches FOR EACH ROW EXECUTE FUNCTION private.set_actor_columns();
create or replace trigger set_updated_at_on_prev_year_import_batches BEFORE UPDATE ON public.prev_year_import_batches FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
create or replace trigger audit_prev_year_import_rows AFTER INSERT OR DELETE OR UPDATE ON public.prev_year_import_rows FOR EACH ROW EXECUTE FUNCTION private.capture_audit_event();
create or replace trigger set_actor_columns_on_prev_year_import_rows BEFORE INSERT OR UPDATE ON public.prev_year_import_rows FOR EACH ROW EXECUTE FUNCTION private.set_actor_columns();
create or replace trigger set_updated_at_on_prev_year_import_rows BEFORE UPDATE ON public.prev_year_import_rows FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
create or replace trigger audit_promotion_run_entries AFTER INSERT OR DELETE OR UPDATE ON public.promotion_run_entries FOR EACH ROW EXECUTE FUNCTION private.capture_audit_event();
create or replace trigger set_updated_at_on_promotion_run_entries BEFORE UPDATE ON public.promotion_run_entries FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
create or replace trigger audit_promotion_runs AFTER INSERT OR DELETE OR UPDATE ON public.promotion_runs FOR EACH ROW EXECUTE FUNCTION private.capture_audit_event();
create or replace trigger set_updated_at_on_promotion_runs BEFORE UPDATE ON public.promotion_runs FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
create or replace trigger audit_receipt_adjustments AFTER INSERT OR DELETE OR UPDATE ON public.receipt_adjustments FOR EACH ROW EXECUTE FUNCTION private.capture_audit_event();
create or replace trigger receipt_adjustments_are_append_only BEFORE DELETE OR UPDATE ON public.receipt_adjustments FOR EACH ROW EXECUTE FUNCTION private.prevent_receipt_adjustment_mutation();
create or replace trigger refresh_financials_on_receipt_adjustment AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.receipt_adjustments FOR EACH STATEMENT EXECUTE FUNCTION trigger_refresh_financial_views();
create or replace trigger set_created_by_on_receipt_adjustments BEFORE INSERT ON public.receipt_adjustments FOR EACH ROW EXECUTE FUNCTION private.set_created_by_column();
create or replace trigger audit_receipts AFTER INSERT OR DELETE OR UPDATE ON public.receipts FOR EACH ROW EXECUTE FUNCTION private.capture_audit_event();
create or replace trigger receipts_are_append_only BEFORE DELETE OR UPDATE ON public.receipts FOR EACH ROW EXECUTE FUNCTION private.prevent_append_only_mutation();
create or replace trigger refresh_financials_on_receipt AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.receipts FOR EACH STATEMENT EXECUTE FUNCTION trigger_refresh_financial_views();
create or replace trigger set_created_by_on_receipts BEFORE INSERT ON public.receipts FOR EACH ROW EXECUTE FUNCTION private.set_created_by_column();
create or replace trigger audit_refund_requests AFTER INSERT OR DELETE OR UPDATE ON public.refund_requests FOR EACH ROW EXECUTE FUNCTION private.capture_audit_event();
create or replace trigger set_actor_columns_on_refund_requests BEFORE INSERT OR UPDATE ON public.refund_requests FOR EACH ROW EXECUTE FUNCTION private.set_actor_columns();
create or replace trigger set_updated_at_on_refund_requests BEFORE UPDATE ON public.refund_requests FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
create or replace trigger audit_school_fee_defaults AFTER INSERT OR DELETE OR UPDATE ON public.school_fee_defaults FOR EACH ROW EXECUTE FUNCTION private.capture_audit_event();
create or replace trigger set_actor_columns_on_school_fee_defaults BEFORE INSERT OR UPDATE ON public.school_fee_defaults FOR EACH ROW EXECUTE FUNCTION private.set_actor_columns();
create or replace trigger set_updated_at_on_school_fee_defaults BEFORE UPDATE ON public.school_fee_defaults FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
create or replace trigger audit_setup_progress AFTER INSERT OR DELETE OR UPDATE ON public.setup_progress FOR EACH ROW EXECUTE FUNCTION private.capture_audit_event();
create or replace trigger set_actor_columns_on_setup_progress BEFORE INSERT OR UPDATE ON public.setup_progress FOR EACH ROW EXECUTE FUNCTION private.set_actor_columns();
create or replace trigger set_updated_at_on_setup_progress BEFORE UPDATE ON public.setup_progress FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
create or replace trigger audit_student_carry_forward_balances AFTER INSERT OR DELETE OR UPDATE ON public.student_carry_forward_balances FOR EACH ROW EXECUTE FUNCTION private.capture_audit_event();
create or replace trigger set_actor_columns_on_student_carry_forward_balances BEFORE INSERT OR UPDATE ON public.student_carry_forward_balances FOR EACH ROW EXECUTE FUNCTION private.set_actor_columns();
create or replace trigger set_updated_at_on_student_carry_forward_balances BEFORE UPDATE ON public.student_carry_forward_balances FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
create or replace trigger audit_student_collection_flags AFTER INSERT OR DELETE OR UPDATE ON public.student_collection_flags FOR EACH ROW EXECUTE FUNCTION private.capture_audit_event();
create or replace trigger set_actor_columns_on_student_collection_flags BEFORE INSERT OR UPDATE ON public.student_collection_flags FOR EACH ROW EXECUTE FUNCTION private.set_actor_columns();
create or replace trigger set_updated_at_on_student_collection_flags BEFORE UPDATE ON public.student_collection_flags FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
create or replace trigger audit_student_conventional_discount_assignments AFTER INSERT OR DELETE OR UPDATE ON public.student_conventional_discount_assignments FOR EACH ROW EXECUTE FUNCTION private.capture_audit_event();
create or replace trigger enforce_max_active_conventional_discounts BEFORE INSERT OR UPDATE ON public.student_conventional_discount_assignments FOR EACH ROW EXECUTE FUNCTION private.enforce_max_active_conventional_discounts();
create or replace trigger enforce_third_child_traceability_trg BEFORE INSERT OR UPDATE ON public.student_conventional_discount_assignments FOR EACH ROW EXECUTE FUNCTION private.enforce_third_child_traceability();
create or replace trigger refresh_financials_on_conventional_assignment AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.student_conventional_discount_assignments FOR EACH STATEMENT EXECUTE FUNCTION trigger_refresh_financial_views();
create or replace trigger set_updated_at_on_student_conventional_discount_assignments BEFORE UPDATE ON public.student_conventional_discount_assignments FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
create or replace trigger audit_student_family_groups AFTER INSERT OR DELETE OR UPDATE ON public.student_family_groups FOR EACH ROW EXECUTE FUNCTION private.capture_audit_event();
create or replace trigger queue_sibling_refresh_on_family_groups AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.student_family_groups FOR EACH STATEMENT EXECUTE FUNCTION queue_sibling_groups_refresh();
create or replace trigger set_actor_columns_on_student_family_groups BEFORE INSERT OR UPDATE ON public.student_family_groups FOR EACH ROW EXECUTE FUNCTION private.set_actor_columns();
create or replace trigger set_updated_at_on_student_family_groups BEFORE UPDATE ON public.student_family_groups FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
create or replace trigger audit_student_family_members AFTER INSERT OR DELETE OR UPDATE ON public.student_family_members FOR EACH ROW EXECUTE FUNCTION private.capture_audit_event();
create or replace trigger queue_sibling_refresh_on_family_members AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.student_family_members FOR EACH STATEMENT EXECUTE FUNCTION queue_sibling_groups_refresh();
create or replace trigger set_updated_at_on_student_family_members BEFORE UPDATE ON public.student_family_members FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
create or replace trigger audit_student_fee_overrides AFTER INSERT OR DELETE OR UPDATE ON public.student_fee_overrides FOR EACH ROW EXECUTE FUNCTION private.capture_audit_event();
create or replace trigger refresh_financials_on_student_override AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.student_fee_overrides FOR EACH STATEMENT EXECUTE FUNCTION trigger_refresh_financial_views();
create or replace trigger set_actor_columns_on_student_fee_overrides BEFORE INSERT OR UPDATE ON public.student_fee_overrides FOR EACH ROW EXECUTE FUNCTION private.set_actor_columns();
create or replace trigger set_updated_at_on_student_fee_overrides BEFORE UPDATE ON public.student_fee_overrides FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
create or replace trigger refresh_financials_on_late_fee_waiver AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.student_late_fee_waivers FOR EACH STATEMENT EXECUTE FUNCTION trigger_refresh_financial_views();
create or replace trigger audit_student_share_links AFTER INSERT OR DELETE OR UPDATE ON public.student_share_links FOR EACH ROW EXECUTE FUNCTION private.capture_audit_event();
create or replace trigger audit_students AFTER INSERT OR DELETE OR UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION private.capture_audit_event();
create or replace trigger queue_sibling_refresh_on_students AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.students FOR EACH STATEMENT EXECUTE FUNCTION queue_sibling_groups_refresh();
create or replace trigger refresh_financials_on_student AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.students FOR EACH STATEMENT EXECUTE FUNCTION trigger_refresh_financial_views();
create or replace trigger set_actor_columns_on_students BEFORE INSERT OR UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION private.set_actor_columns();
create or replace trigger set_updated_at_on_students BEFORE UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
create or replace trigger audit_transport_routes AFTER INSERT OR DELETE OR UPDATE ON public.transport_routes FOR EACH ROW EXECUTE FUNCTION private.capture_audit_event();
create or replace trigger refresh_financials_on_transport_route AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.transport_routes FOR EACH STATEMENT EXECUTE FUNCTION trigger_refresh_financial_views();
create or replace trigger set_actor_columns_on_transport_routes BEFORE INSERT OR UPDATE ON public.transport_routes FOR EACH ROW EXECUTE FUNCTION private.set_actor_columns();
create or replace trigger set_updated_at_on_transport_routes BEFORE UPDATE ON public.transport_routes FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
create or replace trigger audit_users AFTER INSERT OR DELETE OR UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION private.capture_audit_event();
create or replace trigger set_actor_columns_on_users BEFORE INSERT OR UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION private.set_actor_columns();
create or replace trigger set_updated_at_on_users BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();


-- Row level security --------------------------------------------------------

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
alter table public.student_session_reanchor_log enable row level security;
alter table public.student_share_links enable row level security;
alter table public.students enable row level security;
alter table public.transport_routes enable row level security;
alter table public.user_activity_events enable row level security;
alter table public.users enable row level security;
alter table public.whatsapp_templates enable row level security;
alter table public.workbook_materialized_view_refresh_queue enable row level security;


-- Policies ------------------------------------------------------------------

drop policy if exists "authenticated can delete academic sessions" on public.academic_sessions;
create policy "authenticated can delete academic sessions" on public.academic_sessions as permissive for delete to authenticated
  using (( SELECT has_permission('settings:write'::text) AS has_permission));

drop policy if exists "authenticated can insert academic sessions" on public.academic_sessions;
create policy "authenticated can insert academic sessions" on public.academic_sessions as permissive for insert to authenticated
  with check (( SELECT has_permission('settings:write'::text) AS has_permission));

drop policy if exists "authenticated can read academic sessions" on public.academic_sessions;
create policy "authenticated can read academic sessions" on public.academic_sessions as permissive for select to authenticated
  using (( SELECT has_any_permission(ARRAY['dashboard:view'::text, 'students:view'::text, 'fees:view'::text, 'payments:view'::text, 'defaulters:view'::text, 'imports:view'::text, 'reports:view'::text, 'settings:view'::text]) AS has_any_permission));

drop policy if exists "authenticated can update academic sessions" on public.academic_sessions;
create policy "authenticated can update academic sessions" on public.academic_sessions as permissive for update to authenticated
  using (( SELECT has_permission('settings:write'::text) AS has_permission))
  with check (( SELECT has_permission('settings:write'::text) AS has_permission));

drop policy if exists "authenticated can read app_settings" on public.app_settings;
create policy "authenticated can read app_settings" on public.app_settings as permissive for select to authenticated
  using (true);

drop policy if exists "settings:write can delete app_settings" on public.app_settings;
create policy "settings:write can delete app_settings" on public.app_settings as permissive for delete to authenticated
  using (( SELECT has_permission('settings:write'::text) AS has_permission));

drop policy if exists "settings:write can insert app_settings" on public.app_settings;
create policy "settings:write can insert app_settings" on public.app_settings as permissive for insert to authenticated
  with check (( SELECT has_permission('settings:write'::text) AS has_permission));

drop policy if exists "settings:write can update app_settings" on public.app_settings;
create policy "settings:write can update app_settings" on public.app_settings as permissive for update to authenticated
  using (( SELECT has_permission('settings:write'::text) AS has_permission))
  with check (( SELECT has_permission('settings:write'::text) AS has_permission));

drop policy if exists "authenticated can read audit logs" on public.audit_logs;
create policy "authenticated can read audit logs" on public.audit_logs as permissive for select to authenticated
  using (( SELECT has_permission('staff:manage'::text) AS has_permission));

drop policy if exists "authenticated can insert classes" on public.classes;
create policy "authenticated can insert classes" on public.classes as permissive for insert to authenticated
  with check (( SELECT has_permission('fees:write'::text) AS has_permission));

drop policy if exists "authenticated can read classes" on public.classes;
create policy "authenticated can read classes" on public.classes as permissive for select to authenticated
  using (( SELECT has_any_permission(ARRAY['dashboard:view'::text, 'students:view'::text, 'fees:view'::text, 'payments:view'::text, 'defaulters:view'::text, 'finance:view'::text]) AS has_any_permission));

drop policy if exists "authenticated can update classes" on public.classes;
create policy "authenticated can update classes" on public.classes as permissive for update to authenticated
  using (( SELECT has_permission('fees:write'::text) AS has_permission))
  with check (( SELECT has_permission('fees:write'::text) AS has_permission));

drop policy if exists "notion sync can read classes" on public.classes;
create policy "notion sync can read classes" on public.classes as permissive for select to notion_fee_sync_role
  using (true);

drop policy if exists "authenticated can insert collection closures" on public.collection_closures;
create policy "authenticated can insert collection closures" on public.collection_closures as permissive for insert to authenticated
  with check (( SELECT has_permission('finance:write'::text) AS has_permission));

drop policy if exists "authenticated can read collection closures" on public.collection_closures;
create policy "authenticated can read collection closures" on public.collection_closures as permissive for select to authenticated
  using (( SELECT has_permission('finance:view'::text) AS has_permission));

drop policy if exists "authenticated can update collection closures" on public.collection_closures;
create policy "authenticated can update collection closures" on public.collection_closures as permissive for update to authenticated
  using (( SELECT has_any_permission(ARRAY['finance:write'::text, 'finance:approve'::text]) AS has_any_permission))
  with check (( SELECT has_any_permission(ARRAY['finance:write'::text, 'finance:approve'::text]) AS has_any_permission));

drop policy if exists "authenticated can insert config change batches" on public.config_change_batches;
create policy "authenticated can insert config change batches" on public.config_change_batches as permissive for insert to authenticated
  with check (( SELECT has_permission('fees:write'::text) AS has_permission));

drop policy if exists "authenticated can read config change batches" on public.config_change_batches;
create policy "authenticated can read config change batches" on public.config_change_batches as permissive for select to authenticated
  using (( SELECT has_permission('fees:view'::text) AS has_permission));

drop policy if exists "authenticated can update config change batches" on public.config_change_batches;
create policy "authenticated can update config change batches" on public.config_change_batches as permissive for update to authenticated
  using (( SELECT has_permission('fees:write'::text) AS has_permission))
  with check (( SELECT has_permission('fees:write'::text) AS has_permission));

drop policy if exists "authenticated can insert config change blocked installments" on public.config_change_blocked_installments;
create policy "authenticated can insert config change blocked installments" on public.config_change_blocked_installments as permissive for insert to authenticated
  with check (( SELECT has_permission('fees:write'::text) AS has_permission));

drop policy if exists "authenticated can read config change blocked installments" on public.config_change_blocked_installments;
create policy "authenticated can read config change blocked installments" on public.config_change_blocked_installments as permissive for select to authenticated
  using (( SELECT has_permission('fees:view'::text) AS has_permission));

drop policy if exists "authenticated can update config change blocked installments" on public.config_change_blocked_installments;
create policy "authenticated can update config change blocked installments" on public.config_change_blocked_installments as permissive for update to authenticated
  using (( SELECT has_permission('fees:write'::text) AS has_permission))
  with check (( SELECT has_permission('fees:write'::text) AS has_permission));

drop policy if exists "authenticated can delete conventional discount policies" on public.conventional_discount_policies;
create policy "authenticated can delete conventional discount policies" on public.conventional_discount_policies as permissive for delete to authenticated
  using (( SELECT has_permission('fees:write'::text) AS has_permission));

drop policy if exists "authenticated can insert conventional discount policies" on public.conventional_discount_policies;
create policy "authenticated can insert conventional discount policies" on public.conventional_discount_policies as permissive for insert to authenticated
  with check (( SELECT has_permission('fees:write'::text) AS has_permission));

drop policy if exists "authenticated can read conventional discount policies" on public.conventional_discount_policies;
create policy "authenticated can read conventional discount policies" on public.conventional_discount_policies as permissive for select to authenticated
  using (( SELECT has_any_permission(ARRAY['fees:view'::text, 'students:view'::text, 'reports:view'::text]) AS has_any_permission));

drop policy if exists "authenticated can update conventional discount policies" on public.conventional_discount_policies;
create policy "authenticated can update conventional discount policies" on public.conventional_discount_policies as permissive for update to authenticated
  using (( SELECT has_permission('fees:write'::text) AS has_permission))
  with check (( SELECT has_permission('fees:write'::text) AS has_permission));

drop policy if exists "defaulter_contacts: staff insert" on public.defaulter_contacts;
create policy "defaulter_contacts: staff insert" on public.defaulter_contacts as permissive for insert to public
  with check ((( SELECT auth.role() AS role) = 'authenticated'::text));

drop policy if exists "defaulter_contacts: staff read" on public.defaulter_contacts;
create policy "defaulter_contacts: staff read" on public.defaulter_contacts as permissive for select to public
  using ((( SELECT auth.role() AS role) = 'authenticated'::text));

drop policy if exists "staff can read recovery state" on public.defaulter_recovery_state;
create policy "staff can read recovery state" on public.defaulter_recovery_state as permissive for select to authenticated
  using (( SELECT has_permission('defaulters:view'::text) AS has_permission));

drop policy if exists "staff can update recovery state" on public.defaulter_recovery_state;
create policy "staff can update recovery state" on public.defaulter_recovery_state as permissive for update to authenticated
  using (( SELECT has_permission('defaulters:view'::text) AS has_permission))
  with check (( SELECT has_permission('defaulters:view'::text) AS has_permission));

drop policy if exists "staff can upsert recovery state" on public.defaulter_recovery_state;
create policy "staff can upsert recovery state" on public.defaulter_recovery_state as permissive for insert to authenticated
  with check (( SELECT has_permission('defaulters:view'::text) AS has_permission));

drop policy if exists "authenticated can insert family payments" on public.family_payments;
create policy "authenticated can insert family payments" on public.family_payments as permissive for insert to authenticated
  with check (( SELECT has_permission('payments:write'::text) AS has_permission));

drop policy if exists "authenticated can read family payments" on public.family_payments;
create policy "authenticated can read family payments" on public.family_payments as permissive for select to authenticated
  using (( SELECT has_any_permission(ARRAY['receipts:view'::text, 'payments:view'::text, 'reports:view'::text]) AS has_any_permission));

drop policy if exists "authenticated can insert fee policy configs" on public.fee_policy_configs;
create policy "authenticated can insert fee policy configs" on public.fee_policy_configs as permissive for insert to authenticated
  with check ((( SELECT auth.uid() AS uid) IS NOT NULL));

drop policy if exists "authenticated can read fee policy configs" on public.fee_policy_configs;
create policy "authenticated can read fee policy configs" on public.fee_policy_configs as permissive for select to authenticated
  using ((( SELECT auth.uid() AS uid) IS NOT NULL));

drop policy if exists "authenticated can update fee policy configs" on public.fee_policy_configs;
create policy "authenticated can update fee policy configs" on public.fee_policy_configs as permissive for update to authenticated
  using ((( SELECT auth.uid() AS uid) IS NOT NULL))
  with check ((( SELECT auth.uid() AS uid) IS NOT NULL));

drop policy if exists "notion sync can read fee_policy_configs" on public.fee_policy_configs;
create policy "notion sync can read fee_policy_configs" on public.fee_policy_configs as permissive for select to notion_fee_sync_role
  using (true);

drop policy if exists "authenticated can insert fee settings" on public.fee_settings;
create policy "authenticated can insert fee settings" on public.fee_settings as permissive for insert to authenticated
  with check (( SELECT has_permission('fees:write'::text) AS has_permission));

drop policy if exists "authenticated can read fee settings" on public.fee_settings;
create policy "authenticated can read fee settings" on public.fee_settings as permissive for select to authenticated
  using (( SELECT has_permission('fees:view'::text) AS has_permission));

drop policy if exists "authenticated can update fee settings" on public.fee_settings;
create policy "authenticated can update fee settings" on public.fee_settings as permissive for update to authenticated
  using (( SELECT has_permission('fees:write'::text) AS has_permission))
  with check (( SELECT has_permission('fees:write'::text) AS has_permission));

drop policy if exists "notion sync can read fee_settings" on public.fee_settings;
create policy "notion sync can read fee_settings" on public.fee_settings as permissive for select to notion_fee_sync_role
  using (true);

drop policy if exists "staff can insert import batches" on public.import_batches;
create policy "staff can insert import batches" on public.import_batches as permissive for insert to authenticated
  with check (( SELECT has_permission('students:write'::text) AS has_permission));

drop policy if exists "staff can read import batches" on public.import_batches;
create policy "staff can read import batches" on public.import_batches as permissive for select to authenticated
  using ((( SELECT has_permission('imports:view'::text) AS has_permission) OR ( SELECT has_permission('students:write'::text) AS has_permission)));

drop policy if exists "staff can update import batches" on public.import_batches;
create policy "staff can update import batches" on public.import_batches as permissive for update to authenticated
  using (( SELECT has_permission('students:write'::text) AS has_permission))
  with check (( SELECT has_permission('students:write'::text) AS has_permission));

drop policy if exists "staff can insert import rows" on public.import_rows;
create policy "staff can insert import rows" on public.import_rows as permissive for insert to authenticated
  with check (( SELECT has_permission('students:write'::text) AS has_permission));

drop policy if exists "staff can read import rows" on public.import_rows;
create policy "staff can read import rows" on public.import_rows as permissive for select to authenticated
  using ((( SELECT has_permission('imports:view'::text) AS has_permission) OR ( SELECT has_permission('students:write'::text) AS has_permission)));

drop policy if exists "staff can update import rows" on public.import_rows;
create policy "staff can update import rows" on public.import_rows as permissive for update to authenticated
  using (( SELECT has_permission('students:write'::text) AS has_permission))
  with check (( SELECT has_permission('students:write'::text) AS has_permission));

drop policy if exists "authenticated can insert installments" on public.installments;
create policy "authenticated can insert installments" on public.installments as permissive for insert to authenticated
  with check (( SELECT has_permission('fees:write'::text) AS has_permission));

drop policy if exists "authenticated can read installments" on public.installments;
create policy "authenticated can read installments" on public.installments as permissive for select to authenticated
  using (( SELECT has_any_permission(ARRAY['fees:view'::text, 'payments:view'::text, 'ledger:view'::text, 'defaulters:view'::text, 'finance:view'::text]) AS has_any_permission));

drop policy if exists "authenticated can update installments" on public.installments;
create policy "authenticated can update installments" on public.installments as permissive for update to authenticated
  using (( SELECT has_permission('fees:write'::text) AS has_permission))
  with check (( SELECT has_permission('fees:write'::text) AS has_permission));

drop policy if exists "notion sync can read installments" on public.installments;
create policy "notion sync can read installments" on public.installments as permissive for select to notion_fee_sync_role
  using (true);

drop policy if exists "authenticated can insert ledger regeneration batches" on public.ledger_regeneration_batches;
create policy "authenticated can insert ledger regeneration batches" on public.ledger_regeneration_batches as permissive for insert to authenticated
  with check (( SELECT has_permission('fees:write'::text) AS has_permission));

drop policy if exists "authenticated can read ledger regeneration batches" on public.ledger_regeneration_batches;
create policy "authenticated can read ledger regeneration batches" on public.ledger_regeneration_batches as permissive for select to authenticated
  using (( SELECT has_permission('fees:view'::text) AS has_permission));

drop policy if exists "authenticated can update ledger regeneration batches" on public.ledger_regeneration_batches;
create policy "authenticated can update ledger regeneration batches" on public.ledger_regeneration_batches as permissive for update to authenticated
  using (( SELECT has_permission('fees:write'::text) AS has_permission))
  with check (( SELECT has_permission('fees:write'::text) AS has_permission));

drop policy if exists "authenticated can insert ledger regeneration rows" on public.ledger_regeneration_rows;
create policy "authenticated can insert ledger regeneration rows" on public.ledger_regeneration_rows as permissive for insert to authenticated
  with check (( SELECT has_permission('fees:write'::text) AS has_permission));

drop policy if exists "authenticated can read ledger regeneration rows" on public.ledger_regeneration_rows;
create policy "authenticated can read ledger regeneration rows" on public.ledger_regeneration_rows as permissive for select to authenticated
  using (( SELECT has_permission('fees:view'::text) AS has_permission));

drop policy if exists "authenticated can update ledger regeneration rows" on public.ledger_regeneration_rows;
create policy "authenticated can update ledger regeneration rows" on public.ledger_regeneration_rows as permissive for update to authenticated
  using (( SELECT has_permission('fees:write'::text) AS has_permission))
  with check (( SELECT has_permission('fees:write'::text) AS has_permission));

drop policy if exists "notion sync role can insert log rows" on public.notion_sync_log;
create policy "notion sync role can insert log rows" on public.notion_sync_log as permissive for insert to notion_fee_sync_role
  with check (true);

drop policy if exists "notion sync role can read log rows" on public.notion_sync_log;
create policy "notion sync role can read log rows" on public.notion_sync_log as permissive for select to notion_fee_sync_role
  using (true);

drop policy if exists "staff can insert office sync events" on public.office_sync_events;
create policy "staff can insert office sync events" on public.office_sync_events as permissive for insert to authenticated
  with check ((( SELECT has_permission('students:write'::text) AS has_permission) OR ( SELECT has_permission('fees:write'::text) AS has_permission) OR ( SELECT has_permission('payments:write'::text) AS has_permission)));

drop policy if exists "staff can read office sync events" on public.office_sync_events;
create policy "staff can read office sync events" on public.office_sync_events as permissive for select to authenticated
  using (( SELECT has_any_permission(ARRAY['dashboard:view'::text, 'students:view'::text, 'fees:view'::text, 'payments:view'::text, 'reports:view'::text, 'defaulters:view'::text]) AS has_any_permission));

drop policy if exists "authenticated can insert payment adjustment reviews" on public.payment_adjustment_reviews;
create policy "authenticated can insert payment adjustment reviews" on public.payment_adjustment_reviews as permissive for insert to authenticated
  with check (( SELECT has_permission('finance:approve'::text) AS has_permission));

drop policy if exists "authenticated can read payment adjustment reviews" on public.payment_adjustment_reviews;
create policy "authenticated can read payment adjustment reviews" on public.payment_adjustment_reviews as permissive for select to authenticated
  using (( SELECT has_permission('finance:view'::text) AS has_permission));

drop policy if exists "authenticated can insert payment adjustments" on public.payment_adjustments;
create policy "authenticated can insert payment adjustments" on public.payment_adjustments as permissive for insert to authenticated
  with check (( SELECT has_permission('payments:adjust'::text) AS has_permission));

drop policy if exists "authenticated can read payment adjustments" on public.payment_adjustments;
create policy "authenticated can read payment adjustments" on public.payment_adjustments as permissive for select to authenticated
  using (( SELECT has_any_permission(ARRAY['ledger:view'::text, 'defaulters:view'::text, 'dashboard:view'::text, 'finance:view'::text]) AS has_any_permission));

drop policy if exists "notion sync can read payment_adjustments" on public.payment_adjustments;
create policy "notion sync can read payment_adjustments" on public.payment_adjustments as permissive for select to notion_fee_sync_role
  using (true);

drop policy if exists payment_import_batches_insert on public.payment_import_batches;
create policy payment_import_batches_insert on public.payment_import_batches as permissive for insert to authenticated
  with check (( SELECT has_permission('payments:bulk'::text) AS has_permission));

drop policy if exists payment_import_batches_select on public.payment_import_batches;
create policy payment_import_batches_select on public.payment_import_batches as permissive for select to authenticated
  using (( SELECT has_permission('payments:bulk'::text) AS has_permission));

drop policy if exists payment_import_batches_update on public.payment_import_batches;
create policy payment_import_batches_update on public.payment_import_batches as permissive for update to authenticated
  using (( SELECT has_permission('payments:bulk'::text) AS has_permission))
  with check (( SELECT has_permission('payments:bulk'::text) AS has_permission));

drop policy if exists payment_import_rows_insert on public.payment_import_rows;
create policy payment_import_rows_insert on public.payment_import_rows as permissive for insert to authenticated
  with check (( SELECT has_permission('payments:bulk'::text) AS has_permission));

drop policy if exists payment_import_rows_select on public.payment_import_rows;
create policy payment_import_rows_select on public.payment_import_rows as permissive for select to authenticated
  using (( SELECT has_permission('payments:bulk'::text) AS has_permission));

drop policy if exists payment_import_rows_update on public.payment_import_rows;
create policy payment_import_rows_update on public.payment_import_rows as permissive for update to authenticated
  using (( SELECT has_permission('payments:bulk'::text) AS has_permission))
  with check (( SELECT has_permission('payments:bulk'::text) AS has_permission));

drop policy if exists "authenticated can insert payments" on public.payments;
create policy "authenticated can insert payments" on public.payments as permissive for insert to authenticated
  with check (( SELECT has_permission('payments:write'::text) AS has_permission));

drop policy if exists "authenticated can read payments" on public.payments;
create policy "authenticated can read payments" on public.payments as permissive for select to authenticated
  using (( SELECT has_any_permission(ARRAY['payments:view'::text, 'ledger:view'::text, 'receipts:view'::text, 'dashboard:view'::text, 'finance:view'::text]) AS has_any_permission));

drop policy if exists "notion sync can read payments" on public.payments;
create policy "notion sync can read payments" on public.payments as permissive for select to notion_fee_sync_role
  using (true);

drop policy if exists "authenticated can insert prev year import batches" on public.prev_year_import_batches;
create policy "authenticated can insert prev year import batches" on public.prev_year_import_batches as permissive for insert to authenticated
  with check (( SELECT has_permission('fees:write'::text) AS has_permission));

drop policy if exists "authenticated can read prev year import batches" on public.prev_year_import_batches;
create policy "authenticated can read prev year import batches" on public.prev_year_import_batches as permissive for select to authenticated
  using (( SELECT has_permission('fees:view'::text) AS has_permission));

drop policy if exists "authenticated can update prev year import batches" on public.prev_year_import_batches;
create policy "authenticated can update prev year import batches" on public.prev_year_import_batches as permissive for update to authenticated
  using (( SELECT has_permission('fees:write'::text) AS has_permission))
  with check (( SELECT has_permission('fees:write'::text) AS has_permission));

drop policy if exists "authenticated can insert prev year import rows" on public.prev_year_import_rows;
create policy "authenticated can insert prev year import rows" on public.prev_year_import_rows as permissive for insert to authenticated
  with check (( SELECT has_permission('fees:write'::text) AS has_permission));

drop policy if exists "authenticated can read prev year import rows" on public.prev_year_import_rows;
create policy "authenticated can read prev year import rows" on public.prev_year_import_rows as permissive for select to authenticated
  using (( SELECT has_permission('fees:view'::text) AS has_permission));

drop policy if exists "authenticated can update prev year import rows" on public.prev_year_import_rows;
create policy "authenticated can update prev year import rows" on public.prev_year_import_rows as permissive for update to authenticated
  using (( SELECT has_permission('fees:write'::text) AS has_permission))
  with check (( SELECT has_permission('fees:write'::text) AS has_permission));

drop policy if exists "admin can insert promotion run entries" on public.promotion_run_entries;
create policy "admin can insert promotion run entries" on public.promotion_run_entries as permissive for insert to authenticated
  with check (( SELECT has_permission('students:write'::text) AS has_permission));

drop policy if exists "admin can read promotion run entries" on public.promotion_run_entries;
create policy "admin can read promotion run entries" on public.promotion_run_entries as permissive for select to authenticated
  using (( SELECT has_permission('students:write'::text) AS has_permission));

drop policy if exists "admin can update promotion run entries" on public.promotion_run_entries;
create policy "admin can update promotion run entries" on public.promotion_run_entries as permissive for update to authenticated
  using (( SELECT has_permission('students:write'::text) AS has_permission))
  with check (( SELECT has_permission('students:write'::text) AS has_permission));

drop policy if exists "admin can insert promotion runs" on public.promotion_runs;
create policy "admin can insert promotion runs" on public.promotion_runs as permissive for insert to authenticated
  with check (( SELECT has_permission('students:write'::text) AS has_permission));

drop policy if exists "admin can read promotion runs" on public.promotion_runs;
create policy "admin can read promotion runs" on public.promotion_runs as permissive for select to authenticated
  using (( SELECT has_permission('students:write'::text) AS has_permission));

drop policy if exists "admin can update promotion runs" on public.promotion_runs;
create policy "admin can update promotion runs" on public.promotion_runs as permissive for update to authenticated
  using (( SELECT has_permission('students:write'::text) AS has_permission))
  with check (( SELECT has_permission('students:write'::text) AS has_permission));

drop policy if exists "authenticated can insert receipt adjustments" on public.receipt_adjustments;
create policy "authenticated can insert receipt adjustments" on public.receipt_adjustments as permissive for insert to authenticated
  with check (( SELECT has_permission('payments:write'::text) AS has_permission));

drop policy if exists "authenticated can read receipt adjustments" on public.receipt_adjustments;
create policy "authenticated can read receipt adjustments" on public.receipt_adjustments as permissive for select to authenticated
  using (( SELECT has_any_permission(ARRAY['payments:view'::text, 'receipts:view'::text, 'reports:view'::text, 'defaulters:view'::text]) AS has_any_permission));

drop policy if exists "authenticated can read receipt finance adjustments" on public.receipt_finance_adjustments;
create policy "authenticated can read receipt finance adjustments" on public.receipt_finance_adjustments as permissive for select to authenticated
  using (true);

drop policy if exists "payment writers can insert receipt finance adjustments" on public.receipt_finance_adjustments;
create policy "payment writers can insert receipt finance adjustments" on public.receipt_finance_adjustments as permissive for insert to authenticated
  with check (( SELECT has_permission('payments:write'::text) AS has_permission));

drop policy if exists "authenticated can insert receipts" on public.receipts;
create policy "authenticated can insert receipts" on public.receipts as permissive for insert to authenticated
  with check (( SELECT has_permission('payments:write'::text) AS has_permission));

drop policy if exists "authenticated can read receipts" on public.receipts;
create policy "authenticated can read receipts" on public.receipts as permissive for select to authenticated
  using (( SELECT has_any_permission(ARRAY['payments:view'::text, 'ledger:view'::text, 'receipts:view'::text, 'dashboard:view'::text, 'finance:view'::text]) AS has_any_permission));

drop policy if exists "notion sync can read receipts" on public.receipts;
create policy "notion sync can read receipts" on public.receipts as permissive for select to notion_fee_sync_role
  using (true);

drop policy if exists "authenticated can insert refund requests" on public.refund_requests;
create policy "authenticated can insert refund requests" on public.refund_requests as permissive for insert to authenticated
  with check (( SELECT has_permission('finance:write'::text) AS has_permission));

drop policy if exists "authenticated can read refund requests" on public.refund_requests;
create policy "authenticated can read refund requests" on public.refund_requests as permissive for select to authenticated
  using (( SELECT has_permission('finance:view'::text) AS has_permission));

drop policy if exists "authenticated can update refund requests" on public.refund_requests;
create policy "authenticated can update refund requests" on public.refund_requests as permissive for update to authenticated
  using (( SELECT has_any_permission(ARRAY['finance:write'::text, 'finance:approve'::text]) AS has_any_permission))
  with check (( SELECT has_any_permission(ARRAY['finance:write'::text, 'finance:approve'::text]) AS has_any_permission));

drop policy if exists "authenticated can insert school fee defaults" on public.school_fee_defaults;
create policy "authenticated can insert school fee defaults" on public.school_fee_defaults as permissive for insert to authenticated
  with check (( SELECT has_permission('fees:write'::text) AS has_permission));

drop policy if exists "authenticated can read school fee defaults" on public.school_fee_defaults;
create policy "authenticated can read school fee defaults" on public.school_fee_defaults as permissive for select to authenticated
  using (( SELECT has_permission('fees:view'::text) AS has_permission));

drop policy if exists "authenticated can update school fee defaults" on public.school_fee_defaults;
create policy "authenticated can update school fee defaults" on public.school_fee_defaults as permissive for update to authenticated
  using (( SELECT has_permission('fees:write'::text) AS has_permission))
  with check (( SELECT has_permission('fees:write'::text) AS has_permission));

drop policy if exists "notion sync can read school_fee_defaults" on public.school_fee_defaults;
create policy "notion sync can read school_fee_defaults" on public.school_fee_defaults as permissive for select to notion_fee_sync_role
  using (true);

drop policy if exists "fees:view can read reconcile log" on public.session_reconcile_log;
create policy "fees:view can read reconcile log" on public.session_reconcile_log as permissive for select to authenticated
  using (( SELECT has_permission('fees:view'::text) AS has_permission));

drop policy if exists "fees:write can update reconcile log" on public.session_reconcile_log;
create policy "fees:write can update reconcile log" on public.session_reconcile_log as permissive for update to authenticated
  using (( SELECT has_permission('fees:write'::text) AS has_permission));

drop policy if exists "fees:write can write reconcile log" on public.session_reconcile_log;
create policy "fees:write can write reconcile log" on public.session_reconcile_log as permissive for insert to authenticated
  with check (( SELECT has_permission('fees:write'::text) AS has_permission));

drop policy if exists "admins can insert setup progress" on public.setup_progress;
create policy "admins can insert setup progress" on public.setup_progress as permissive for insert to authenticated
  with check (( SELECT has_permission('settings:write'::text) AS has_permission));

drop policy if exists "admins can update setup progress" on public.setup_progress;
create policy "admins can update setup progress" on public.setup_progress as permissive for update to authenticated
  using (( SELECT has_permission('settings:write'::text) AS has_permission))
  with check (( SELECT has_permission('settings:write'::text) AS has_permission));

drop policy if exists "staff can read setup progress" on public.setup_progress;
create policy "staff can read setup progress" on public.setup_progress as permissive for select to authenticated
  using (( SELECT has_permission('dashboard:view'::text) AS has_permission));

drop policy if exists "authenticated can insert carry forward balances" on public.student_carry_forward_balances;
create policy "authenticated can insert carry forward balances" on public.student_carry_forward_balances as permissive for insert to authenticated
  with check (( SELECT has_permission('fees:write'::text) AS has_permission));

drop policy if exists "authenticated can read carry forward balances" on public.student_carry_forward_balances;
create policy "authenticated can read carry forward balances" on public.student_carry_forward_balances as permissive for select to authenticated
  using (( SELECT has_permission('fees:view'::text) AS has_permission));

drop policy if exists "authenticated can update carry forward balances" on public.student_carry_forward_balances;
create policy "authenticated can update carry forward balances" on public.student_carry_forward_balances as permissive for update to authenticated
  using (( SELECT has_permission('fees:write'::text) AS has_permission))
  with check (( SELECT has_permission('fees:write'::text) AS has_permission));

drop policy if exists "admin can insert collection flags" on public.student_collection_flags;
create policy "admin can insert collection flags" on public.student_collection_flags as permissive for insert to authenticated
  with check (( SELECT has_permission('students:write'::text) AS has_permission));

drop policy if exists "admin can update collection flags" on public.student_collection_flags;
create policy "admin can update collection flags" on public.student_collection_flags as permissive for update to authenticated
  using (( SELECT has_permission('students:write'::text) AS has_permission))
  with check (( SELECT has_permission('students:write'::text) AS has_permission));

drop policy if exists "staff can read collection flags" on public.student_collection_flags;
create policy "staff can read collection flags" on public.student_collection_flags as permissive for select to authenticated
  using (( SELECT has_permission('defaulters:view'::text) AS has_permission));

drop policy if exists "authenticated can delete student conventional discounts" on public.student_conventional_discount_assignments;
create policy "authenticated can delete student conventional discounts" on public.student_conventional_discount_assignments as permissive for delete to authenticated
  using (( SELECT has_permission('students:write'::text) AS has_permission));

drop policy if exists "authenticated can insert student conventional discounts" on public.student_conventional_discount_assignments;
create policy "authenticated can insert student conventional discounts" on public.student_conventional_discount_assignments as permissive for insert to authenticated
  with check (( SELECT has_permission('students:write'::text) AS has_permission));

drop policy if exists "authenticated can read student conventional discounts" on public.student_conventional_discount_assignments;
create policy "authenticated can read student conventional discounts" on public.student_conventional_discount_assignments as permissive for select to authenticated
  using (( SELECT has_any_permission(ARRAY['students:view'::text, 'fees:view'::text, 'payments:view'::text, 'reports:view'::text, 'defaulters:view'::text]) AS has_any_permission));

drop policy if exists "authenticated can update student conventional discounts" on public.student_conventional_discount_assignments;
create policy "authenticated can update student conventional discounts" on public.student_conventional_discount_assignments as permissive for update to authenticated
  using (( SELECT has_permission('students:write'::text) AS has_permission))
  with check (( SELECT has_permission('students:write'::text) AS has_permission));

drop policy if exists "authenticated can delete student family groups" on public.student_family_groups;
create policy "authenticated can delete student family groups" on public.student_family_groups as permissive for delete to authenticated
  using (( SELECT has_permission('students:write'::text) AS has_permission));

drop policy if exists "authenticated can insert student family groups" on public.student_family_groups;
create policy "authenticated can insert student family groups" on public.student_family_groups as permissive for insert to authenticated
  with check (( SELECT has_permission('students:write'::text) AS has_permission));

drop policy if exists "authenticated can read student family groups" on public.student_family_groups;
create policy "authenticated can read student family groups" on public.student_family_groups as permissive for select to authenticated
  using (( SELECT has_any_permission(ARRAY['students:view'::text, 'fees:view'::text, 'reports:view'::text]) AS has_any_permission));

drop policy if exists "authenticated can update student family groups" on public.student_family_groups;
create policy "authenticated can update student family groups" on public.student_family_groups as permissive for update to authenticated
  using (( SELECT has_permission('students:write'::text) AS has_permission))
  with check (( SELECT has_permission('students:write'::text) AS has_permission));

drop policy if exists "notion sync can read student_family_groups" on public.student_family_groups;
create policy "notion sync can read student_family_groups" on public.student_family_groups as permissive for select to notion_fee_sync_role
  using (true);

drop policy if exists "authenticated can delete student family members" on public.student_family_members;
create policy "authenticated can delete student family members" on public.student_family_members as permissive for delete to authenticated
  using (( SELECT has_permission('students:write'::text) AS has_permission));

drop policy if exists "authenticated can insert student family members" on public.student_family_members;
create policy "authenticated can insert student family members" on public.student_family_members as permissive for insert to authenticated
  with check (( SELECT has_permission('students:write'::text) AS has_permission));

drop policy if exists "authenticated can read student family members" on public.student_family_members;
create policy "authenticated can read student family members" on public.student_family_members as permissive for select to authenticated
  using (( SELECT has_any_permission(ARRAY['students:view'::text, 'fees:view'::text, 'reports:view'::text]) AS has_any_permission));

drop policy if exists "authenticated can update student family members" on public.student_family_members;
create policy "authenticated can update student family members" on public.student_family_members as permissive for update to authenticated
  using (( SELECT has_permission('students:write'::text) AS has_permission))
  with check (( SELECT has_permission('students:write'::text) AS has_permission));

drop policy if exists "notion sync can read student_family_members" on public.student_family_members;
create policy "notion sync can read student_family_members" on public.student_family_members as permissive for select to notion_fee_sync_role
  using (true);

drop policy if exists "authenticated can insert student fee overrides" on public.student_fee_overrides;
create policy "authenticated can insert student fee overrides" on public.student_fee_overrides as permissive for insert to authenticated
  with check (( SELECT has_permission('fees:write'::text) AS has_permission));

drop policy if exists "authenticated can read student fee overrides" on public.student_fee_overrides;
create policy "authenticated can read student fee overrides" on public.student_fee_overrides as permissive for select to authenticated
  using (( SELECT has_permission('fees:view'::text) AS has_permission));

drop policy if exists "authenticated can update student fee overrides" on public.student_fee_overrides;
create policy "authenticated can update student fee overrides" on public.student_fee_overrides as permissive for update to authenticated
  using (( SELECT has_permission('fees:write'::text) AS has_permission))
  with check (( SELECT has_permission('fees:write'::text) AS has_permission));

drop policy if exists "notion sync can read student_fee_overrides" on public.student_fee_overrides;
create policy "notion sync can read student_fee_overrides" on public.student_fee_overrides as permissive for select to notion_fee_sync_role
  using (true);

drop policy if exists "staff can grant late fee waivers" on public.student_late_fee_waivers;
create policy "staff can grant late fee waivers" on public.student_late_fee_waivers as permissive for insert to authenticated
  with check (( SELECT has_permission('payments:waive_late_fee'::text) AS has_permission));

drop policy if exists "staff can read late fee waivers" on public.student_late_fee_waivers;
create policy "staff can read late fee waivers" on public.student_late_fee_waivers as permissive for select to authenticated
  using (( SELECT has_any_permission(ARRAY['fees:view'::text, 'payments:view'::text]) AS has_any_permission));

drop policy if exists "staff can void late fee waivers" on public.student_late_fee_waivers;
create policy "staff can void late fee waivers" on public.student_late_fee_waivers as permissive for update to authenticated
  using (( SELECT has_permission('payments:adjust'::text) AS has_permission))
  with check (( SELECT has_permission('payments:adjust'::text) AS has_permission));

drop policy if exists "staff can insert student session reanchor log" on public.student_session_reanchor_log;
create policy "staff can insert student session reanchor log" on public.student_session_reanchor_log as permissive for insert to authenticated
  with check (( SELECT has_permission('fees:write'::text) AS has_permission));

drop policy if exists "staff can read student session reanchor log" on public.student_session_reanchor_log;
create policy "staff can read student session reanchor log" on public.student_session_reanchor_log as permissive for select to authenticated
  using (( SELECT has_any_permission(ARRAY['students:view'::text, 'fees:view'::text, 'finance:view'::text]) AS has_any_permission));

drop policy if exists "staff can insert share links" on public.student_share_links;
create policy "staff can insert share links" on public.student_share_links as permissive for insert to authenticated
  with check (( SELECT has_permission('students:write'::text) AS has_permission));

drop policy if exists "staff can read share links" on public.student_share_links;
create policy "staff can read share links" on public.student_share_links as permissive for select to authenticated
  using (( SELECT has_permission('students:view'::text) AS has_permission));

drop policy if exists "staff can update share links" on public.student_share_links;
create policy "staff can update share links" on public.student_share_links as permissive for update to authenticated
  using (( SELECT has_permission('students:write'::text) AS has_permission))
  with check (( SELECT has_permission('students:write'::text) AS has_permission));

drop policy if exists "authenticated can insert students" on public.students;
create policy "authenticated can insert students" on public.students as permissive for insert to authenticated
  with check (( SELECT has_permission('students:write'::text) AS has_permission));

drop policy if exists "authenticated can read students" on public.students;
create policy "authenticated can read students" on public.students as permissive for select to authenticated
  using (( SELECT has_any_permission(ARRAY['students:view'::text, 'payments:view'::text, 'ledger:view'::text, 'receipts:view'::text, 'defaulters:view'::text, 'dashboard:view'::text, 'finance:view'::text]) AS has_any_permission));

drop policy if exists "authenticated can update students" on public.students;
create policy "authenticated can update students" on public.students as permissive for update to authenticated
  using (( SELECT has_permission('students:write'::text) AS has_permission))
  with check (( SELECT has_permission('students:write'::text) AS has_permission));

drop policy if exists "notion sync can read students" on public.students;
create policy "notion sync can read students" on public.students as permissive for select to notion_fee_sync_role
  using (true);

drop policy if exists "authenticated can insert transport routes" on public.transport_routes;
create policy "authenticated can insert transport routes" on public.transport_routes as permissive for insert to authenticated
  with check (( SELECT has_permission('fees:write'::text) AS has_permission));

drop policy if exists "authenticated can read transport routes" on public.transport_routes;
create policy "authenticated can read transport routes" on public.transport_routes as permissive for select to authenticated
  using (( SELECT has_any_permission(ARRAY['students:view'::text, 'fees:view'::text, 'defaulters:view'::text]) AS has_any_permission));

drop policy if exists "authenticated can update transport routes" on public.transport_routes;
create policy "authenticated can update transport routes" on public.transport_routes as permissive for update to authenticated
  using (( SELECT has_permission('fees:write'::text) AS has_permission))
  with check (( SELECT has_permission('fees:write'::text) AS has_permission));

drop policy if exists "notion sync can read transport_routes" on public.transport_routes;
create policy "notion sync can read transport_routes" on public.transport_routes as permissive for select to notion_fee_sync_role
  using (true);

drop policy if exists "user_activity_events: staff insert" on public.user_activity_events;
create policy "user_activity_events: staff insert" on public.user_activity_events as permissive for insert to public
  with check ((( SELECT auth.role() AS role) = 'authenticated'::text));

drop policy if exists "user_activity_events: staff read" on public.user_activity_events;
create policy "user_activity_events: staff read" on public.user_activity_events as permissive for select to public
  using ((( SELECT auth.role() AS role) = 'authenticated'::text));

drop policy if exists "authenticated can insert users" on public.users;
create policy "authenticated can insert users" on public.users as permissive for insert to authenticated
  with check (( SELECT has_permission('staff:manage'::text) AS has_permission));

drop policy if exists "authenticated can read users" on public.users;
create policy "authenticated can read users" on public.users as permissive for select to authenticated
  using (( SELECT has_any_permission(ARRAY['dashboard:view'::text, 'ledger:view'::text, 'receipts:view'::text, 'staff:manage'::text, 'finance:view'::text]) AS has_any_permission));

drop policy if exists "authenticated can update users" on public.users;
create policy "authenticated can update users" on public.users as permissive for update to authenticated
  using (( SELECT has_permission('staff:manage'::text) AS has_permission))
  with check (( SELECT has_permission('staff:manage'::text) AS has_permission));

drop policy if exists "whatsapp_templates: admin write delete" on public.whatsapp_templates;
create policy "whatsapp_templates: admin write delete" on public.whatsapp_templates as permissive for delete to public
  using ((( SELECT auth.role() AS role) = 'authenticated'::text));

drop policy if exists "whatsapp_templates: admin write insert" on public.whatsapp_templates;
create policy "whatsapp_templates: admin write insert" on public.whatsapp_templates as permissive for insert to public
  with check ((( SELECT auth.role() AS role) = 'authenticated'::text));

drop policy if exists "whatsapp_templates: admin write update" on public.whatsapp_templates;
create policy "whatsapp_templates: admin write update" on public.whatsapp_templates as permissive for update to public
  using ((( SELECT auth.role() AS role) = 'authenticated'::text))
  with check ((( SELECT auth.role() AS role) = 'authenticated'::text));

drop policy if exists "whatsapp_templates: staff read" on public.whatsapp_templates;
create policy "whatsapp_templates: staff read" on public.whatsapp_templates as permissive for select to public
  using ((( SELECT auth.role() AS role) = 'authenticated'::text));


-- Grants --------------------------------------------------------------------

revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
grant usage on schema private to service_role;
grant usage on schema public to anon;
grant usage on schema public to authenticated;
grant usage on schema public to service_role;

grant delete, insert, references, select, trigger, truncate, update on table public.academic_sessions to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.academic_sessions to authenticated;
grant delete, insert, references, select, trigger, truncate, update on table public.academic_sessions to service_role;
grant delete, insert, references, select, trigger, truncate, update on table public.app_settings to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.app_settings to authenticated;
grant delete, insert, references, select, trigger, truncate, update on table public.app_settings to service_role;
grant delete, insert, references, select, trigger, truncate, update on table public.audit_logs to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.audit_logs to authenticated;
grant delete, insert, references, select, trigger, truncate, update on table public.audit_logs to service_role;
grant delete, insert, references, select, trigger, truncate, update on table public.classes to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.classes to authenticated;
grant delete, insert, references, select, trigger, truncate, update on table public.classes to service_role;
grant delete, insert, references, select, trigger, truncate, update on table public.collection_closures to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.collection_closures to authenticated;
grant delete, insert, references, select, trigger, truncate, update on table public.collection_closures to service_role;
grant delete, insert, references, select, trigger, truncate, update on table public.config_change_batches to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.config_change_batches to authenticated;
grant delete, insert, references, select, trigger, truncate, update on table public.config_change_batches to service_role;
grant delete, insert, references, select, trigger, truncate, update on table public.config_change_blocked_installments to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.config_change_blocked_installments to authenticated;
grant delete, insert, references, select, trigger, truncate, update on table public.config_change_blocked_installments to service_role;
grant delete, insert, references, select, trigger, truncate, update on table public.conventional_discount_policies to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.conventional_discount_policies to authenticated;
grant delete, insert, references, select, trigger, truncate, update on table public.conventional_discount_policies to service_role;
grant delete, insert, references, select, trigger, truncate, update on table public.defaulter_contacts to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.defaulter_contacts to authenticated;
grant delete, insert, references, select, trigger, truncate, update on table public.defaulter_contacts to service_role;
grant delete, insert, references, select, trigger, truncate, update on table public.defaulter_recovery_state to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.defaulter_recovery_state to authenticated;
grant delete, insert, references, select, trigger, truncate, update on table public.defaulter_recovery_state to service_role;
grant delete, insert, references, select, trigger, truncate, update on table public.family_payments to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.family_payments to authenticated;
grant delete, insert, references, select, trigger, truncate, update on table public.family_payments to service_role;
grant delete, insert, references, select, trigger, truncate, update on table public.fee_policy_configs to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.fee_policy_configs to authenticated;
grant delete, insert, references, select, trigger, truncate, update on table public.fee_policy_configs to service_role;
grant delete, insert, references, select, trigger, truncate, update on table public.fee_settings to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.fee_settings to authenticated;
grant delete, insert, references, select, trigger, truncate, update on table public.fee_settings to service_role;
grant delete, insert, references, select, trigger, truncate, update on table public.import_batches to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.import_batches to authenticated;
grant delete, insert, references, select, trigger, truncate, update on table public.import_batches to service_role;
grant delete, insert, references, select, trigger, truncate, update on table public.import_rows to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.import_rows to authenticated;
grant delete, insert, references, select, trigger, truncate, update on table public.import_rows to service_role;
grant delete, insert, references, select, trigger, truncate, update on table public.installments to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.installments to authenticated;
grant delete, insert, references, select, trigger, truncate, update on table public.installments to service_role;
grant delete, insert, references, select, trigger, truncate, update on table public.late_fee_rule_change_snapshot to service_role;
grant delete, insert, references, select, trigger, truncate, update on table public.late_fee_waiver_pool_snapshot to service_role;
grant delete, insert, references, select, trigger, truncate, update on table public.ledger_regeneration_batches to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.ledger_regeneration_batches to authenticated;
grant delete, insert, references, select, trigger, truncate, update on table public.ledger_regeneration_batches to service_role;
grant delete, insert, references, select, trigger, truncate, update on table public.ledger_regeneration_rows to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.ledger_regeneration_rows to authenticated;
grant delete, insert, references, select, trigger, truncate, update on table public.ledger_regeneration_rows to service_role;
grant delete, insert, references, select, trigger, truncate, update on table public.notion_sync_log to service_role;
grant delete, insert, references, select, trigger, truncate, update on table public.office_sync_events to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.office_sync_events to authenticated;
grant delete, insert, references, select, trigger, truncate, update on table public.office_sync_events to service_role;
grant delete, insert, references, select, trigger, truncate, update on table public.payment_adjustment_reviews to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.payment_adjustment_reviews to authenticated;
grant delete, insert, references, select, trigger, truncate, update on table public.payment_adjustment_reviews to service_role;
grant delete, insert, references, select, trigger, truncate, update on table public.payment_adjustments to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.payment_adjustments to authenticated;
grant delete, insert, references, select, trigger, truncate, update on table public.payment_adjustments to service_role;
grant delete, insert, references, select, trigger, truncate, update on table public.payment_import_batches to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.payment_import_batches to authenticated;
grant delete, insert, references, select, trigger, truncate, update on table public.payment_import_batches to service_role;
grant delete, insert, references, select, trigger, truncate, update on table public.payment_import_rows to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.payment_import_rows to authenticated;
grant delete, insert, references, select, trigger, truncate, update on table public.payment_import_rows to service_role;
grant delete, insert, references, select, trigger, truncate, update on table public.payments to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.payments to authenticated;
grant delete, insert, references, select, trigger, truncate, update on table public.payments to service_role;
grant delete, insert, references, select, trigger, truncate, update on table public.prev_year_import_batches to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.prev_year_import_batches to authenticated;
grant delete, insert, references, select, trigger, truncate, update on table public.prev_year_import_batches to service_role;
grant delete, insert, references, select, trigger, truncate, update on table public.prev_year_import_rows to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.prev_year_import_rows to authenticated;
grant delete, insert, references, select, trigger, truncate, update on table public.prev_year_import_rows to service_role;
grant delete, insert, references, select, trigger, truncate, update on table public.promotion_run_entries to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.promotion_run_entries to authenticated;
grant delete, insert, references, select, trigger, truncate, update on table public.promotion_run_entries to service_role;
grant delete, insert, references, select, trigger, truncate, update on table public.promotion_runs to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.promotion_runs to authenticated;
grant delete, insert, references, select, trigger, truncate, update on table public.promotion_runs to service_role;
grant delete, insert, references, select, trigger, truncate, update on table public.receipt_adjustments to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.receipt_adjustments to authenticated;
grant delete, insert, references, select, trigger, truncate, update on table public.receipt_adjustments to service_role;
grant delete, insert, references, select, trigger, truncate, update on table public.receipt_finance_adjustments to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.receipt_finance_adjustments to authenticated;
grant delete, insert, references, select, trigger, truncate, update on table public.receipt_finance_adjustments to service_role;
grant delete, insert, references, select, trigger, truncate, update on table public.receipts to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.receipts to authenticated;
grant delete, insert, references, select, trigger, truncate, update on table public.receipts to service_role;
grant delete, insert, references, select, trigger, truncate, update on table public.refund_requests to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.refund_requests to authenticated;
grant delete, insert, references, select, trigger, truncate, update on table public.refund_requests to service_role;
grant delete, insert, references, select, trigger, truncate, update on table public.school_fee_defaults to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.school_fee_defaults to authenticated;
grant delete, insert, references, select, trigger, truncate, update on table public.school_fee_defaults to service_role;
grant delete, insert, references, select, trigger, truncate, update on table public.session_reconcile_log to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.session_reconcile_log to authenticated;
grant delete, insert, references, select, trigger, truncate, update on table public.session_reconcile_log to service_role;
grant delete, insert, references, select, trigger, truncate, update on table public.setup_progress to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.setup_progress to authenticated;
grant delete, insert, references, select, trigger, truncate, update on table public.setup_progress to service_role;
grant delete, insert, references, select, trigger, truncate, update on table public.student_carry_forward_balances to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.student_carry_forward_balances to authenticated;
grant delete, insert, references, select, trigger, truncate, update on table public.student_carry_forward_balances to service_role;
grant delete, insert, references, select, trigger, truncate, update on table public.student_collection_flags to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.student_collection_flags to authenticated;
grant delete, insert, references, select, trigger, truncate, update on table public.student_collection_flags to service_role;
grant delete, insert, references, select, trigger, truncate, update on table public.student_conventional_discount_assignments to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.student_conventional_discount_assignments to authenticated;
grant delete, insert, references, select, trigger, truncate, update on table public.student_conventional_discount_assignments to service_role;
grant delete, insert, references, select, trigger, truncate, update on table public.student_family_groups to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.student_family_groups to authenticated;
grant delete, insert, references, select, trigger, truncate, update on table public.student_family_groups to service_role;
grant delete, insert, references, select, trigger, truncate, update on table public.student_family_members to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.student_family_members to authenticated;
grant delete, insert, references, select, trigger, truncate, update on table public.student_family_members to service_role;
grant delete, insert, references, select, trigger, truncate, update on table public.student_fee_overrides to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.student_fee_overrides to authenticated;
grant delete, insert, references, select, trigger, truncate, update on table public.student_fee_overrides to service_role;
grant delete, insert, references, select, trigger, truncate, update on table public.student_late_fee_waivers to authenticated;
grant delete, insert, references, select, trigger, truncate, update on table public.student_late_fee_waivers to service_role;
grant delete, insert, references, select, trigger, truncate, update on table public.student_session_reanchor_log to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.student_session_reanchor_log to authenticated;
grant delete, insert, references, select, trigger, truncate, update on table public.student_session_reanchor_log to service_role;
grant delete, insert, references, select, trigger, truncate, update on table public.student_share_links to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.student_share_links to authenticated;
grant delete, insert, references, select, trigger, truncate, update on table public.student_share_links to service_role;
grant delete, insert, references, select, trigger, truncate, update on table public.students to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.students to authenticated;
grant delete, insert, references, select, trigger, truncate, update on table public.students to service_role;
grant delete, insert, references, select, trigger, truncate, update on table public.transport_routes to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.transport_routes to authenticated;
grant delete, insert, references, select, trigger, truncate, update on table public.transport_routes to service_role;
grant delete, insert, references, select, trigger, truncate, update on table public.user_activity_events to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.user_activity_events to authenticated;
grant delete, insert, references, select, trigger, truncate, update on table public.user_activity_events to service_role;
grant delete, insert, references, select, trigger, truncate, update on table public.users to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.users to authenticated;
grant delete, insert, references, select, trigger, truncate, update on table public.users to service_role;
grant delete, insert, references, select, trigger, truncate, update on table public.v_effective_late_fee_waivers to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.v_effective_late_fee_waivers to authenticated;
grant delete, insert, references, select, trigger, truncate, update on table public.v_effective_late_fee_waivers to service_role;
grant delete, insert, references, select, trigger, truncate, update on table public.v_installment_balances to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.v_installment_balances to authenticated;
grant delete, insert, references, select, trigger, truncate, update on table public.v_installment_balances to service_role;
grant delete, insert, references, select, trigger, truncate, update on table public.v_notion_daily_collection_summary to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.v_notion_daily_collection_summary to authenticated;
grant delete, insert, references, select, trigger, truncate, update on table public.v_notion_daily_collection_summary to service_role;
grant delete, insert, references, select, trigger, truncate, update on table public.v_notion_daily_summary to service_role;
grant delete, insert, references, select, trigger, truncate, update on table public.v_notion_family_fee_summary to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.v_notion_family_fee_summary to authenticated;
grant delete, insert, references, select, trigger, truncate, update on table public.v_notion_family_fee_summary to service_role;
grant delete, insert, references, select, trigger, truncate, update on table public.v_notion_student_fee_summary to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.v_notion_student_fee_summary to authenticated;
grant delete, insert, references, select, trigger, truncate, update on table public.v_notion_student_fee_summary to service_role;
grant delete, insert, references, select, trigger, truncate, update on table public.v_notion_student_fee_sync to service_role;
grant delete, insert, references, select, trigger, truncate, update on table public.v_outstanding_summary to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.v_outstanding_summary to authenticated;
grant delete, insert, references, select, trigger, truncate, update on table public.v_outstanding_summary to service_role;
grant delete, insert, references, select, trigger, truncate, update on table public.v_receipt_effective_allocation_totals to authenticated;
grant delete, insert, references, select, trigger, truncate, update on table public.v_receipt_effective_allocation_totals to service_role;
grant delete, insert, references, select, trigger, truncate, update on table public.v_receipt_reversal_totals to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.v_receipt_reversal_totals to authenticated;
grant delete, insert, references, select, trigger, truncate, update on table public.v_receipt_reversal_totals to service_role;
grant delete, insert, references, select, trigger, truncate, update on table public.v_student_carry_forward_balances to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.v_student_carry_forward_balances to authenticated;
grant delete, insert, references, select, trigger, truncate, update on table public.v_student_carry_forward_balances to service_role;
grant delete, insert, references, select, trigger, truncate, update on table public.v_student_conventional_discounts to authenticated;
grant delete, insert, references, select, trigger, truncate, update on table public.v_student_conventional_discounts to service_role;
grant delete, insert, references, select, trigger, truncate, update on table public.v_student_directory to authenticated;
grant delete, insert, references, select, trigger, truncate, update on table public.v_student_directory to service_role;
grant delete, insert, references, select, trigger, truncate, update on table public.v_student_installment_facets to authenticated;
grant delete, insert, references, select, trigger, truncate, update on table public.v_student_installment_facets to service_role;
grant delete, insert, references, select, trigger, truncate, update on table public.v_student_manual_late_fee_waivers to authenticated;
grant delete, insert, references, select, trigger, truncate, update on table public.v_student_manual_late_fee_waivers to service_role;
grant delete, insert, references, select, trigger, truncate, update on table public.v_student_sibling_groups to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.v_student_sibling_groups to authenticated;
grant delete, insert, references, select, trigger, truncate, update on table public.v_student_sibling_groups to service_role;
grant delete, insert, references, select, trigger, truncate, update on table public.v_transport_route_outstanding to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.v_transport_route_outstanding to authenticated;
grant delete, insert, references, select, trigger, truncate, update on table public.v_transport_route_outstanding to service_role;
grant delete, insert, references, select, trigger, truncate, update on table public.whatsapp_templates to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.whatsapp_templates to authenticated;
grant delete, insert, references, select, trigger, truncate, update on table public.whatsapp_templates to service_role;
grant delete, insert, references, select, trigger, truncate, update on table public.workbook_materialized_view_refresh_queue to service_role;

grant execute on function private.capture_audit_event() to service_role;
grant execute on function private.current_staff_role() to authenticated;
grant execute on function private.current_staff_role() to service_role;
grant execute on function private.enforce_max_active_conventional_discounts() to service_role;
grant execute on function private.enforce_max_active_conventional_discounts_in_schema() to service_role;
grant execute on function private.enforce_third_child_traceability() to anon;
grant execute on function private.enforce_third_child_traceability() to authenticated;
grant execute on function private.enforce_third_child_traceability() to service_role;
grant execute on function private.ensure_single_current_academic_session() to anon;
grant execute on function private.ensure_single_current_academic_session() to authenticated;
grant execute on function private.ensure_single_current_academic_session() to service_role;
grant execute on function private.normalize_staff_role(text) to service_role;
grant execute on function private.normalize_workbook_class_label(text, text) to authenticated;
grant execute on function private.normalize_workbook_class_label(text, text) to service_role;
grant execute on function private.prevent_append_only_mutation() to service_role;
grant execute on function private.prevent_notion_sync_log_mutation() to anon;
grant execute on function private.prevent_notion_sync_log_mutation() to authenticated;
grant execute on function private.prevent_notion_sync_log_mutation() to service_role;
grant execute on function private.prevent_receipt_adjustment_mutation() to service_role;
grant execute on function private.set_actor_columns() to service_role;
grant execute on function private.set_created_by_column() to service_role;
grant execute on function private.set_updated_at() to service_role;
grant execute on function private.sync_staff_profile_from_auth_user() to service_role;
grant execute on function private.vpps_apply_chunk(text, jsonb) to service_role;
grant execute on function private.workbook_installment_snapshot(uuid, date, boolean) to authenticated;
grant execute on function private.workbook_installment_snapshot(uuid, date, boolean) to service_role;
grant execute on function public.active_session_label() to authenticated;
grant execute on function public.active_session_label() to service_role;
grant execute on function public.delete_academic_session_safe(uuid) to authenticated;
grant execute on function public.delete_academic_session_safe(uuid) to service_role;
grant execute on function public.get_dashboard_fee_split(text) to authenticated;
grant execute on function public.get_dashboard_fee_split(text) to service_role;
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
grant execute on function public.import_student_batch_row(uuid, integer, text, uuid, text, date, text, text, text, text, text, uuid, student_status, text, integer, integer, integer, integer, jsonb, integer, integer, text, boolean) to authenticated;
grant execute on function public.import_student_batch_row(uuid, integer, text, uuid, text, date, text, text, text, text, text, uuid, student_status, text, integer, integer, integer, integer, jsonb, integer, integer, text, boolean) to service_role;
grant execute on function public.import_student_batch_row(uuid, integer, text, uuid, text, date, text, text, text, text, text, uuid, student_status, text, integer, integer, integer, integer, jsonb, integer, integer, text, boolean, text, integer, integer) to authenticated;
grant execute on function public.import_student_batch_row(uuid, integer, text, uuid, text, date, text, text, text, text, text, uuid, student_status, text, integer, integer, integer, integer, jsonb, integer, integer, text, boolean, text, integer, integer) to service_role;
grant execute on function public.post_student_payment(uuid, date, payment_mode, integer, text, text, text, text, uuid) to authenticated;
grant execute on function public.post_student_payment(uuid, date, payment_mode, integer, text, text, text, text, uuid) to service_role;
grant execute on function public.post_student_payment_with_adjustments(uuid, date, payment_mode, integer, text, text, text, text, uuid, integer, integer) to authenticated;
grant execute on function public.post_student_payment_with_adjustments(uuid, date, payment_mode, integer, text, text, text, text, uuid, integer, integer) to service_role;
grant execute on function public.preview_workbook_payment_allocation(uuid, date) to authenticated;
grant execute on function public.preview_workbook_payment_allocation(uuid, date) to service_role;
grant execute on function public.process_refund_with_adjustment(uuid) to authenticated;
grant execute on function public.process_refund_with_adjustment(uuid) to service_role;
grant execute on function public.queue_sibling_groups_refresh() to service_role;
grant execute on function public.queue_workbook_materialized_view_refresh() to service_role;
grant execute on function public.realign_recent_import_students_to_active_session(uuid) to authenticated;
grant execute on function public.realign_recent_import_students_to_active_session(uuid) to service_role;
grant execute on function public.refresh_defaulter_recovery_state(text, date) to authenticated;
grant execute on function public.refresh_defaulter_recovery_state(text, date) to service_role;
grant execute on function public.refresh_financial_materialized_views(boolean) to service_role;
grant execute on function public.refresh_sibling_groups_if_requested() to service_role;
grant execute on function public.refresh_workbook_materialized_views_if_requested() to service_role;
grant execute on function public.rls_auto_enable() to service_role;
grant execute on function public.set_my_preferred_locale(text) to authenticated;
grant execute on function public.set_my_preferred_locale(text) to service_role;
grant execute on function public.trigger_refresh_financial_views() to service_role;
grant execute on function public.undo_recent_payment(uuid, text) to authenticated;
grant execute on function public.undo_recent_payment(uuid, text) to service_role;
grant execute on function public.void_late_fee_waiver(uuid, text) to authenticated;
grant execute on function public.void_late_fee_waiver(uuid, text) to service_role;
grant execute on function public.vpps_apply_chunk_proxy(text, jsonb) to service_role;
grant execute on function public.waive_late_fee(uuid, integer, text, text, uuid, uuid) to authenticated;
grant execute on function public.waive_late_fee(uuid, integer, text, text, uuid, uuid) to service_role;


-- Comments ------------------------------------------------------------------

comment on column public.defaulter_contacts.contacted_phone is 'The phone number actually dialed/messaged for this attempt, when known. Used to compute per-number answer rates and the suggested number.';
comment on column public.defaulter_contacts.phone_label is 'Which stored number was used: typically ''Father'' (primary_phone) or ''Mother'' (secondary_phone). NULL for legacy rows logged before attribution.';
comment on column public.defaulter_contacts.snooze_until is 'If set, the next contact attempt should not be expected until this date. Drives the "Snoozed" tab in the defaulters triage queue.';
comment on column public.defaulter_contacts.voice_note_path is 'Storage path inside the defaulter-voice-notes bucket pointing to the recorded audio clip for this contact attempt. Null when no voice note was attached.';
comment on column public.defaulter_recovery_state.last_resolved_contact_id is 'The promised_pay contact already counted into promise reliability. Prevents the refresh function from incrementing counters more than once.';
comment on column public.defaulter_recovery_state.promise_broken_count is 'Count of promises resolved as broken for this student/session. Used for promise reliability scoring.';
comment on column public.defaulter_recovery_state.promise_kept_count is 'Count of promises resolved as kept for this student/session. Used for promise reliability scoring.';
comment on column public.fee_policy_configs.academic_fee_distribution is 'How academic fee is allocated across installments in the workbook calculation model. first_only: full amount in installment 1 (default). equal: split equally across all installments.';
comment on column public.installments.carry_forward_balance_id is 'Links an internal carry-forward installment to the first-class student_carry_forward_balances row.';
comment on column public.installments.carry_forward_fee_head is 'For carry-forward rows, the fee head being carried forward, currently tuition.';
comment on column public.installments.is_carry_forward is 'True for previous-year dues carry-forward lines. Excluded from Fee Setup ledger regeneration cancel/rewrite sweeps; always zero late fee.';
comment on column public.installments.source_session_label is 'For carry-forward rows, the session where the unpaid balance originated.';
comment on column public.installments.target_session_label is 'For carry-forward rows, the session where the balance is collected.';
comment on column public.payment_import_rows.existing_receipt_duplicate is 'A receipt for the same student, date and amount already exists. Acknowledging waives the same-day duplicate guard.';
comment on column public.payment_import_rows.intra_file_duplicate is 'The same student appears more than once within this upload. Acknowledging waives the near-duplicate guard so a genuine repeat payment can post.';
comment on column public.payments.discount_applied_at_posting is 'Quick discount applied to this installment AT POSTING (frozen). Cross-check: the corresponding receipt_adjustments row carries the same delta.';
comment on column public.payments.pending_after_posting is 'Snapshot of the installment pending amount immediately after this payment row was applied (= pending_before - amount - discount - waiver). NULL for rows posted before this column existed.';
comment on column public.payments.pending_before_posting is 'Snapshot of the installment pending amount immediately before this payment row was applied. NULL for rows posted before this column existed.';
comment on column public.payments.waiver_applied_at_posting is 'Late-fee waiver applied to this installment AT POSTING (frozen). Cross-check: receipt_adjustments writeoff row carries the same delta.';
comment on column public.student_carry_forward_balances.backing_installment_id is 'Payment-compatible installment row that receives allocations for this carried-forward balance.';
comment on column public.student_collection_flags.no_call is 'When true, the student is excluded from the Defaulters call queue for this session and shown under the No-call/Trusted segment instead.';
comment on column public.student_fee_overrides.custom_other_fee_head_labels is 'Display labels for custom_other_fee_heads, keyed by the same slug. Values are text. Amounts stay in custom_other_fee_heads as plain integers because the workbook matview casts them with ::integer.';
comment on column public.student_fee_overrides.late_fee_waiver_amount is 'DEPRECATED 2026-08-08. Late-fee waivers now live in public.student_late_fee_waivers, one row per installment. No engine reads this column any more. Retained read-only for legacy consumers pending their removal -- do not write to it.';
comment on column public.student_late_fee_waivers.session_label is 'Derived in the RPC from installments -> classes, never taken from the caller. The old pool had no session column at all, which is how a waiver could leak across academic years.';
comment on column public.student_late_fee_waivers.source is 'manual = staff used the waive action; payment_desk = waived inline while posting; migration = carried over from the old student-level pool; grandfather = auto-issued when the late-fee rule was unified, so that no family''s late fee rose as a result of the rule change.';
comment on column public.students.email is 'Optional parent email address. Used by receipt sharing to enable a mailto draft. Free text — UI validates softly before opening the mail client.';
comment on column public.students.photo_path is 'Storage path inside the student-photos bucket pointing to the avatar image for this student. Null when no photo uploaded.';
comment on column public.users.preferred_locale is 'Staff app language. NULL = follow the vpps_locale cookie, then the default.';
comment on column public.whatsapp_templates.category is 'Hint for grouping in the UI. Free-form within the check constraint.';
comment on column public.whatsapp_templates.placeholders is 'Array of placeholder names (without braces) detected in the body. Maintained by the UI on save to allow quick discovery.';
comment on function get_dashboard_fee_split(text) is 'Current-year / previous-year / late-fee split for the dashboard. Scope is active students PLUS any departed student who has already paid something, because their remaining dues are still collectable; a departed student who never paid has had their installments cancelled and contributes nothing. Expected is base charges only -- late fee is never folded in.';
comment on function get_student_directory_summary(text,uuid,uuid,text,text[],boolean) is 'Totals over the whole filtered set rather than the current page. Expected fees is base charges only -- late fee is never folded in (see 20260808170000).';
comment on function get_student_segment_counts(text,uuid,uuid,text,text[],boolean) is 'Live counts for every filter chip, in one round trip. Attribute families are counted within the structural + enrolment scope but never scope each other, because the status buckets are mutually exclusive and cross-scoping would make every unselected chip read zero.';
comment on function private.workbook_installment_snapshot(uuid,date,boolean) is 'Per-installment financial snapshot. p_include_candidate_late is DEPRECATED and ignored: since the late-fee rule was unified an overdue installment always carries its flat late fee, so there is no longer a "candidate" state. The parameter is retained only to keep the signature stable for existing callers. p_as_of_date still drives balance_status; the late fee itself is always evaluated against current_date so this function and v_workbook_installment_balances cannot disagree.';
comment on function refresh_defaulter_recovery_state(text,date) is 'Resolves latest promised_pay contacts to kept/broken using receipts, then updates defaulter_recovery_state idempotently. Does not mutate defaulter_contacts.';
comment on function trigger_refresh_financial_views() is 'Enqueues a workbook matview refresh. Deliberately does NOT refresh inline — see 20260726000002. Drained by the payment action post-response and by the 2-minute cron backstop.';
comment on function void_late_fee_waiver(uuid,text) is 'Reverse a late-fee waiver, restoring the charge. The row is marked voided, never deleted. Gated on payments:adjust because this RAISES what a family owes. MUST be called with the user-JWT client.';
comment on function waive_late_fee(uuid,integer,text,text,uuid,uuid) is 'Waive late fee for a student, writing per-installment rows to public.student_late_fee_waivers. Waivable is capped at least(final_late_fee, pending_amount): a late fee already paid cannot be waived, because waiving it would turn collected money into an unexplained credit and drop it out of the late-fee figures. p_installment_id targets one installment; omitted, the amount is allocated oldest-first. Idempotent on p_client_request_id. MUST be called with the user-JWT client -- it is SECURITY INVOKER and guards on has_permission(), which needs auth.uid().';
comment on materialized view public.mv_student_sibling_groups is 'Read optimization for authenticated sibling workflows; never a write source of truth.';
comment on table private.vpps_direct_import_backups is 'Pre-write JSON snapshots for audited direct VPPS import operations.';
comment on table private.vpps_direct_import_stage_dues is 'Private staging dues for the 2026-27 latest Excel direct import.';
comment on table private.vpps_direct_import_stage_skipped is 'Private staging skipped-row audit for the 2026-27 latest Excel direct import.';
comment on table private.vpps_direct_import_stage_students is 'Private staging rows for the 2026-27 latest Excel direct import.';
comment on table private.vpps_student_source_mapping is 'Maps workbook source_student_uid (e.g. STU-0146) to the public.students.id it resolved to during a VPPS direct import. Used to keep re-runs idempotent and to anchor historical payment/fee-line attribution.';
comment on table public.defaulter_contacts is 'Append-only log of defaulter contact attempts. Never UPDATE/DELETE — corrections go in as a new row with outcome=other.';
comment on table public.defaulter_recovery_state is 'Current per-student/session recovery state for the Defaulters desk. Append-only contact attempts stay in defaulter_contacts.';
comment on table public.family_payments is 'Pay-together batches re-enabled (gated by FAMILY_PAYMENTS_ENABLED env flag at the app layer). Each batch links to per-child receipts via receipts.family_payment_id.';
comment on table public.late_fee_rule_change_snapshot is 'Immutable pre-cut-over record of every installment''s late-fee position under the OLD (pre-unification) rule. Read by the waiver backfill and by scripts/verify-late-fee-health.mjs. Never read by application code.';
comment on table public.late_fee_waiver_pool_snapshot is 'Immutable pre-cut-over record of student_fee_overrides.late_fee_waiver_amount, the student-level waiver pool that public.student_late_fee_waivers replaces.';
comment on table public.student_carry_forward_balances is 'Audited previous-session balances carried into a target session. The linked installment remains the payment allocation target; this table is the business model shown to staff.';
comment on table public.student_collection_flags is 'Per-session collection preferences for a student. Currently the admin-only "no-call / will pay anyway" flag that excludes a parent from the call queue.';
comment on table public.student_late_fee_waivers is 'One row per late-fee waiver, targeted at a specific installment. Replaces the student-level rupee pool on student_fee_overrides.late_fee_waiver_amount, which slid between installments whenever a payment changed which installment carried a fee. Append-only in spirit: a waiver is VOIDED (voided_at/voided_by/void_reason), never deleted -- there is deliberately no delete policy.';
comment on table public.user_activity_events is 'Append-only activity log: payments posted, receipts printed, student edits, student views, exports downloaded, defaulter contacts, imports committed. Drives the dashboard activity strip, admin-tools feed, and last-viewed hints.';
comment on table public.whatsapp_templates is 'Admin-maintained library of WhatsApp message templates with placeholder variables. Used by defaulter bulk-message workflow and receipt sharing. The app never sends — it only renders text and opens wa.me links.';
comment on table public.workbook_materialized_view_refresh_queue is 'Service-only internal refresh queue. RLS intentionally has no client policies.';
comment on view public.v_effective_late_fee_waivers is 'Non-voided waiver total per installment. The single thing the late-fee engines join.';
comment on view public.v_receipt_effective_allocation_totals is 'Authenticated audit projection reconciling receipt totals to append-only payment allocations and corrections.';
comment on view public.v_student_conventional_discounts is 'Active conventional discount assignments per student as an array of policy codes (rte / staff_child / third_child), so each policy is individually filterable rather than only as a joined label string.';
comment on view public.v_student_directory is 'One row per student with every filterable segment exposed as a seg_* boolean, plus a lowercased search_text. The single source both Students and Transactions filter against, so a predicate and its COUNT come from the same query. security_invoker: fee-profile columns read false for staff without fees:view, matching existing behaviour -- gate those chips on the permission rather than showing zeros.';
comment on view public.v_student_installment_facets is 'Per-student installment rollups that v_workbook_student_financials does not expose -- notably the previous-year carry-forward balance. Mirrors the TypeScript helpers in lib/fees/due-amounts.ts, including their existing rounding quirks, so filters agree with the figures already rendered.';
comment on view public.v_student_manual_late_fee_waivers is 'Late-fee waivers a person actually granted, excluding the automatic grandfather and migration rows written when the late-fee rule was unified. This is what a "Late fee waived" filter means to the office.';


-- Scheduled jobs (pg_cron) — informational, not replayed --------------------

-- cron.schedule('enqueue-workbook-refresh-daily', '35 18 * * *', ...)  active=true
-- cron.schedule('notion-fee-sync-daily', '0 1 * * *', ...)  active=true
-- cron.schedule('notion-fee-sync-daily-test', '0 1 * * *', ...)  active=true
-- cron.schedule('refresh-sibling-groups-matview', '*/2 * * * *', ...)  active=true
-- cron.schedule('refresh-workbook-materialized-views', '*/2 * * * *', ...)  active=true
