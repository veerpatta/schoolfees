-- A pay link a parent can tap.
--
-- The approved bodies already carry a raw `upi://` link, which works when a
-- phone recognises it and does nothing at all when it does not. WhatsApp will
-- not accept `upi://` as a template BUTTON, and a button is what gets tapped.
--
-- So the v3 templates carry an https URL to `/pay/{{code}}`, and that page
-- builds the UPI intent. The code is opaque and per-send: it names no student,
-- carries no admission number, and cannot be guessed from one that was seen.
--
-- **This is a payment link, not a portal.** The page shows an amount and a
-- reference and nothing else — no name, no class, no balance history. That is
-- stricter than `/r/[code]`, which at least confirms a receipt exists.

alter table public.whatsapp_reminder_sends
  add column if not exists pay_code text,
  add column if not exists pay_code_expires_on date;

comment on column public.whatsapp_reminder_sends.pay_code is
  'The opaque code in this message''s pay link, or null for a message that '
  'carried none. Random and per-send, never derived from the student or the '
  'receipt: a code that could be computed from an admission number would let '
  'anyone enumerate what every family owes.';

comment on column public.whatsapp_reminder_sends.pay_code_expires_on is
  'The notice''s own date. After it the link stops resolving, because the amount '
  'it quotes is the amount that was owed when the message went out and a parent '
  'paying from a three-week-old link would pay the wrong figure.';

-- The lookup the public page does, and the only index it needs. Unique, so a
-- collision is a write error rather than two families sharing a link.
create unique index if not exists whatsapp_reminder_sends_pay_code_idx
  on public.whatsapp_reminder_sends (pay_code)
  where pay_code is not null;

comment on index public.whatsapp_reminder_sends_pay_code_idx is
  'Partial and unique. Partial because almost every row has no pay code; unique '
  'because a collision must fail the send rather than quietly point two families '
  'at one amount.';
