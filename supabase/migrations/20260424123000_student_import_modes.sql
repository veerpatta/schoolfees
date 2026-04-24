alter table public.import_batches
  add column if not exists import_mode text not null default 'add'
  check (import_mode in ('add', 'update'));
