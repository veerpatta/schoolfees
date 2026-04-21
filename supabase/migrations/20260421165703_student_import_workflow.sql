create table if not exists public.import_batches (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  source_format text not null check (source_format in ('csv', 'xlsx')),
  worksheet_name text,
  file_size_bytes integer not null default 0 check (file_size_bytes >= 0),
  status text not null default 'uploaded'
    check (status in ('uploaded', 'validated', 'importing', 'completed', 'failed')),
  detected_headers jsonb not null default '[]'::jsonb,
  column_mapping jsonb not null default '{}'::jsonb,
  total_rows integer not null default 0 check (total_rows >= 0),
  valid_rows integer not null default 0 check (valid_rows >= 0),
  invalid_rows integer not null default 0 check (invalid_rows >= 0),
  duplicate_rows integer not null default 0 check (duplicate_rows >= 0),
  imported_rows integer not null default 0 check (imported_rows >= 0),
  skipped_rows integer not null default 0 check (skipped_rows >= 0),
  failed_rows integer not null default 0 check (failed_rows >= 0),
  summary jsonb not null default '{}'::jsonb,
  validation_completed_at timestamptz,
  import_completed_at timestamptz,
  error_message text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint import_batches_detected_headers_array
    check (jsonb_typeof(detected_headers) = 'array'),
  constraint import_batches_column_mapping_object
    check (jsonb_typeof(column_mapping) = 'object'),
  constraint import_batches_summary_object
    check (jsonb_typeof(summary) = 'object')
);

create table if not exists public.import_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.import_batches(id) on delete cascade,
  row_index integer not null check (row_index > 0),
  raw_payload jsonb not null,
  normalized_payload jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'valid', 'invalid', 'duplicate', 'imported', 'skipped')),
  errors jsonb not null default '[]'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  duplicate_student_id uuid references public.students(id) on delete set null,
  imported_student_id uuid references public.students(id) on delete set null,
  imported_override_id uuid references public.student_fee_overrides(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint import_rows_batch_row_unique unique (batch_id, row_index),
  constraint import_rows_raw_payload_object
    check (jsonb_typeof(raw_payload) = 'object'),
  constraint import_rows_normalized_payload_object
    check (normalized_payload is null or jsonb_typeof(normalized_payload) = 'object'),
  constraint import_rows_errors_array
    check (jsonb_typeof(errors) = 'array'),
  constraint import_rows_warnings_array
    check (jsonb_typeof(warnings) = 'array')
);

create index if not exists idx_import_batches_created_at
on public.import_batches (created_at desc);

create index if not exists idx_import_batches_status_created_at
on public.import_batches (status, created_at desc);

create index if not exists idx_import_batches_created_by
on public.import_batches (created_by);

create index if not exists idx_import_rows_batch_row_index
on public.import_rows (batch_id, row_index);

create index if not exists idx_import_rows_batch_status
on public.import_rows (batch_id, status);

create index if not exists idx_import_rows_duplicate_student
on public.import_rows (duplicate_student_id)
where duplicate_student_id is not null;

create index if not exists idx_import_rows_imported_student
on public.import_rows (imported_student_id)
where imported_student_id is not null;

drop trigger if exists set_updated_at_on_import_batches on public.import_batches;
create trigger set_updated_at_on_import_batches
before update on public.import_batches
for each row execute function private.set_updated_at();

drop trigger if exists set_actor_columns_on_import_batches on public.import_batches;
create trigger set_actor_columns_on_import_batches
before insert or update on public.import_batches
for each row execute function private.set_actor_columns();

drop trigger if exists set_updated_at_on_import_rows on public.import_rows;
create trigger set_updated_at_on_import_rows
before update on public.import_rows
for each row execute function private.set_updated_at();

drop trigger if exists set_actor_columns_on_import_rows on public.import_rows;
create trigger set_actor_columns_on_import_rows
before insert or update on public.import_rows
for each row execute function private.set_actor_columns();

drop trigger if exists audit_import_batches on public.import_batches;
create trigger audit_import_batches
after insert or update or delete on public.import_batches
for each row execute function private.capture_audit_event();

drop trigger if exists audit_import_rows on public.import_rows;
create trigger audit_import_rows
after insert or update or delete on public.import_rows
for each row execute function private.capture_audit_event();

alter table public.import_batches enable row level security;
alter table public.import_rows enable row level security;

drop policy if exists "staff can read import batches" on public.import_batches;
create policy "staff can read import batches"
on public.import_batches for select
to authenticated
using (public.has_permission('imports:view') or public.has_permission('students:write'));

drop policy if exists "staff can insert import batches" on public.import_batches;
create policy "staff can insert import batches"
on public.import_batches for insert
to authenticated
with check (public.has_permission('students:write'));

drop policy if exists "staff can update import batches" on public.import_batches;
create policy "staff can update import batches"
on public.import_batches for update
to authenticated
using (public.has_permission('students:write'))
with check (public.has_permission('students:write'));

