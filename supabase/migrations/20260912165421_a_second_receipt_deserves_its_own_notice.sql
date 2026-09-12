-- A second receipt for the same student on the same day is a second receipt.
--
-- `data/receipt-notice.ts` inserts its claim row WITHOUT `sent_on`, so the
-- column defaults to the IST date. The day index is
--
--   unique (student_id, session_label, sent_on, campaign_name, destination_role)
--
-- and it is NOT partial, so a family paying twice in one day collides on it and
-- the code reports the 23505 as *"A notice for this receipt has already been
-- sent."* — which is untrue, and suppresses a notice for a receipt that has
-- never been announced. `20260903172053_whatsapp_receipt_notices.sql:24-27`
-- says the opposite is intended:
--
--   "a second posting for the same family on the same day is a second receipt
--    and deserves its own message"
--
-- Invisible in production only because `whatsapp_receipt_notice_enabled` is
-- still 'false'.
--
-- Two changes, and they must ship together, because the second one is what
-- makes a THIRD notice kind possible at all:
--
--   1. The day index becomes partial on reminder rows (`receipt_id is null`).
--      Reminders and `covered_by_sibling` rows are guarded exactly as before;
--      receipt-shaped notices are guarded by the receipt index alone.
--
--   2. The receipt index is re-keyed from (receipt_id) to
--      (receipt_id, notice_kind). Without this, a payment-REVERSED notice would
--      collide with the receipt notice for the same receipt and be reported as
--      a duplicate — one receipt can legitimately produce one "payment
--      received" and, later, one "payment reversed".
--
-- A pleasant consequence of (1): a fee-statement notice carries
-- `receipt_id is null`, so it inherits the day index for free. One statement per
-- family per day, no new column and no new index — which is exactly the rule a
-- staff-tapped button wants, against double-taps and two staff in two tabs.

begin;

-- `not null default` is load-bearing. A nullable notice_kind would let
-- Postgres's default NULLS DISTINCT treat two rows with the same receipt_id and
-- a null kind as different, silently deleting the "one notice per receipt, ever"
-- guarantee this index exists to provide.
alter table public.whatsapp_reminder_sends
  add column if not exists notice_kind text not null default 'reminder';

alter table public.whatsapp_reminder_sends
  drop constraint if exists whatsapp_reminder_sends_notice_kind_check;

alter table public.whatsapp_reminder_sends
  add constraint whatsapp_reminder_sends_notice_kind_check
  check (notice_kind in ('reminder', 'receipt', 'reversal', 'fee_statement'));

-- Backfill BEFORE the new index is built: every existing row carrying a
-- receipt_id is, by construction, a receipt notice.
update public.whatsapp_reminder_sends
   set notice_kind = 'receipt'
 where receipt_id is not null
   and notice_kind = 'reminder';

-- Create then drop, never the reverse: dropping first would leave a window in
-- which nothing stops a duplicate.
create unique index if not exists whatsapp_reminder_sends_receipt_kind_idx
  on public.whatsapp_reminder_sends (receipt_id, notice_kind)
  where receipt_id is not null;

drop index if exists public.whatsapp_reminder_sends_receipt_idx;

create unique index if not exists whatsapp_reminder_sends_reminder_day_idx
  on public.whatsapp_reminder_sends
  (student_id, session_label, sent_on, campaign_name, destination_role)
  where receipt_id is null;

drop index if exists public.whatsapp_reminder_sends_student_day_campaign_role_idx;

comment on column public.whatsapp_reminder_sends.notice_kind is
  'What this row announced: reminder (the campaign runner), receipt, reversal, or fee_statement. Part of the receipt uniqueness key, so one receipt may produce one receipt notice and later one reversal notice without either being reported as a duplicate.';

commit;
