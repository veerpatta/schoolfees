-- Phase 5 — defaulter contact log (append-only).
--
-- Each row records one contact attempt with a parent: channel, outcome,
-- optional snooze date, and the staff member who made the contact.
-- Records are append-only; a "mistake" gets a new row with outcome
-- 'other' and a clarifying note, never an UPDATE or DELETE.
--
-- IMPORTANT: this migration is shipped as part of Phase 5 UI work but is
-- NOT yet applied automatically. Run `supabase db push` after reviewing.

create table if not exists defaulter_contacts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  session_label text not null,
  contacted_at timestamptz not null default now(),
  contacted_by uuid references auth.users(id),
  channel text not null
    check (channel in ('call','whatsapp','sms','in_person','email')),
  outcome text not null
    check (outcome in ('reached','no_answer','promised_pay','dispute','other')),
  snooze_until date,
  note text,
  created_at timestamptz not null default now()
);

comment on table defaulter_contacts is
  'Append-only log of defaulter contact attempts. Never UPDATE/DELETE — '
  'corrections go in as a new row with outcome=other.';

comment on column defaulter_contacts.snooze_until is
  'If set, the next contact attempt should not be expected until this date. '
  'Drives the "Snoozed" tab in the defaulters triage queue.';

create index if not exists defaulter_contacts_student_recent_idx
  on defaulter_contacts (student_id, contacted_at desc);

create index if not exists defaulter_contacts_session_idx
  on defaulter_contacts (session_label, contacted_at desc);

-- RLS — same pattern as other staff-scoped tables in this app.
alter table defaulter_contacts enable row level security;

create policy "defaulter_contacts: staff read"
  on defaulter_contacts for select
  using (
    auth.role() = 'authenticated'
  );

create policy "defaulter_contacts: staff insert"
  on defaulter_contacts for insert
  with check (
    auth.role() = 'authenticated'
  );

-- No UPDATE / DELETE policies — append-only by construction.
