create table if not exists public.student_share_links (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  token text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  last_viewed_at timestamptz,
  view_count integer not null default 0
);

create index if not exists idx_student_share_links_student
  on public.student_share_links (student_id, created_at desc);

create index if not exists idx_student_share_links_active
  on public.student_share_links (revoked_at, expires_at);

drop trigger if exists audit_student_share_links on public.student_share_links;
create trigger audit_student_share_links
  after insert or update or delete on public.student_share_links
  for each row execute function private.capture_audit_event();

alter table public.student_share_links enable row level security;

drop policy if exists "staff can read share links" on public.student_share_links;
create policy "staff can read share links"
  on public.student_share_links for select
  to authenticated
  using (public.has_permission('students:view'));

drop policy if exists "staff can insert share links" on public.student_share_links;
create policy "staff can insert share links"
  on public.student_share_links for insert
  to authenticated
  with check (public.has_permission('students:write'));

drop policy if exists "staff can update share links" on public.student_share_links;
create policy "staff can update share links"
  on public.student_share_links for update
  to authenticated
  using (public.has_permission('students:write'))
  with check (public.has_permission('students:write'));
