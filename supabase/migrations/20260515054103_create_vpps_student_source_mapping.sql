-- VPPS latest-Excel import (2026-05-15): private mapping table that anchors
-- workbook source_student_uid values to public.students.id so re-runs of the
-- importer stay idempotent without touching public-facing columns.
-- Backward compatible (private schema, additive only). Safe to leave in place.

create table if not exists private.vpps_student_source_mapping (
  source_student_uid text not null,
  import_name text not null,
  student_id uuid not null references public.students(id) on delete cascade,
  workbook_filename text,
  matched_via text not null
    check (matched_via in ('source_student_uid', 'admission_no', 'name_class_phone_fallback', 'created_new')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (source_student_uid, import_name)
);

create index if not exists vpps_student_source_mapping_student_id_idx
  on private.vpps_student_source_mapping (student_id);

comment on table private.vpps_student_source_mapping is
  'Maps workbook source_student_uid (e.g. STU-0146) to the public.students.id it resolved to during a VPPS direct import. Used to keep re-runs idempotent and to anchor historical payment/fee-line attribution.';
