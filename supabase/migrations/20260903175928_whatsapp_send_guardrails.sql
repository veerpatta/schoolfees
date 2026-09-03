-- The four things that should stop a send, and the tables behind them.
--
-- Every one of these is a judgement rather than an impossibility: the message
-- would go out fine, and the question is whether it should. So all four are
-- OVERRIDABLE by an admin who gives a reason, and the reason is written to the
-- run — a guard that cannot be overridden gets worked around, and a guard that
-- can be overridden silently teaches nothing.

-- ------------------------------------------------------------- 1. holidays

create table if not exists public.school_holidays (
  holiday_date date primary key,
  label text not null,
  -- A holiday when the school is shut but the fee counter is staffed is not a
  -- reason to hold a reminder: the parent can still pay. Only a closed counter
  -- makes "pay by Friday" impossible to act on.
  counter_open boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now()
);

comment on table public.school_holidays is
  'Days the school is closed, managed under Master Data. Used by the WhatsApp '
  'guards to avoid asking a parent to pay by a date they cannot pay on, and for '
  'nothing else — this is not an academic calendar.';

comment on column public.school_holidays.counter_open is
  'False by default. A holiday with the fee counter STAFFED does not block a '
  'reminder, because the parent can still act on it. Sundays are handled in code '
  'rather than as rows here: they recur, and a table of every Sunday for a '
  'decade is a table nobody maintains.';

alter table public.school_holidays enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'school_holidays'
      and policyname = 'school_holidays: staff read'
  ) then
    create policy "school_holidays: staff read"
      on public.school_holidays for select
      using ((select auth.role()) = 'authenticated');
  end if;
end $$;

-- --------------------------------------------------------- 2. test sends

-- Deliberately NOT `whatsapp_reminder_sends`.
--
-- That table's rows claim a student's day: the unique index on
-- (student, session, day, campaign, role) is what stops a family being messaged
-- twice, and a test send logged there would silently drop a real family out of
-- the real run. The existing rule is that a test never writes to it, and this
-- table exists so a test can be RECORDED without breaking that rule.
create table if not exists public.whatsapp_test_sends (
  id uuid primary key default gen_random_uuid(),
  campaign_name text not null,
  destination text not null,
  succeeded boolean not null,
  provider_message_id text,
  error_message text,
  sent_by uuid,
  created_at timestamptz not null default now()
);

comment on table public.whatsapp_test_sends is
  'One row per test message to a staff number. NOT whatsapp_reminder_sends: a '
  'row there claims a student''s day and would drop a real family out of the '
  'real run. Read by the send guards, which want a SUCCESSFUL test within the '
  'last 24 hours before a new or edited campaign goes out to families.';

create index if not exists whatsapp_test_sends_campaign_idx
  on public.whatsapp_test_sends (campaign_name, created_at desc);

alter table public.whatsapp_test_sends enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'whatsapp_test_sends'
      and policyname = 'whatsapp_test_sends: staff read'
  ) then
    create policy "whatsapp_test_sends: staff read"
      on public.whatsapp_test_sends for select
      using ((select auth.role()) = 'authenticated');
  end if;
end $$;

-- ------------------------------------------------------- 3. the overrides

alter table public.whatsapp_campaign_runs
  add column if not exists override_reason text,
  add column if not exists overridden_guards text[];

comment on column public.whatsapp_campaign_runs.override_reason is
  'Why an admin sent despite a guard. Required whenever overridden_guards is '
  'non-empty — the point of an overridable guard is that the override is on the '
  'record, not that it is easy.';

comment on column public.whatsapp_campaign_runs.overridden_guards is
  'Which guards were overridden, by their stable codes (quiet_hours, '
  'counter_closed, budget_exceeded, untested_campaign). Codes rather than '
  'messages, so the wording can change without breaking the history.';

-- ---------------------------------------------------------- 4. the budget

insert into public.app_settings (key, value)
values
  -- A run larger than this needs the admin to name the overage. Set from the
  -- live audience sizes: fee due 146, balance 171, previous session 51, so 250
  -- is comfortably above a normal run and well below an accident.
  ('whatsapp_run_message_cap', '250'),
  -- ~₹0.145 a message, so 4000 is about ₹580 a month.
  ('whatsapp_month_message_cap', '4000'),
  -- 08:00-20:00 IST. Stored so the office can change it without a deploy.
  ('whatsapp_quiet_hours_start', '8'),
  ('whatsapp_quiet_hours_end', '20')
on conflict (key) do nothing;
