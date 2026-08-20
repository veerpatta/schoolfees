-- Per-family WhatsApp reminder cadence, so the office stops re-unticking the
-- same children every single run.
--
-- The reminders list is rebuilt from the ledger on every load, which is what
-- makes "families who paid drop off" free. What was NOT persisted was the
-- office's own judgement: "this family pays eventually, don't chase them every
-- few days". So the same twenty rows got unticked by hand, daily.
--
-- Deliberately WhatsApp-scoped, and deliberately NOT `no_call`. `no_call` means
-- "don't chase this family at all" and removes them from the Defaulters call
-- queue too; the office wants to keep CALLING some of these families while
-- messaging them less often. Two different decisions, two different columns,
-- on the one table that already owns per-session collection preferences.
--
-- There is no "last reminded" column here on purpose: `whatsapp_reminder_sends`
-- already records `sent_on` for every attempt, so the gap is derived from the
-- send log and cannot drift away from what was actually sent.

alter table public.student_collection_flags
  add column if not exists whatsapp_cadence text not null default 'every_run',
  add column if not exists whatsapp_snoozed_until date;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'student_collection_flags_whatsapp_cadence_check'
  ) then
    alter table public.student_collection_flags
      add constraint student_collection_flags_whatsapp_cadence_check
      check (whatsapp_cadence in ('every_run', 'weekly', 'fortnightly', 'monthly', 'never'));
  end if;
end $$;

comment on column public.student_collection_flags.whatsapp_cadence is
  'How often this family may receive a WhatsApp fee reminder: every_run (default), '
  'weekly, fortnightly, monthly, or never. Enforced against whatsapp_reminder_sends.sent_on, '
  'so the minimum gap is measured from what was actually sent. WhatsApp only — it does '
  'NOT affect the Defaulters call queue, which reads no_call.';

comment on column public.student_collection_flags.whatsapp_snoozed_until is
  'Temporary WhatsApp skip. The family is absent from the reminder list until this date '
  'and then returns on its own, with no un-snoozing to remember. Independent of cadence.';

-- The reminder screen filters on these two, per session, for every load.
create index if not exists student_collection_flags_whatsapp_idx
  on public.student_collection_flags (session_label)
  where whatsapp_cadence <> 'every_run' or whatsapp_snoozed_until is not null;

-- IMPORTANT for anything writing this table from now on: `no_call` defaults to
-- TRUE. A row inserted just to record a WhatsApp cadence must pass
-- `no_call => false` explicitly, or setting "remind monthly" would silently
-- also stop the fee collectors calling that family. The reminder actions
-- update-then-insert for exactly this reason.
