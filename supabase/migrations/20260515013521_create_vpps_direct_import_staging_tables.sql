create table if not exists private.vpps_direct_import_stage_students (
  import_name text not null,
  source_key text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  primary key (import_name, source_key),
  constraint vpps_direct_import_stage_students_payload_object check (jsonb_typeof(payload) = 'object')
);

create table if not exists private.vpps_direct_import_stage_dues (
  import_name text not null,
  source_key text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  primary key (import_name, source_key),
  constraint vpps_direct_import_stage_dues_payload_object check (jsonb_typeof(payload) = 'object')
);

create table if not exists private.vpps_direct_import_stage_skipped (
  import_name text not null,
  source text not null,
  source_row_number integer not null,
  status text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  primary key (import_name, source, source_row_number, status),
  constraint vpps_direct_import_stage_skipped_payload_object check (jsonb_typeof(payload) = 'object')
);

comment on table private.vpps_direct_import_stage_students is 'Private staging rows for the 2026-27 latest Excel direct import.';
comment on table private.vpps_direct_import_stage_dues is 'Private staging dues for the 2026-27 latest Excel direct import.';
comment on table private.vpps_direct_import_stage_skipped is 'Private staging skipped-row audit for the 2026-27 latest Excel direct import.';
