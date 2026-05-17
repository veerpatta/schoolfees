-- vpps-latest-2026-05-15-fullbook: open import batch
insert into public.import_batches (
  import_mode, target_session_label, filename, source_format, worksheet_name, status, detected_headers
) values (
  'update', '2026-27', 'VPPS latest data import 2026-05-15', 'xlsx',
  'Supabase_Students_Active', 'importing',
  '["source_student_uid","sr_no","class_name","student_name"]'::jsonb
) returning id;
