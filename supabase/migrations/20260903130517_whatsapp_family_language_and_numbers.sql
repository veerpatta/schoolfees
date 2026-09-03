-- One family, one message, in its own language — and on the number that answers.
--
-- Three changes to how a reminder is addressed, none of which touches money:
--
-- 1. A phone that carries more than one child gets ONE message. Every child
--    still gets a send-log row, because the per-student unique index and the run
--    outcomes both key off it, but the siblings who were not messaged separately
--    are recorded as `covered_by_sibling` so the screen can say why.
--
-- 2. Language becomes a property of the FAMILY, not of the run. The run's
--    language stays as the default; a family with `whatsapp_language` set
--    overrides it. The send row records what actually went out, because the run
--    default is not evidence of what a parent read.
--
-- 3. A family may be messaged on a second number once the first has stopped
--    working. That needs the unique index to permit exactly two rows per notice
--    per day rather than one, and no more.
--
-- Idempotent throughout, in the style of the other WhatsApp migrations here.

-- ---------------------------------------------------------------- 1. language

alter table public.student_collection_flags
  add column if not exists whatsapp_language text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.student_collection_flags'::regclass
      and conname = 'student_collection_flags_whatsapp_language_check'
  ) then
    alter table public.student_collection_flags
      add constraint student_collection_flags_whatsapp_language_check
      check (whatsapp_language is null or whatsapp_language in ('hi', 'en'));
  end if;
end $$;

comment on column public.student_collection_flags.whatsapp_language is
  'The language THIS family reads, or null to follow the run default. Null is '
  'the normal state and is not the same as ''hi'': a family who has never been '
  'asked follows whatever the office picked, and a family who has been asked '
  'keeps their answer even when the office switches the run to English. '
  'Deliberately on the same row as no_call and whatsapp_cadence — one place '
  'holding the office''s judgement about a family, rather than three.';

alter table public.whatsapp_reminder_sends
  add column if not exists language text;

comment on column public.whatsapp_reminder_sends.language is
  'The language this message actually went out in, which is the run default only '
  'when the family had no preference of their own. Stored per row because '
  'whatsapp_campaign_runs.language is the DEFAULT, not the rule — answering '
  '"which language did this parent get" from the run record would be a guess.';

-- ------------------------------------------------------- 2. sibling coverage

-- `covered_by_sibling` is not a failure and not a send. It is the record that a
-- child's family WAS reached, on a message naming a sibling, so the office can
-- tell it apart from a family nobody contacted. It costs nothing and reaches
-- nobody on its own — no provider call is made for one of these rows.
do $$
begin
  alter table public.whatsapp_reminder_sends
    drop constraint if exists whatsapp_reminder_sends_status_check;

  alter table public.whatsapp_reminder_sends
    add constraint whatsapp_reminder_sends_status_check
    check (status in ('pending', 'sent', 'failed', 'covered_by_sibling'));
end $$;

comment on column public.whatsapp_reminder_sends.status is
  'pending = claimed, provider has not answered. A row still pending means the '
  'request died in flight: the message may or may not have gone, and the day is '
  'already claimed, so the screen shows it rather than silently retrying. '
  'covered_by_sibling = this child''s family was reached on a message naming '
  'another child; no provider call was made for this row and it costs nothing. '
  'It carries the sibling''s provider_message_id, which is what ties the family '
  'back together.';

-- ------------------------------------------------------- 3. second number

alter table public.whatsapp_reminder_sends
  add column if not exists destination_role text not null default 'primary';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.whatsapp_reminder_sends'::regclass
      and conname = 'whatsapp_reminder_sends_destination_role_check'
  ) then
    alter table public.whatsapp_reminder_sends
      add constraint whatsapp_reminder_sends_destination_role_check
      check (destination_role in ('primary', 'secondary'));
  end if;
end $$;

comment on column public.whatsapp_reminder_sends.destination_role is
  'primary = the number this family is normally reached on. secondary = the '
  'other parent, messaged as well only after two sent notices produced no '
  'payment. Two values rather than putting `destination` in the unique index, '
  'which was the alternative and is worse: the index is what guarantees a family '
  'is not messaged twice for one notice, and keying it on a phone STRING would '
  'let a re-formatted number silently buy a third message. A role has exactly '
  'two settings, so the ceiling is two.';

-- The index widens by one column and by exactly one permitted row per family
-- per notice per day. Everything the 20260821170000 comment says still holds:
-- the row is claimed before the provider call, so this is what decides the race
-- between two staff working the same list.
drop index if exists public.whatsapp_reminder_sends_student_day_campaign_idx;

create unique index if not exists whatsapp_reminder_sends_student_day_campaign_role_idx
  on public.whatsapp_reminder_sends
  (student_id, session_label, sent_on, campaign_name, destination_role);

comment on index public.whatsapp_reminder_sends_student_day_campaign_role_idx is
  'At most one primary and one secondary send per campaign per family per day. '
  'Widened from (student, session, day, campaign) in 20260903130517 so a family '
  'who has stopped answering on one number can be reached on the other — and no '
  'further, which is the point of the role being an enum rather than the phone '
  'number itself.';

-- Grouping a family''s rows back together after the fact, for the run page and
-- the "covered by sibling" disclosure.
create index if not exists whatsapp_reminder_sends_provider_message_idx
  on public.whatsapp_reminder_sends (provider_message_id)
  where provider_message_id is not null;
