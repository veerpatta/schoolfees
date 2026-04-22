alter table public.student_fee_overrides
  add column if not exists notes text;
