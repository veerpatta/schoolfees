-- Staff-triggered WhatsApp fee reminders: one row per attempt, per student, per day.
--
-- The screen at /protected/admin-tools/whatsapp-reminders lets an admin pick
-- families off a live list and send them an approved AiSensy template. This
-- table is what stops the same family being messaged twice from two taps, two
-- tabs, or two members of office staff working the same list.
--
-- The row is claimed BEFORE the provider call, so the unique
-- (student, session, day) index decides the race rather than a check-then-send
-- that both callers pass. It also gives the screen its "already sent today"
-- column, which is the difference between staff trusting the list and staff
-- re-sending because they cannot remember.
--
-- Note this narrows a claim made on `whatsapp_templates`, whose comment says
-- "the app never sends". That is still true of the template library, which
-- drafts wa.me links for a human to send by hand. This table records a second,
-- separate lane: a Meta-approved template that lives in AiSensy, sent over
-- their API, that costs money per message.

create table if not exists whatsapp_reminder_sends (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  session_label text not null,
  -- IST, not UTC. The school's day ends at midnight in Rajasthan, and staff
  -- reading "sent today" mean their today.
  sent_on date not null default ((now() at time zone 'Asia/Kolkata')::date),
  campaign_name text not null,
  destination text not null,
  due_amount integer not null,
  template_params jsonb not null default '[]'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed')),
  provider_message_id text,
  error_message text,
  sent_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table whatsapp_reminder_sends is
  'One row per WhatsApp fee reminder attempt, claimed before the provider call. '
  'The unique (student, session, day) index is what actually prevents a parent '
  'being messaged twice.';

comment on column whatsapp_reminder_sends.status is
  'pending = claimed, provider has not answered. A row still pending means the '
  'request died in flight: the message may or may not have gone, and the day is '
  'already claimed, so the screen shows it rather than silently retrying.';

comment on column whatsapp_reminder_sends.due_amount is
  'The figure actually quoted in the message, whole rupees. Stored so a parent '
  'disputing "you said 14,750" can be answered from the record.';

comment on column whatsapp_reminder_sends.sent_by is
  'The staff member who pressed Send. Null only for a send made outside the '
  'screen. Not a foreign key to auth.users on purpose — a staff account being '
  'removed must not delete the evidence that a parent was messaged.';

create unique index if not exists whatsapp_reminder_sends_student_day_idx
  on whatsapp_reminder_sends (student_id, session_label, sent_on);

create index if not exists whatsapp_reminder_sends_day_status_idx
  on whatsapp_reminder_sends (sent_on desc, status);

alter table whatsapp_reminder_sends enable row level security;

-- Staff read the send history from the screen. Writes go through the service
-- role in a server action, which bypasses RLS — there is deliberately no
-- insert or update policy, so nothing running in a browser can fabricate a
-- record of having messaged a parent.
--
-- `(select auth.role())` rather than `auth.role()`: the bare call is
-- re-evaluated per row, which is the auth_rls_initplan pattern migration
-- 20260527090443 swept out of every other table here.
create policy "whatsapp_reminder_sends: staff read"
  on whatsapp_reminder_sends for select
  using ((select auth.role()) = 'authenticated');
