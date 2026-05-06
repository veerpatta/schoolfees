set search_path = public;

create index if not exists idx_receipts_student_payment_date_created_at
on public.receipts (student_id, payment_date desc, created_at desc);
