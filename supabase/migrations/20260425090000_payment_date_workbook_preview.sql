create or replace function public.preview_workbook_payment_allocation(
  p_student_id uuid,
  p_payment_date date
)
returns table (
  installment_id uuid,
  student_id uuid,
  admission_no text,
  student_name text,
  father_name text,
  father_phone text,
  session_label text,
  class_id uuid,
  class_name text,
  class_label text,
  section text,
  stream_name text,
  installment_no smallint,
  installment_label text,
  due_date date,
  base_charge integer,
  paid_amount integer,
  adjustment_amount integer,
  applied_amount integer,
  raw_late_fee integer,
  waiver_applied integer,
  final_late_fee integer,
  total_charge integer,
  pending_amount integer,
  balance_status text,
  last_payment_date date,
  transport_route_id uuid,
  transport_route_name text,
  transport_route_code text
)
language sql
stable
security invoker
set search_path = public, private
as $$
  select *
  from private.workbook_installment_snapshot(p_student_id, p_payment_date, true)
  where pending_amount > 0
  order by due_date asc, installment_no asc;
$$;

grant execute on function public.preview_workbook_payment_allocation(uuid, date) to authenticated;
