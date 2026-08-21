-- One message per campaign per day, instead of one message per day.
--
-- 20260820140000 made the send log unique on (student, session, day), which was
-- right when there was one campaign. There are now six: three fee situations in
-- two languages. Measured on the live 2026-27 session on 21 Aug 2026:
--
--   due only 99 · balance only 239 · previous-session only 1
--   due AND previous-session 34 · balance AND previous-session 13
--
-- So 47 families legitimately need a current-year notice AND the previous-session
-- one — two different true things that the templates deliberately say separately,
-- because saying both in one message is what the old single campaign got wrong.
-- Under the old index the second notice came back as "already messaged today",
-- which left the previous-session template with an audience of exactly ONE family
-- who was not already getting something else. It was unsendable in practice.
--
-- What this does NOT relax: sending the SAME campaign to the same family twice in
-- a day is still refused. The row is still claimed before the provider call, so
-- the unique violation still decides the race between two staff working the same
-- list, which is the property that actually prevents a double send.
--
-- Cadence is unaffected and stays campaign-agnostic: `whatsapp_cadence` asks how
-- often a family hears from us AT ALL. Keyed per campaign, a family set to
-- "weekly" could receive three messages a week, one per notice.

drop index if exists public.whatsapp_reminder_sends_student_day_idx;

create unique index if not exists whatsapp_reminder_sends_student_day_campaign_idx
  on public.whatsapp_reminder_sends (student_id, session_label, sent_on, campaign_name);

comment on index public.whatsapp_reminder_sends_student_day_campaign_idx is
  'One send per campaign per family per day. Claimed before the AiSensy call, so '
  'this is what decides a race between two staff on the same list. Widened from '
  '(student, session, day) in 20260821170000 because six campaigns now exist and '
  '47 families need both a current-year notice and the previous-session one.';
