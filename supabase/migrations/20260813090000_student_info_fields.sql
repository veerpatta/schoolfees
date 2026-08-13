-- Student information fields.
--
-- The students table was built for fee collection, so it carried almost nothing
-- about the student: no Aadhaar, no house, no gender, no district. The office
-- kept that in registers and spreadsheets, which is why the same student had to
-- be looked up in two places. These columns move the rest of the record in.
--
-- Every column is nullable text with no default and no check. Nothing here can
-- fail against the live 2026-27 rows, and every field is optional by design —
-- an office fills a student record in over weeks, not in one sitting.
--
-- Three deliberate absences:
--   * No `section`. public.classes already has section and stream_name, and the
--     whole workbook view stack reads them. Section belongs to the class.
--   * No `admission_date`. students.joined_on already exists; this migration
--     just makes the app finally read it.
--   * No address backfill. The free-text `address` column stays exactly as it
--     is and keeps its meaning ("address as on record"); the structured parts
--     sit alongside it. Splitting free text by regex loses data.

begin;

alter table public.students
  -- Identity
  add column if not exists gender text,
  add column if not exists blood_group text,
  add column if not exists category text,
  add column if not exists religion text,
  add column if not exists caste text,
  add column if not exists nationality text,
  add column if not exists mother_tongue text,
  -- Government IDs
  add column if not exists aadhaar_no text,
  add column if not exists jan_aadhaar_no text,
  add column if not exists apaar_id text,
  -- School record
  add column if not exists house text,
  add column if not exists roll_no text,
  add column if not exists previous_school text,
  add column if not exists tc_number text,
  add column if not exists board_registration_no text,
  -- Address (structured; complements, does not replace, students.address)
  add column if not exists village_city text,
  add column if not exists tehsil text,
  add column if not exists district text,
  add column if not exists state text,
  add column if not exists pincode text,
  -- Guardian and emergency contact
  add column if not exists guardian_name text,
  add column if not exists guardian_relation text,
  add column if not exists guardian_phone text,
  add column if not exists emergency_contact_name text,
  add column if not exists emergency_contact_phone text;

comment on column public.students.category is
  'Reservation category as written on the admission form — General / OBC / SC / ST / EWS / Other.';
comment on column public.students.aadhaar_no is
  'Student Aadhaar number. Optional, and unique across students where present.';
comment on column public.students.jan_aadhaar_no is
  'Rajasthan Jan Aadhaar (family ID). Shared by siblings, so deliberately not unique.';
comment on column public.students.apaar_id is
  'APAAR / PEN — the national student registry ID.';
comment on column public.students.house is
  'School house for sports and assembly (Red / Blue / Green / Yellow).';
comment on column public.students.village_city is
  'Structured address. public.students.address stays as the free-text line it always was.';

-- Two students cannot share an Aadhaar. Partial, so the 25 columns above stay
-- genuinely optional: only rows that actually carry a number are constrained.
-- It cannot fail on this migration because the column is new and every row is
-- null; the app maps 23505 on this index to a field-level message.
create unique index if not exists idx_students_aadhaar_no_unique
  on public.students (aadhaar_no)
  where aadhaar_no is not null;

commit;
