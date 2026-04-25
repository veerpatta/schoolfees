-- Ensure public workbook views and date-aware payment preview can call the
-- private workbook helpers under authenticated Supabase sessions.
grant usage on schema private to authenticated;

grant execute on function private.normalize_workbook_class_label(text, text) to authenticated;
grant execute on function private.workbook_installment_snapshot(uuid, date, boolean) to authenticated;

grant execute on function public.preview_workbook_payment_allocation(uuid, date) to authenticated;
