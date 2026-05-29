-- Defaulter contact log — per-number attribution.
--
-- Adds the dialed number (and its Father/Mother label) to each contact row so
-- the worklist can learn *which* number actually answers and suggest the best
-- one to try next. Both columns are nullable and additive: existing rows stay
-- NULL (pre-feature attempts), and the defaulters layer defaults to the primary
-- number until staff start logging per-number. No UPDATE/DELETE path is added —
-- defaulter_contacts remains append-only.

alter table public.defaulter_contacts
  add column if not exists contacted_phone text,
  add column if not exists phone_label text;

comment on column public.defaulter_contacts.contacted_phone is
  'The phone number actually dialed/messaged for this attempt, when known. '
  'Used to compute per-number answer rates and the suggested number.';

comment on column public.defaulter_contacts.phone_label is
  'Which stored number was used: typically ''Father'' (primary_phone) or '
  '''Mother'' (secondary_phone). NULL for legacy rows logged before attribution.';
