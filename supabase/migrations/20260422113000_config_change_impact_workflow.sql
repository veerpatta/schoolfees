create table if not exists public.config_change_batches (
  id uuid primary key default gen_random_uuid(),
  change_scope text not null
    check (
      change_scope in (
        'global_policy',
        'school_defaults',
        'class_defaults',
        'transport_defaults',
        'student_override'
      )
    ),
  target_ref text,
  target_label text not null,
  status text not null default 'preview_ready'
    check (status in ('preview_ready', 'applied', 'stale', 'failed', 'cancelled')),
  before_payload jsonb not null default '{}'::jsonb,
  proposed_payload jsonb not null default '{}'::jsonb,
  changed_fields jsonb not null default '[]'::jsonb,
  preview_summary jsonb not null default '{}'::jsonb,
  apply_summary jsonb,
  apply_notes text,
  previewed_at timestamptz not null default now(),
  applied_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(before_payload) = 'object'),
  check (jsonb_typeof(proposed_payload) = 'object'),
  check (jsonb_typeof(changed_fields) = 'array'),
  check (jsonb_typeof(preview_summary) = 'object'),
  check (apply_summary is null or jsonb_typeof(apply_summary) = 'object')
);

create table if not exists public.config_change_blocked_installments (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.config_change_batches(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete restrict,
  installment_id uuid not null references public.installments(id) on delete restrict,
  installment_label text not null,
  due_date date not null,
  amount_due integer not null default 0 check (amount_due >= 0),
  paid_amount integer not null default 0 check (paid_amount >= 0),
  adjustment_amount integer not null default 0,
  outstanding_amount integer not null default 0 check (outstanding_amount >= 0),
  reason_code text not null
    check (reason_code in ('fully_paid', 'partially_paid', 'adjustment_posted')),
  reason_label text not null,
  action_needed text not null check (action_needed in ('update', 'cancel')),
  review_status text not null default 'pending' check (review_status in ('pending', 'reviewed')),
  review_notes text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint config_change_blocked_unique unique (batch_id, installment_id, action_needed)
);

create index if not exists idx_config_change_batches_status_created
on public.config_change_batches (status, created_at desc);

create index if not exists idx_config_change_batches_scope_created
on public.config_change_batches (change_scope, created_at desc);

create index if not exists idx_config_change_blocked_batch
on public.config_change_blocked_installments (batch_id, created_at);

create index if not exists idx_config_change_blocked_student
on public.config_change_blocked_installments (student_id, due_date);

drop trigger if exists set_updated_at_on_config_change_batches on public.config_change_batches;
create trigger set_updated_at_on_config_change_batches
before update on public.config_change_batches
for each row execute function private.set_updated_at();

drop trigger if exists set_actor_columns_on_config_change_batches on public.config_change_batches;
create trigger set_actor_columns_on_config_change_batches
before insert or update on public.config_change_batches
for each row execute function private.set_actor_columns();

drop trigger if exists audit_config_change_batches on public.config_change_batches;
create trigger audit_config_change_batches
after insert or update or delete on public.config_change_batches
for each row execute function private.capture_audit_event();

drop trigger if exists set_updated_at_on_config_change_blocked_installments on public.config_change_blocked_installments;
create trigger set_updated_at_on_config_change_blocked_installments
before update on public.config_change_blocked_installments
for each row execute function private.set_updated_at();

drop trigger if exists set_actor_columns_on_config_change_blocked_installments on public.config_change_blocked_installments;
create trigger set_actor_columns_on_config_change_blocked_installments
before insert or update on public.config_change_blocked_installments
for each row execute function private.set_actor_columns();

drop trigger if exists audit_config_change_blocked_installments on public.config_change_blocked_installments;
create trigger audit_config_change_blocked_installments
after insert or update or delete on public.config_change_blocked_installments
for each row execute function private.capture_audit_event();

alter table public.config_change_batches enable row level security;
alter table public.config_change_blocked_installments enable row level security;

drop policy if exists "authenticated can read config change batches" on public.config_change_batches;
create policy "authenticated can read config change batches"
on public.config_change_batches for select
to authenticated
using (public.has_permission('fees:view'));

drop policy if exists "authenticated can insert config change batches" on public.config_change_batches;
create policy "authenticated can insert config change batches"
on public.config_change_batches for insert
to authenticated
with check (public.has_permission('fees:write'));

drop policy if exists "authenticated can update config change batches" on public.config_change_batches;
create policy "authenticated can update config change batches"
on public.config_change_batches for update
to authenticated
using (public.has_permission('fees:write'))
with check (public.has_permission('fees:write'));

drop policy if exists "authenticated can read config change blocked installments" on public.config_change_blocked_installments;
create policy "authenticated can read config change blocked installments"
on public.config_change_blocked_installments for select
to authenticated
using (public.has_permission('fees:view'));

drop policy if exists "authenticated can insert config change blocked installments" on public.config_change_blocked_installments;
create policy "authenticated can insert config change blocked installments"
on public.config_change_blocked_installments for insert
to authenticated
with check (public.has_permission('fees:write'));

drop policy if exists "authenticated can update config change blocked installments" on public.config_change_blocked_installments;
create policy "authenticated can update config change blocked installments"
on public.config_change_blocked_installments for update
to authenticated
using (public.has_permission('fees:write'))
with check (public.has_permission('fees:write'));
