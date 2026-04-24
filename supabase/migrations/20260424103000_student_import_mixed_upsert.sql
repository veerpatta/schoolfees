-- Track whether each staged student import row will create a new record or
-- update an existing SR-number match.

alter table public.import_rows
  add column if not exists import_operation text not null default 'create'
    check (import_operation in ('create', 'update')),
  add column if not exists target_student_id uuid references public.students(id) on delete set null,
  add column if not exists changed_fields jsonb not null default '[]'::jsonb;

alter table public.import_rows
  add constraint import_rows_changed_fields_array
    check (jsonb_typeof(changed_fields) = 'array');

create index if not exists idx_import_rows_target_student
on public.import_rows (target_student_id)
where target_student_id is not null;

create index if not exists idx_import_rows_operation
on public.import_rows (batch_id, import_operation);
