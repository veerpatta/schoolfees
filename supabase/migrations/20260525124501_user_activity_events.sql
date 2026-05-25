-- Activity feed: lightweight append-only log of high-level user actions.
--
-- Captured kinds (initial set, free-form text so new actions can be added
-- without a migration):
--   payment_posted, receipt_printed, student_edited, student_view,
--   export_downloaded, defaulter_contacted, import_committed
--
-- Surfaced as:
--   - Dashboard bottom strip ("Today: 12 receipts, 1 edit, 1 export")
--   - /protected/admin-tools/activity full feed
--   - Student list rows ("Last viewed by you 2 hrs ago" — item 54)

create table if not exists user_activity_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  ref_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table user_activity_events is
  'Append-only activity log: payments posted, receipts printed, student edits, '
  'student views, exports downloaded, defaulter contacts, imports committed. '
  'Drives the dashboard activity strip, admin-tools feed, and last-viewed hints.';

create index if not exists user_activity_events_user_recent_idx
  on user_activity_events (user_id, created_at desc);

create index if not exists user_activity_events_kind_recent_idx
  on user_activity_events (kind, created_at desc);

create index if not exists user_activity_events_ref_recent_idx
  on user_activity_events (ref_id, created_at desc)
  where ref_id is not null;

alter table user_activity_events enable row level security;

create policy "user_activity_events: staff read"
  on user_activity_events for select
  using (auth.role() = 'authenticated');

create policy "user_activity_events: staff insert"
  on user_activity_events for insert
  with check (auth.role() = 'authenticated');
