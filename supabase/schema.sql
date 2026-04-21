-- Core schema for internal school fee management
-- Run in Supabase SQL Editor

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  admission_no text unique not null,
  full_name text not null,
  class_section text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fee_plans (
  id uuid primary key default gen_random_uuid(),
  class_name text not null,
  annual_fee integer not null check (annual_fee >= 0),
  installment_count integer not null default 4,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fee_ledger (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  installment_label text not null,
  due_date date not null,
  amount integer not null check (amount >= 0),
  late_fee integer not null default 1000,
  paid_amount integer not null default 0,
  payment_status text not null default 'pending',
  receipt_no text,
  payment_mode text,
  paid_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_fee_ledger_student_id on public.fee_ledger(student_id);
create index if not exists idx_fee_ledger_due_date on public.fee_ledger(due_date);

alter table public.students enable row level security;
alter table public.fee_plans enable row level security;
alter table public.fee_ledger enable row level security;

-- For internal admin use, start strict and add explicit policies later.
-- Example read policy for authenticated users:
-- create policy "authenticated can read students"
-- on public.students for select
-- to authenticated
-- using (true);
