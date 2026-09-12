-- A write-off says why it happened.
--
-- Until now every write-off looked identical in the data: a receipt with
-- `payment_mode = 'discount'` and a sentence of free text in `notes`. Nothing
-- could tell "this child left the school, the rest was never collectable" from
-- "the school granted a concession" from "two rupees of rounding" without a
-- person reading the remark, so the three were reported as one figure.
--
-- Two nullable columns, and deliberately NOT a change to
-- `post_student_payment_with_adjustments`.
--
-- Adding parameters to that function would mean dropping and recreating the
-- live Payment Desk's posting path: Postgres treats a new parameter list as a
-- NEW function rather than a replacement, so `create or replace` would leave
-- two overloads and a defaulted argument would make every existing call
-- ambiguous ("function is not unique"). The posting RPC keeps working
-- untouched; the server action stamps the reason immediately afterwards.
--
-- That second write is allowed because `private.protect_receipt_money_columns()`
-- is a BLOCKLIST, not an allowlist: it raises on id, receipt_number, student_id,
-- payment_date, payment_mode, total_amount, created_by, created_at,
-- client_request_id and family_payment_id. These two carry no money, so they sit
-- beside `reference_number`, `notes` and `received_by` as fields a correction may
-- touch in place. Nothing here weakens the append-only rule.

begin;

alter table public.receipts
  add column if not exists write_off_reason text;

alter table public.receipts
  add column if not exists write_off_note text;

-- The reason is only meaningful on a write-off, and only these two values mean
-- anything to the office. `other` is the honest fallback and matches what every
-- existing row already is: unclassified.
alter table public.receipts
  drop constraint if exists receipts_write_off_reason_check;

alter table public.receipts
  add constraint receipts_write_off_reason_check
  check (
    write_off_reason is null
    or (
      payment_mode = 'discount'::public.payment_mode
      and write_off_reason in ('left_school', 'other')
    )
  );

-- A note without a reason is a remark, and `notes` already holds those.
alter table public.receipts
  drop constraint if exists receipts_write_off_note_needs_reason;

alter table public.receipts
  add constraint receipts_write_off_note_needs_reason
  check (write_off_note is null or write_off_reason is not null);

-- Finding every uncategorised write-off is the report this exists for, and it
-- is a small, highly selective set against a table that only grows.
create index if not exists idx_receipts_write_off_reason
  on public.receipts (write_off_reason)
  where write_off_reason is not null;

comment on column public.receipts.write_off_reason is
  'Why a payment_mode=discount receipt was posted: left_school (the child left, the balance was never collectable) or other. Null on every real payment, and null on write-offs posted before 2026-09-12. A write-off is not a discount and is never counted as collection - see src/platform/money/write-off.ts.';

comment on column public.receipts.write_off_note is
  'Free text alongside write_off_reason. Requires a reason; a note on its own belongs in notes.';

commit;
