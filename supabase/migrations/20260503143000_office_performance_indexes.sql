set search_path = public;

create index if not exists idx_classes_session_status_sort
on public.classes (session_label, status, sort_order, class_name);

create index if not exists idx_students_active_class_name
on public.students (class_id, lower(full_name))
where status = 'active';

create index if not exists idx_students_active_route_name
on public.students (transport_route_id, lower(full_name))
where status = 'active' and transport_route_id is not null;

create index if not exists idx_students_admission_no_lookup
on public.students (admission_no);

create index if not exists idx_receipts_payment_date_created_at
on public.receipts (payment_date desc, created_at desc);

create index if not exists idx_receipts_duplicate_guard_lookup
on public.receipts (student_id, payment_date, payment_mode, total_amount, created_at desc);

create index if not exists idx_installments_student_status_due_date
on public.installments (student_id, status, due_date);

create index if not exists idx_installments_class_status_due_date
on public.installments (class_id, status, due_date);
