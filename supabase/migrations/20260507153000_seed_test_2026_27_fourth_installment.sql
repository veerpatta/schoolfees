-- TEST-2026-27 data repair: add the canonical fourth installment date only if
-- that test Fee Setup row exists and the date is missing.
update public.fee_policy_configs
set
  installment_schedule = installment_schedule || jsonb_build_array(
    jsonb_build_object('label', 'Installment 4', 'dueDateLabel', '20-01-2027')
  ),
  updated_at = timezone('utc', now())
where academic_session_label = 'TEST-2026-27'
  and not exists (
    select 1
    from jsonb_array_elements(installment_schedule) as item
    where item->>'dueDateLabel' = '20-01-2027'
  );
