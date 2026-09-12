-- One lane for a parent message, and it is the one that is written down.
--
-- `whatsapp_templates` held message bodies that staff could edit, which the app
-- rendered into `wa.me` links. Nine surfaces across seven routes did that, and
-- eight of them logged nothing at all — so "was this family told?" had no
-- answer, and "what were they told?" had as many answers as there were staff
-- phones. The one surface that did log recorded 5 sends ever, 0 in the last 30
-- days, the most recent on 2026-08-05. The API lane sent 1,635 in the same
-- window.
--
-- All eight rows in this table are migration seed data (2026-05-25 and
-- 2026-08-20). Nothing the office authored is being dropped, and nothing in the
-- AiSensy lane has ever read it.
--
-- A correction to the record while it is being removed. The header of
-- `20260820190000_hindi_whatsapp_templates.sql` states:
--
--     "A Meta-approved template cannot take a date variable, which is why the
--      campaign body hardcodes it and goes stale"
--
-- That is FALSE for this app, and was when it was written. `SLOT_SKELETON` in
-- `src/modules/whatsapp/domain/campaigns.ts` carries `date` as slot 6, fed by
-- `lastDate`, and every approved `_v3`/`_v4` campaign prints the office's own
-- date at send time. The claim was the strongest remaining argument for keeping
-- this library; it does not hold. Migrations are history and are not rewritten,
-- so the correction is recorded here instead.

begin;

drop table if exists public.whatsapp_templates cascade;

-- A row that looked like a control and controlled nothing.
--
-- Seeded by `20260903172053` as a list of approved campaign names. No code has
-- ever read it: approval lives on the campaign descriptors in
-- `domain/campaigns.ts` and `domain/campaign-bodies-v5.ts`, where a reviewer
-- sees it beside the body it governs. Two answers to one question, and this was
-- the one nobody was consulting.
delete from public.app_settings where key = 'whatsapp_campaign_approvals';

-- The reversal notice gets its own switch rather than sharing the receipt one.
--
-- Turning receipts on is a decision about messaging every paying parent from
-- then on; turning reversals on is a decision about telling a handful of
-- families bad news they currently never hear at all. Someone may well want one
-- without the other.
--
-- Seeded 'false', like the receipt toggle: a feature that starts messaging
-- parents the moment it deploys is not a feature, it is an incident.
insert into public.app_settings (key, value)
values ('whatsapp_reversal_notice_enabled', 'false')
on conflict (key) do nothing;

-- `whatsapp_one_message_per_family` has never had a row at all: the code reads
-- a missing row as ON, which is what the owner chose on 2026-09-05. The new
-- settings screen writes all six keys together, and a screen that cannot show a
-- value until someone saves it is a screen that lies on first open.
insert into public.app_settings (key, value)
values ('whatsapp_one_message_per_family', 'true')
on conflict (key) do nothing;

commit;
