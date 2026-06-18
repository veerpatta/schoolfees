-- Allow custom (school-defined) conventional discount policies alongside the three
-- built-in defaults, and flag the built-ins so they stay protected.
--
-- 1. Replace the hard-coded `code in ('rte','staff_child','third_child')` CHECK with a
--    lowercase-slug format check, so codes like 'sports_quota' or 'sibling_2026' are valid.
-- 2. Add `is_builtin` so RTE / Staff Child / 3rd Child remain protected school defaults
--    while custom policies can be added and deactivated. Built-in-ness is ALSO derivable
--    from the code in the app layer (the three default codes are always treated as
--    built-in), so this column is a hygiene/UX signal, not the sole source of truth.
--
-- The three existing codes all satisfy the new slug pattern, so no row is invalidated.

alter table public.conventional_discount_policies
  drop constraint if exists conventional_discount_policies_code_check;

-- Lowercase slug: starts with a letter, then letters / digits / underscores (2-48 chars).
alter table public.conventional_discount_policies
  add constraint conventional_discount_policies_code_check
  check (code ~ '^[a-z][a-z0-9_]{1,47}$');

alter table public.conventional_discount_policies
  add column if not exists is_builtin boolean not null default false;

update public.conventional_discount_policies
  set is_builtin = true
  where code in ('rte', 'staff_child', 'third_child')
    and is_builtin = false;
