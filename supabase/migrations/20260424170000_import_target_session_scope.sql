alter table public.import_batches
  add column if not exists target_session_label text;

create index if not exists idx_import_batches_target_session_label
on public.import_batches (target_session_label)
where target_session_label is not null;
