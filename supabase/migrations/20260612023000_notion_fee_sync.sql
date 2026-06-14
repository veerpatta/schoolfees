-- VPPS Notion fee sync support.
-- Safety boundaries:
-- - No writes to students, fee setup, installments, receipts, payments, or audit data.
-- - Notion reads from these projections and inserts one append-only sync log row per run.
-- - The scheduled sync remains pointed at TEST-2026-27 until the owner verifies Notion output.

create extension if not exists pg_net with schema extensions;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'notion_fee_sync_role') then
    create role notion_fee_sync_role nologin;
  end if;
end
$$;

create table if not exists public.notion_sync_log (
  id uuid primary key default gen_random_uuid(),
  run_started_at timestamptz not null default now(),
  session_label text not null,
  students_synced integer not null default 0 check (students_synced >= 0),
  families_synced integer not null default 0 check (families_synced >= 0),
  daily_summaries_synced integer not null default 0 check (daily_summaries_synced >= 0),
  tracker_rows_synced integer not null default 0 check (tracker_rows_synced >= 0),
  errors_count integer not null default 0 check (errors_count >= 0),
  status text not null check (status in ('dry_run', 'success', 'failed', 'partial')),
  error_detail text,
  dry_run boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.notion_sync_log
  add column if not exists families_synced integer default 0,
  add column if not exists daily_summaries_synced integer default 0,
  add column if not exists tracker_rows_synced integer default 0,
  add column if not exists errors_count integer default 0,
  add column if not exists dry_run boolean default false,
  add column if not exists created_at timestamptz default now();

alter table public.notion_sync_log enable row level security;

create or replace function private.prevent_notion_sync_log_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Notion sync log is append-only.';
end;
$$;

drop trigger if exists notion_sync_log_is_append_only on public.notion_sync_log;
create trigger notion_sync_log_is_append_only
before update or delete on public.notion_sync_log
for each row execute function private.prevent_notion_sync_log_mutation();

drop policy if exists "notion sync role can insert log rows" on public.notion_sync_log;
create policy "notion sync role can insert log rows"
on public.notion_sync_log for insert
to notion_fee_sync_role
with check (true);

drop policy if exists "notion sync role can read log rows" on public.notion_sync_log;
create policy "notion sync role can read log rows"
on public.notion_sync_log for select
to notion_fee_sync_role
using (true);

create or replace view public.v_notion_student_fee_summary as
with explicit_family as (
  select distinct on (member.student_id, member.academic_session_label)
    member.student_id,
    member.academic_session_label as session_label,
    group_record.id as family_group_id,
    group_record.family_label,
    group_record.guardian_phone
  from public.student_family_members as member
  join public.student_family_groups as group_record
    on group_record.id = member.family_group_id
  order by member.student_id, member.academic_session_label, group_record.updated_at desc nulls last, group_record.created_at desc
),
student_keys as (
  select
    financials.*,
    coalesce(nullif(regexp_replace(financials.father_phone, '[^0-9]', '', 'g'), ''), nullif(regexp_replace(financials.mother_phone, '[^0-9]', '', 'g'), '')) as normalized_phone,
    explicit_family.family_group_id,
    explicit_family.family_label
  from public.v_workbook_student_financials as financials
  left join explicit_family
    on explicit_family.student_id = financials.student_id
   and explicit_family.session_label = financials.session_label
),
last_receipt as (
  select distinct on (receipt_row.student_id)
    receipt_row.student_id,
    receipt_row.payment_date as last_payment_date,
    receipt_row.total_amount as last_payment_amount,
    receipt_row.payment_mode::text as last_payment_mode,
    receipt_row.receipt_number as last_receipt_no
  from public.receipts as receipt_row
  order by receipt_row.student_id, receipt_row.payment_date desc, receipt_row.created_at desc
),
installment_rollup as (
  select
    balances.student_id,
    max(balances.due_date) filter (where balances.installment_no = 1) as inst1_due_date,
    max(balances.total_charge) filter (where balances.installment_no = 1)::integer as inst1_due_amount,
    max(balances.paid_amount) filter (where balances.installment_no = 1)::integer as inst1_paid_amount,
    max(case
      when balances.installment_no = 1 and balances.pending_amount <= 0 then 'Paid'
      when balances.installment_no = 1 and (balances.paid_amount > 0 or balances.discount_closeout_amount > 0) then 'Partial'
      when balances.installment_no = 1 then 'Pending'
    end) as inst1_status,
    max(balances.due_date) filter (where balances.installment_no = 2) as inst2_due_date,
    max(balances.total_charge) filter (where balances.installment_no = 2)::integer as inst2_due_amount,
    max(balances.paid_amount) filter (where balances.installment_no = 2)::integer as inst2_paid_amount,
    max(case
      when balances.installment_no = 2 and balances.pending_amount <= 0 then 'Paid'
      when balances.installment_no = 2 and (balances.paid_amount > 0 or balances.discount_closeout_amount > 0) then 'Partial'
      when balances.installment_no = 2 then 'Pending'
    end) as inst2_status,
    max(balances.due_date) filter (where balances.installment_no = 3) as inst3_due_date,
    max(balances.total_charge) filter (where balances.installment_no = 3)::integer as inst3_due_amount,
    max(balances.paid_amount) filter (where balances.installment_no = 3)::integer as inst3_paid_amount,
    max(case
      when balances.installment_no = 3 and balances.pending_amount <= 0 then 'Paid'
      when balances.installment_no = 3 and (balances.paid_amount > 0 or balances.discount_closeout_amount > 0) then 'Partial'
      when balances.installment_no = 3 then 'Pending'
    end) as inst3_status,
    max(balances.due_date) filter (where balances.installment_no = 4) as inst4_due_date,
    max(balances.total_charge) filter (where balances.installment_no = 4)::integer as inst4_due_amount,
    max(balances.paid_amount) filter (where balances.installment_no = 4)::integer as inst4_paid_amount,
    max(case
      when balances.installment_no = 4 and balances.pending_amount <= 0 then 'Paid'
      when balances.installment_no = 4 and (balances.paid_amount > 0 or balances.discount_closeout_amount > 0) then 'Partial'
      when balances.installment_no = 4 then 'Pending'
    end) as inst4_status
  from public.v_workbook_installment_balances as balances
  group by balances.student_id
)
select
  student_keys.student_id,
  student_keys.admission_no as sr_no,
  student_keys.student_name,
  student_keys.class_label as class,
  student_keys.session_label as session,
  student_keys.father_name,
  student_keys.father_phone as phone,
  coalesce(
    'family:' || student_keys.family_group_id::text,
    case
      when student_keys.normalized_phone ~ '^[0-9]{10,}$' then 'phone:' || right(student_keys.normalized_phone, 10)
      else 'fallback:' || md5(
        lower(coalesce(student_keys.father_name, 'unknown')) || '|' ||
        lower(coalesce(student_keys.transport_route_name, student_keys.class_label, 'unknown'))
      )
    end
  ) as family_key,
  student_keys.transport_route_name as transport_route,
  student_keys.student_status_label as new_or_old,
  coalesce(student_keys.base_total_due, student_keys.total_due, 0)::integer as total_annual_fees_due,
  coalesce(student_keys.total_paid, 0)::integer as total_paid_to_date,
  coalesce(student_keys.outstanding_amount, 0)::integer as total_pending,
  coalesce(installment_rollup.inst1_due_amount, 0)::integer as inst1_due_amount,
  coalesce(installment_rollup.inst1_paid_amount, 0)::integer as inst1_paid_amount,
  coalesce(installment_rollup.inst1_status, 'Pending') as inst1_status,
  installment_rollup.inst1_due_date,
  coalesce(installment_rollup.inst2_due_amount, 0)::integer as inst2_due_amount,
  coalesce(installment_rollup.inst2_paid_amount, 0)::integer as inst2_paid_amount,
  coalesce(installment_rollup.inst2_status, 'Pending') as inst2_status,
  installment_rollup.inst2_due_date,
  coalesce(installment_rollup.inst3_due_amount, 0)::integer as inst3_due_amount,
  coalesce(installment_rollup.inst3_paid_amount, 0)::integer as inst3_paid_amount,
  coalesce(installment_rollup.inst3_status, 'Pending') as inst3_status,
  installment_rollup.inst3_due_date,
  coalesce(installment_rollup.inst4_due_amount, 0)::integer as inst4_due_amount,
  coalesce(installment_rollup.inst4_paid_amount, 0)::integer as inst4_paid_amount,
  coalesce(installment_rollup.inst4_status, 'Pending') as inst4_status,
  installment_rollup.inst4_due_date,
  coalesce(student_keys.late_fee_total, 0) > 0 as late_fee_applied,
  last_receipt.last_payment_date,
  coalesce(last_receipt.last_payment_amount, 0)::integer as last_payment_amount,
  last_receipt.last_payment_mode,
  last_receipt.last_receipt_no
from student_keys
left join installment_rollup
  on installment_rollup.student_id = student_keys.student_id
left join last_receipt
  on last_receipt.student_id = student_keys.student_id
where student_keys.record_status = 'active';

create or replace view public.v_notion_family_fee_summary as
select
  student_summary.session,
  student_summary.family_key,
  count(*)::integer as sibling_count,
  coalesce(sum(student_summary.total_annual_fees_due), 0)::integer as family_total_due,
  coalesce(sum(student_summary.total_paid_to_date), 0)::integer as family_total_paid,
  coalesce(sum(student_summary.total_pending), 0)::integer as family_total_pending,
  string_agg(student_summary.student_name, ', ' order by student_summary.class, student_summary.student_name) as student_names
from public.v_notion_student_fee_summary as student_summary
group by student_summary.session, student_summary.family_key;

create or replace view public.v_notion_daily_collection_summary as
with sessions as (
  select distinct session_label as session
  from public.classes
),
summary_dates as (
  select sessions.session, current_date as summary_date
  from sessions
  union
  select
    class_row.session_label as session,
    receipt_row.payment_date as summary_date
  from public.receipts as receipt_row
  join public.students as student_row
    on student_row.id = receipt_row.student_id
  join public.classes as class_row
    on class_row.id = student_row.class_id
),
receipt_facts as (
  select
    class_row.session_label as session,
    receipt_row.payment_date,
    receipt_row.id as receipt_id,
    case when receipt_row.payment_mode::text = 'discount' then 0 else receipt_row.total_amount end as collected_amount
  from public.receipts as receipt_row
  join public.students as student_row
    on student_row.id = receipt_row.student_id
  join public.classes as class_row
    on class_row.id = student_row.class_id
),
class_dues as (
  select
    student_summary.session,
    student_summary.class,
    coalesce(sum(student_summary.total_pending), 0)::integer as pending_amount
  from public.v_notion_student_fee_summary as student_summary
  group by student_summary.session, student_summary.class
),
class_dues_json as (
  select
    class_dues.session,
    jsonb_object_agg(class_dues.class, class_dues.pending_amount order by class_dues.class) as dues_by_class
  from class_dues
  group by class_dues.session
),
defaulters as (
  select
    balances.session_label as session,
    count(distinct balances.student_id)::integer as defaulter_count
  from public.v_workbook_installment_balances as balances
  where balances.pending_amount > 0
    and balances.due_date < current_date
  group by balances.session_label
)
select
  summary_dates.session,
  summary_dates.summary_date,
  coalesce(sum(receipt_facts.collected_amount) filter (where receipt_facts.payment_date = summary_dates.summary_date), 0)::integer as total_collected_today,
  coalesce(sum(receipt_facts.collected_amount) filter (
    where receipt_facts.payment_date >= date_trunc('month', summary_dates.summary_date)::date
      and receipt_facts.payment_date <= summary_dates.summary_date
  ), 0)::integer as collection_month_to_date,
  coalesce(sum(receipt_facts.collected_amount) filter (where receipt_facts.payment_date <= summary_dates.summary_date), 0)::integer as collection_session_to_date,
  count(distinct receipt_facts.receipt_id) filter (where receipt_facts.payment_date = summary_dates.summary_date)::integer as payments_count_today,
  coalesce(defaulters.defaulter_count, 0)::integer as defaulter_count,
  coalesce(class_dues_json.dues_by_class, '{}'::jsonb) as dues_by_class
from summary_dates
left join receipt_facts
  on receipt_facts.session = summary_dates.session
left join class_dues_json
  on class_dues_json.session = summary_dates.session
left join defaulters
  on defaulters.session = summary_dates.session
group by
  summary_dates.session,
  summary_dates.summary_date,
  defaulters.defaulter_count,
  class_dues_json.dues_by_class;

revoke all on public.v_notion_student_fee_summary from public;
revoke all on public.v_notion_family_fee_summary from public;
revoke all on public.v_notion_daily_collection_summary from public;
revoke all on public.notion_sync_log from public;

grant usage on schema public to notion_fee_sync_role;
grant select on public.v_notion_student_fee_summary to notion_fee_sync_role;
grant select on public.v_notion_family_fee_summary to notion_fee_sync_role;
grant select on public.v_notion_daily_collection_summary to notion_fee_sync_role;
grant insert, select on public.notion_sync_log to notion_fee_sync_role;

grant select on public.v_notion_student_fee_summary to service_role;
grant select on public.v_notion_family_fee_summary to service_role;
grant select on public.v_notion_daily_collection_summary to service_role;
grant insert, select on public.notion_sync_log to service_role;

do $$
begin
  if exists (
    select 1
    from cron.job
    where jobname = 'notion-fee-sync-daily-test'
  ) then
    perform cron.unschedule('notion-fee-sync-daily-test');
  end if;
end
$$;

select cron.schedule(
  'notion-fee-sync-daily-test',
  '0 1 * * *',
  $cron$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'VPPS_SUPABASE_PROJECT_URL')
      || '/functions/v1/notion-fee-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'VPPS_SUPABASE_ANON_KEY'),
      'x-vpps-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'VPPS_NOTION_FEE_SYNC_CRON_SECRET')
    ),
    body := jsonb_build_object(
      'session', 'TEST-2026-27',
      'dry_run', false,
      'source', 'pg_cron'
    )
  );
  $cron$
);
