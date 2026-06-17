-- Fix: remove the legacy unnamed student_fee_overrides payload check.
--
-- The original table definition used an unnamed CHECK, so Postgres named it
-- student_fee_overrides_check. Later migrations added the correct named
-- student_fee_overrides_override_payload_check, but the old check remained in
-- already-created databases. That old rule does not include
-- late_fee_waiver_amount, so waiver-only inserts from waive_late_fee fail even
-- though the current payload rule allows them.

alter table public.student_fee_overrides
  drop constraint if exists student_fee_overrides_check,
  drop constraint if exists student_fee_overrides_override_payload_check,
  add constraint student_fee_overrides_override_payload_check
  check (
    custom_annual_base_amount is not null
    or custom_transport_installment_amount is not null
    or custom_late_fee_flat_amount is not null
    or discount_amount > 0
    or custom_tuition_fee_amount is not null
    or custom_transport_fee_amount is not null
    or custom_books_fee_amount is not null
    or custom_admission_activity_misc_fee_amount is not null
    or (
      custom_other_fee_heads is not null
      and custom_other_fee_heads <> '{}'::jsonb
    )
    or student_type_override is not null
    or transport_applies_override is not null
    or coalesce(other_adjustment_amount, 0) <> 0
    or nullif(trim(coalesce(other_adjustment_head, '')), '') is not null
    or late_fee_waiver_amount > 0
  );

notify pgrst, 'reload schema';