drop policy if exists "staff can read import rows" on public.import_rows;
create policy "staff can read import rows"
on public.import_rows for select
to authenticated
using (public.has_permission('imports:view') or public.has_permission('students:write'));

drop policy if exists "staff can insert import rows" on public.import_rows;
create policy "staff can insert import rows"
on public.import_rows for insert
to authenticated
with check (public.has_permission('students:write'));

drop policy if exists "staff can update import rows" on public.import_rows;
create policy "staff can update import rows"
on public.import_rows for update
to authenticated
using (public.has_permission('students:write'))
with check (public.has_permission('students:write'));

create or replace function public.import_student_batch_row(
  p_batch_id uuid,
  p_row_index integer,
  p_full_name text,
  p_class_id uuid,
  p_admission_no text,
  p_date_of_birth date,
  p_father_name text,
  p_mother_name text,
  p_primary_phone text,
  p_secondary_phone text,
  p_address text,
  p_transport_route_id uuid,
  p_status public.student_status,
  p_notes text,
  p_custom_tuition_fee_amount integer,
  p_custom_transport_fee_amount integer,
  p_custom_books_fee_amount integer,
  p_custom_admission_activity_misc_fee_amount integer,
  p_custom_other_fee_heads jsonb,
  p_custom_late_fee_flat_amount integer,
  p_discount_amount integer,
  p_student_type_override text,
  p_transport_applies_override boolean
)
returns table (
  student_id uuid,
  student_fee_override_id uuid
)
language plpgsql
set search_path = public, private
as $$
declare
  inserted_student_id uuid;
  imported_override_id uuid := null;
  active_fee_setting_id uuid;
  has_override boolean;
begin
  insert into public.students (
    full_name,
    class_id,
    admission_no,
    date_of_birth,
    father_name,
    mother_name,
    primary_phone,
    secondary_phone,
    address,
    transport_route_id,
    status,
    notes
  )
  values (
    trim(p_full_name),
    p_class_id,
    trim(p_admission_no),
    p_date_of_birth,
    nullif(trim(coalesce(p_father_name, '')), ''),
    nullif(trim(coalesce(p_mother_name, '')), ''),
    nullif(trim(coalesce(p_primary_phone, '')), ''),
    nullif(trim(coalesce(p_secondary_phone, '')), ''),
    nullif(trim(coalesce(p_address, '')), ''),
    p_transport_route_id,
    p_status,
    nullif(trim(coalesce(p_notes, '')), '')
  )
  returning id into inserted_student_id;

  has_override :=
    p_custom_tuition_fee_amount is not null
    or p_custom_transport_fee_amount is not null
    or p_custom_books_fee_amount is not null
    or p_custom_admission_activity_misc_fee_amount is not null
    or p_custom_late_fee_flat_amount is not null
    or coalesce(p_discount_amount, 0) > 0
    or (
      p_custom_other_fee_heads is not null
      and p_custom_other_fee_heads <> '{}'::jsonb
    )
    or nullif(trim(coalesce(p_student_type_override, '')), '') is not null
    or p_transport_applies_override is not null;

  if has_override then
    select fs.id
    into active_fee_setting_id
    from public.fee_settings as fs
    where fs.class_id = p_class_id
      and fs.is_active = true
    limit 1;

    if active_fee_setting_id is null then
      raise exception 'No active fee settings found for imported student class.';
    end if;

    insert into public.student_fee_overrides (
      student_id,
      fee_setting_id,
      custom_tuition_fee_amount,
      custom_transport_fee_amount,
      custom_books_fee_amount,
      custom_admission_activity_misc_fee_amount,
      custom_other_fee_heads,
      custom_late_fee_flat_amount,
      discount_amount,
      student_type_override,
      transport_applies_override,
      reason,
      notes,
      is_active
    )
    values (
      inserted_student_id,
      active_fee_setting_id,
      p_custom_tuition_fee_amount,
      p_custom_transport_fee_amount,
      p_custom_books_fee_amount,
      p_custom_admission_activity_misc_fee_amount,
      case
        when p_custom_other_fee_heads is null then '{}'::jsonb
        else p_custom_other_fee_heads
      end,
      p_custom_late_fee_flat_amount,
      coalesce(p_discount_amount, 0),
      nullif(trim(coalesce(p_student_type_override, '')), ''),
      p_transport_applies_override,
      format('Imported from batch %s row %s', p_batch_id, p_row_index),
      null,
      true
    )
    returning id into imported_override_id;
  end if;

  return query
  select inserted_student_id, imported_override_id;
end;
$$;

grant execute on function public.import_student_batch_row(
  uuid,
  integer,
  text,
  uuid,
  text,
  date,
  text,
  text,
  text,
  text,
  text,
  uuid,
  public.student_status,
  text,
  integer,
  integer,
  integer,
  integer,
  jsonb,
  integer,
  integer,
  text,
  boolean
) to authenticated;
