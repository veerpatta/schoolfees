alter table public.import_rows
  add column if not exists duplicate_audit_decision text
    check (
      duplicate_audit_decision is null
      or duplicate_audit_decision in ('proceed_new', 'mark_duplicate', 'mark_update')
    );

alter table public.import_rows
  add column if not exists duplicate_audit_target_student_id uuid
    references public.students(id) on delete set null;

create index if not exists idx_import_rows_audit_decision
  on public.import_rows (batch_id, duplicate_audit_decision)
  where duplicate_audit_decision is not null;
