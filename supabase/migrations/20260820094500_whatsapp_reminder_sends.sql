-- Automated WhatsApp fee reminders: one row per attempt, per student, per day.
--
-- This table exists for exactly one reason: a fee reminder must never go out
-- twice on the same day. The cron that sends them claims a row here BEFORE
-- calling AiSensy, so a double-fired cron, a manual re-trigger, or a retry
-- after a timeout all collide on the unique index and skip instead of
-- re-messaging 200 parents.
--
-- Note this changes a standing property of the system. The comment on
-- `whatsapp_templates` says "the app never sends — it only renders text and
-- opens wa.me links". That remains true of the *templates* library, which is
-- still staff-driven wa.me drafting. This table records the separate,
-- automated lane that does send, through AiSensy's Campaign API, using a
-- Meta-approved template that lives in AiSensy rather than in this database.

create table if not exists whatsapp_reminder_sends (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  session_label text not null,
  -- IST, not UTC: "today" for a school in Rajasthan ends at midnight IST, and
  -- a 9 AM IST send is 03:30 UTC — the same UTC date, but only by luck. Pin it.
  sent_on date not null default ((now() at time zone 'Asia/Kolkata')::date),
  campaign_name text not null,
  destination text not null,
  due_amount integer not null,
  template_params jsonb not null default '[]'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed')),
  provider_message_id text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table whatsapp_reminder_sends is
  'One row per automated WhatsApp fee reminder attempt. Claimed before the '
  'provider call, so the unique (student, session, day) index is what actually '
  'prevents double-messaging a parent.';

comment on column whatsapp_reminder_sends.status is
  'pending = row claimed, provider not yet answered. A row left pending means '
  'the function died mid-send: the parent may or may not have received it, and '
  'the day is already claimed, so it will not be retried automatically.';

comment on column whatsapp_reminder_sends.due_amount is
  'The figure actually quoted in the message, in whole rupees. Stored so a '
  'parent disputing "you said 14,750" can be answered from the record.';

-- The lock that makes the whole thing idempotent.
create unique index if not exists whatsapp_reminder_sends_student_day_idx
  on whatsapp_reminder_sends (student_id, session_label, sent_on);

-- Reporting: "what went out on the 21st", "what failed".
create index if not exists whatsapp_reminder_sends_day_status_idx
  on whatsapp_reminder_sends (sent_on desc, status);

alter table whatsapp_reminder_sends enable row level security;

-- Staff can read the send history from the app. Writes happen only through the
-- service role in the cron route, which bypasses RLS — there is deliberately no
-- insert/update policy, so nothing in the browser can fabricate a send record.
create policy "whatsapp_reminder_sends: staff read"
  on whatsapp_reminder_sends for select
  using (auth.role() = 'authenticated');
