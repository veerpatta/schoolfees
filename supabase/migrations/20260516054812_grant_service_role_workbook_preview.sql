-- Local/live verification scripts use the server-only service role key.
-- Keep the same workbook preview access that authenticated app users already have.
grant usage on schema private to service_role;
grant execute on function private.normalize_workbook_class_label(text, text) to service_role;
grant execute on function private.workbook_installment_snapshot(uuid, date, boolean) to service_role;
grant execute on function public.preview_workbook_payment_allocation(uuid, date) to service_role;
