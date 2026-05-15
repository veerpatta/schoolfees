create table if not exists private.vpps_direct_import_backups (
  id uuid primary key default gen_random_uuid(),
  backup_label text not null unique,
  created_at timestamptz not null default now(),
  table_counts jsonb not null,
  checksum_summary jsonb not null,
  snapshot jsonb not null
);

comment on table private.vpps_direct_import_backups is 'Pre-write JSON snapshots for audited direct VPPS import operations.';
