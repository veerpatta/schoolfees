-- vpps-latest-2026-05-15-fullbook: close most recent importing batch
update public.import_batches
set status = 'completed', updated_at = now()
where status = 'importing'
  and filename = 'VPPS latest data import 2026-05-15';
