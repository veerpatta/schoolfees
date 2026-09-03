-- When a saved campaign should run, and which slot a run satisfied.
--
-- A campaign already saves the RULE — which notice, to whom, by when. What it
-- could not say is WHEN it should go out, so "send the T-10 reminder for
-- installment 3" lived in somebody's head and was remembered or it was not.
--
-- The schedule is relative to an installment, not an absolute date, because the
-- fee calendar already knows the dates and a campaign written in April should
-- still fire correctly in January. `{ "installment": 3, "offsetDays": -10 }`
-- reads as "ten days before installment 3 falls due". An absolute `runOn` is
-- allowed for a one-off.
--
-- Nothing here sends anything on its own. `auto` defaults FALSE, and the
-- separate cron route only ever considers campaigns whose owner has turned it
-- on. A due campaign with `auto` off is a row on a card saying "this is due
-- today", and the office still presses Send.

alter table public.whatsapp_campaigns
  add column if not exists schedule jsonb;

comment on column public.whatsapp_campaigns.schedule is
  'When this campaign should run, or null for one that only ever runs by hand. '
  'Two shapes, both optionally carrying "auto": '
  '{"installment": 3, "offsetDays": -10} = ten days before installment 3 is due, '
  'read against the live fee calendar so a campaign written in April still fires '
  'correctly in January; {"runOn": "2026-10-15"} = an absolute one-off. '
  'offsetDays is negative before the due date and positive after: -10, -3, +1 '
  'and +15 are the slots the office actually uses. '
  '"auto": true lets the cron send it without a press — off unless an admin '
  'turns it on, and the screen says out loud that the campaign will send itself.';

-- Which slot a run satisfied, so a campaign due today can tell whether it has
-- already gone. Not derivable from `started_at`: a run started at 23:55 for
-- yesterday's slot, or a slot deliberately run a day late, would both be
-- misread by a date comparison.
alter table public.whatsapp_campaign_runs
  add column if not exists scheduled_for date;

comment on column public.whatsapp_campaign_runs.scheduled_for is
  'The scheduled slot this run satisfied, or null for an ad-hoc send. Compared '
  'against the slot a campaign is due for TODAY, which is what stops a scheduled '
  'campaign being offered twice — and what lets a slot run a day late still '
  'count as that slot rather than as a new one.';

alter table public.whatsapp_campaign_runs
  add column if not exists source text not null default 'manual';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.whatsapp_campaign_runs'::regclass
      and conname = 'whatsapp_campaign_runs_source_check'
  ) then
    alter table public.whatsapp_campaign_runs
      add constraint whatsapp_campaign_runs_source_check
      check (source in ('manual', 'cron'));
  end if;
end $$;

comment on column public.whatsapp_campaign_runs.source is
  'manual = somebody pressed Send, and started_by names them. cron = the '
  'scheduled runner sent it, and started_by is NULL — which is the honest record '
  'rather than attributing an automatic send to whoever last edited the '
  'campaign. Every guard the manual path applies is applied to a cron run too.';

-- "Which campaigns have already run for today's slot" is read on every load of
-- the reminders screen and by the cron.
create index if not exists whatsapp_campaign_runs_scheduled_idx
  on public.whatsapp_campaign_runs (campaign_id, scheduled_for)
  where scheduled_for is not null;

-- Campaigns carrying a schedule, for the due-today card. Partial, because most
-- campaigns never get one.
create index if not exists whatsapp_campaigns_scheduled_idx
  on public.whatsapp_campaigns (session_label)
  where schedule is not null and archived_at is null;
