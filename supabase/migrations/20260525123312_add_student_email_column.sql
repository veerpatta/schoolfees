-- Optional email address on students. Used by receipt sharing to enable a
-- mailto draft to the parent. Free text, no validation at the DB level —
-- the UI validates with a soft regex before opening the mail client.
alter table students
  add column if not exists email text;

comment on column students.email is
  'Optional parent email address. Used by receipt sharing to enable a mailto draft. '
  'Free text — UI validates softly before opening the mail client.';
