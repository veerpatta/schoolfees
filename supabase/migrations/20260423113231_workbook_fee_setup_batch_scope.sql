alter table public.config_change_batches
drop constraint if exists config_change_batches_change_scope_check;

alter table public.config_change_batches
add constraint config_change_batches_change_scope_check
check (
  change_scope in (
    'global_policy',
    'school_defaults',
    'class_defaults',
    'transport_defaults',
    'student_override',
    'workbook_setup'
  )
);
