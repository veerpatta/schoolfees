create table if not exists public.ledger_regeneration_batches (
  id uuid primary key default gen_random_uuid(),
  policy_revision_id uuid references public.fee_policy_configs(id) on delete set null,
  policy_revision_label text not null,
  reason text not null,
  status text not null default 'preview_ready'
    check (status in ('preview_ready', 'applied', 'stale', 'failed', 'cancelled')),
  source_snapshot jsonb not null default '{}'::jsonb,
  preview_summary jsonb not null default '{}'::jsonb,
  apply_summary jsonb,
  apply_notes text,
  previewed_at timestamptz not null default now(),
  applied_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (trim(reason) <> ''),
  check (trim(policy_revision_label) <> ''),
  check (jsonb_typeof(source_snapshot) = 'object'),
  check (jsonb_typeof(preview_summary) = 'object'),
  check (apply_summary is null or jsonb_typeof(apply_summary) = 'object')
);

create table if not exists public.ledger_regeneration_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.ledger_regeneration_batches(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete restrict,
  installment_id uuid references public.installments(id) on delete restrict,
  class_id uuid not null references public.classes(id) on delete restrict,
  fee_setting_id uuid not null references public.fee_settings(id) on delete restrict,
  student_fee_override_id uuid references public.student_fee_overrides(id) on delete set null,
  student_label text not null,
  class_label text not null,
  installment_no smallint not null check (installment_no > 0),
  installment_label text not null,
  due_date date not null,
  base_amount integer not null default 0 check (base_amount >= 0),
  transport_amount integer not null default 0 check (transport_amount >= 0),
  discount_amount integer not null default 0 check (discount_amount >= 0),
  late_fee_flat_amount integer not null default 0 check (late_fee_flat_amount >= 0),
  amount_due integer not null default 0 check (amount_due >= 0),
  paid_amount integer not null default 0 check (paid_amount >= 0),
  adjustment_amount integer not null default 0,
  outstanding_amount integer not null default 0 check (outstanding_amount >= 0),
  balance_status text not null
    check (balance_status in ('paid', 'partial', 'unpaid', 'future', 'waived', 'cancelled')),
  action_needed text not null
    check (action_needed in ('insert', 'update', 'cancel', 'skip', 'review')),
  reason_code text not null
    check (
      reason_code in (
        'missing_installment',
        'already_in_sync',
        'fully_paid',
        'partially_paid',
        'adjustment_posted',
        'existing_waived',
        'existing_cancelled',
        'extra_installment',
        'missing_settings'
      )
    ),
  reason_label text not null,
  review_status text not null default 'pending' check (review_status in ('pending', 'reviewed')),
  review_notes text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ledger_regeneration_batches_status_created
on public.ledger_regeneration_batches (status, created_at desc);

create index if not exists idx_ledger_regeneration_batches_policy_created
on public.ledger_regeneration_batches (policy_revision_id, created_at desc);

create index if not exists idx_ledger_regeneration_rows_batch_created
on public.ledger_regeneration_rows (batch_id, created_at);

create index if not exists idx_ledger_regeneration_rows_batch_action
on public.ledger_regeneration_rows (batch_id, action_needed);

create index if not exists idx_ledger_regeneration_rows_student_due
on public.ledger_regeneration_rows (student_id, due_date);

drop trigger if exists set_updated_at_on_ledger_regeneration_batches on public.ledger_regeneration_batches;
create trigger set_updated_at_on_ledger_regeneration_batches
before update on public.ledger_regeneration_batches
for each row execute function private.set_updated_at();

drop trigger if exists set_actor_columns_on_ledger_regeneration_batches on public.ledger_regeneration_batches;
create trigger set_actor_columns_on_ledger_regeneration_batches
before insert or update on public.ledger_regeneration_batches
for each row execute function private.set_actor_columns();

drop trigger if exists audit_ledger_regeneration_batches on public.ledger_regeneration_batches;
create trigger audit_ledger_regeneration_batches
after insert or update or delete on public.ledger_regeneration_batches
for each row execute function private.capture_audit_event();

drop trigger if exists set_updated_at_on_ledger_regeneration_rows on public.ledger_regeneration_rows;
create trigger set_updated_at_on_ledger_regeneration_rows
before update on public.ledger_regeneration_rows
for each row execute function private.set_updated_at();

drop trigger if exists set_actor_columns_on_ledger_regeneration_rows on public.ledger_regeneration_rows;
create trigger set_actor_columns_on_ledger_regeneration_rows
before insert or update on public.ledger_regeneration_rows
for each row execute function private.set_actor_columns();

drop trigger if exists audit_ledger_regeneration_rows on public.ledger_regeneration_rows;
create trigger audit_ledger_regeneration_rows
after insert or update or delete on public.ledger_regeneration_rows
for each row execute function private.capture_audit_event();

alter table public.ledger_regeneration_batches enable row level security;
alter table public.ledger_regeneration_rows enable row level security;

drop policy if exists "authenticated can read ledger regeneration batches" on public.ledger_regeneration_batches;
create policy "authenticated can read ledger regeneration batches"
on public.ledger_regeneration_batches for select
to authenticated
using (public.has_permission('fees:view'));

drop policy if exists "authenticated can insert ledger regeneration batches" on public.ledger_regeneration_batches;
create policy "authenticated can insert ledger regeneration batches"
on public.ledger_regeneration_batches for insert
to authenticated
with check (public.has_permission('fees:write'));

drop policy if exists "authenticated can update ledger regeneration batches" on public.ledger_regeneration_batches;
create policy "authenticated can update ledger regeneration batches"
on public.ledger_regeneration_batches for update
to authenticated
using (public.has_permission('fees:write'))
with check (public.has_permission('fees:write'));

drop policy if exists "authenticated can read ledger regeneration rows" on public.ledger_regeneration_rows;
create policy "authenticated can read ledger regeneration rows"
on public.ledger_regeneration_rows for select
to authenticated
using (public.has_permission('fees:view'));

drop policy if exists "authenticated can insert ledger regeneration rows" on public.ledger_regeneration_rows;
create policy "authenticated can insert ledger regeneration rows"
on public.ledger_regeneration_rows for insert
to authenticated
with check (public.has_permission('fees:write'));

drop policy if exists "authenticated can update ledger regeneration rows" on public.ledger_regeneration_rows;
create policy "authenticated can update ledger regeneration rows"
on public.ledger_regeneration_rows for update
to authenticated
using (public.has_permission('fees:write'))
with check (public.has_permission('fees:write'));
