-- Per-student named fee heads: human labels for custom_other_fee_heads.
--
-- `student_fee_overrides.custom_other_fee_heads` already stores a
-- `slug -> integer` map, and v_workbook_student_financials already sums it via
-- `sum(jsonb_each_text.value::integer)`. That integer contract is load-bearing:
-- storing `{label, amount}` objects there would make the next matview refresh
-- raise `invalid input syntax for type integer` and take down all three
-- workbook materialized views at once.
--
-- So the labels live in a parallel map keyed by the same slug. Additive,
-- nullable, no backfill needed (zero rows currently carry a non-empty
-- custom_other_fee_heads), and no view depends on it.

alter table public.student_fee_overrides
  add column if not exists custom_other_fee_head_labels jsonb;

alter table public.student_fee_overrides
  drop constraint if exists student_fee_overrides_custom_other_fee_head_labels_object;

alter table public.student_fee_overrides
  add constraint student_fee_overrides_custom_other_fee_head_labels_object
  check (
    custom_other_fee_head_labels is null
    or jsonb_typeof(custom_other_fee_head_labels) = 'object'
  );

comment on column public.student_fee_overrides.custom_other_fee_head_labels is
  'Display labels for custom_other_fee_heads, keyed by the same slug. Values are text. Amounts stay in custom_other_fee_heads as plain integers because the workbook matview casts them with ::integer.';
