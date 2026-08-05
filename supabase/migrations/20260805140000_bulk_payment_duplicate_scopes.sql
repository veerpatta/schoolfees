-- Bulk payment upload: separate the two kinds of "duplicate" it can detect.
--
-- The staged row had a single duplicate_acknowledged flag, and the commit path
-- forwarded it as postStudentPayment's acknowledgeDailyDuplicate. That conflated
-- two unrelated things and left a third guard unreachable:
--
--   * intra-file    -- the same student appears twice in ONE spreadsheet.
--                      Acknowledging this should waive the near-duplicate guard
--                      (rows post seconds apart, so the second one tripped the
--                      90s instant-repeat hard block and could never post).
--   * existing      -- a receipt for the same student/date/amount is ALREADY in
--     receipt         the database. This was never checked at validation time,
--                      and acknowledging an intra-file duplicate silently
--                      waived the same-day guard that would have caught it.
--
-- Recording which kind (or both) applies to each row lets the commit path pass
-- acknowledgeNearDuplicate and acknowledgeDailyDuplicate independently, and only
-- for the specific warning the operator actually saw and ticked.

alter table public.payment_import_rows
  add column if not exists intra_file_duplicate boolean not null default false,
  add column if not exists existing_receipt_duplicate boolean not null default false;

comment on column public.payment_import_rows.intra_file_duplicate is
  'The same student appears more than once within this upload. Acknowledging waives the near-duplicate guard so a genuine repeat payment can post.';

comment on column public.payment_import_rows.existing_receipt_duplicate is
  'A receipt for the same student, date and amount already exists. Acknowledging waives the same-day duplicate guard.';
