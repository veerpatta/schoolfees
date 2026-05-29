-- Per-session "no-call / will pay anyway" flag (admin-only).
--
-- Some parents reliably clear their dues on their own and should NOT be called
-- or reminded. An admin marks them here; the Defaulters worklist then drops them
-- from the active call queue and surfaces them under a separate "No-call" segment
-- so they remain auditable. The flag is scoped to one academic session and resets
-- each new session (dues are session-scoped too).
--
-- Write access rides on the existing admin-only 'students:write' permission, so
-- no new permission key and no change to has_permission() is required. Read is
-- open to anyone who can view the Defaulters list.

create table if not exists public.student_collection_flags (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  session_label text not null,
  no_call boolean not null default true,
  reason text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, session_label)
);

comment on table public.student_collection_flags is
  'Per-session collection preferences for a student. Currently the admin-only '
  '"no-call / will pay anyway" flag that excludes a parent from the call queue.';

comment on column public.student_collection_flags.no_call is
  'When true, the student is excluded from the Defaulters call queue for this '
  'session and shown under the No-call/Trusted segment instead.';

create index if not exists student_collection_flags_session_idx
  on public.student_collection_flags (session_label)
  where no_call = true;

-- updated_at + actor columns, mirroring student_fee_overrides.
drop trigger if exists set_updated_at_on_student_collection_flags
  on public.student_collection_flags;
create trigger set_updated_at_on_student_collection_flags
before update on public.student_collection_flags
for each row execute function private.set_updated_at();

drop trigger if exists set_actor_columns_on_student_collection_flags
  on public.student_collection_flags;
create trigger set_actor_columns_on_student_collection_flags
before insert or update on public.student_collection_flags
for each row execute function private.set_actor_columns();

-- Audit trail, mirroring other staff-scoped tables.
drop trigger if exists audit_student_collection_flags
  on public.student_collection_flags;
create trigger audit_student_collection_flags
after insert or update or delete on public.student_collection_flags
for each row execute function private.capture_audit_event();

-- RLS — read for defaulter viewers, write for admins (students:write).
alter table public.student_collection_flags enable row level security;

drop policy if exists "staff can read collection flags" on public.student_collection_flags;
create policy "staff can read collection flags"
on public.student_collection_flags for select
to authenticated
using (public.has_permission('defaulters:view'));

drop policy if exists "admin can insert collection flags" on public.student_collection_flags;
create policy "admin can insert collection flags"
on public.student_collection_flags for insert
to authenticated
with check (public.has_permission('students:write'));

drop policy if exists "admin can update collection flags" on public.student_collection_flags;
create policy "admin can update collection flags"
on public.student_collection_flags for update
to authenticated
using (public.has_permission('students:write'))
with check (public.has_permission('students:write'));
