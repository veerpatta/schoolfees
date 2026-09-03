-- Tell a parent their payment landed.
--
-- The office's most common WhatsApp message is not a reminder, it is a parent
-- asking whether the money arrived. A receipt notice answers that before it is
-- asked, and it is the only message in this system a family is pleased to get.
--
-- Sent strictly AFTER `post_student_payment_with_adjustments` has returned
-- success, outside any transaction, inside a try/catch that swallows
-- everything. A messaging failure must never fail a posting: the money is in
-- the drawer and the receipt is printed either way.

alter table public.whatsapp_reminder_sends
  add column if not exists receipt_id uuid
    references public.receipts(id) on delete set null;

comment on column public.whatsapp_reminder_sends.receipt_id is
  'The receipt this notice confirms, for a receipt notice only. Null for every '
  'reminder. `on delete set null` rather than cascade, matching campaign_id: a '
  'send row is evidence a parent was messaged, and it must outlive whatever it '
  'referred to.';

-- ONE notice per receipt, ever.
--
-- Deliberately NOT part of the day/campaign index, which is scoped to a session
-- and a day. A receipt notice is keyed to a receipt and nothing else: a second
-- posting for the same family on the same day is a second receipt and deserves
-- its own message, while a retry of the SAME receipt must never send twice.
create unique index if not exists whatsapp_reminder_sends_receipt_idx
  on public.whatsapp_reminder_sends (receipt_id)
  where receipt_id is not null;

comment on index public.whatsapp_reminder_sends_receipt_idx is
  'One receipt notice per receipt. Partial, so the millions of reminder rows '
  'carrying a null receipt_id are not in it. Claimed before the provider call '
  'like every other send, so this is what decides a race between two postings.';

-- ---------------------------------------------------------------- the switch

-- `app_settings` is the existing key/value store the active session already
-- lives in. A dedicated column on a settings table would need a settings table;
-- this needs two rows.
insert into public.app_settings (key, value)
values
  -- OFF until the template is approved AND somebody decides the school wants
  -- this. A feature that starts messaging parents the moment it deploys is not
  -- a feature, it is an incident.
  ('whatsapp_receipt_notice_enabled', 'false'),
  -- Which `_v3` campaigns an admin has confirmed are Live in AiSensy, as a JSON
  -- array of campaign names. The registry's `approved: false` is the floor: this
  -- can only turn a campaign ON, and never one the code has not written a body
  -- for, because a name with no descriptor has nothing to enable.
  ('whatsapp_campaign_approvals', '[]')
-- Explicit target: `key` is the primary key, and a bare `do nothing` would
-- silently swallow a conflict on some other constraint added later.
on conflict (key) do nothing;
