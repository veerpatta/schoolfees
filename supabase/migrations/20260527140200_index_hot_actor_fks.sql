-- Add covering indexes for the foreign-key columns flagged by
-- supabase.get_advisors('performance') with the unindexed_foreign_keys lint.
-- All of these point at `users(id)` and back attribution / audit columns; the
-- missing indexes show up as sequential scans whenever the planner joins
-- back to users for actor display, and they slow ON DELETE checks too.
--
-- We use IF NOT EXISTS so this migration is idempotent across staging /
-- production. CREATE INDEX CONCURRENTLY would be ideal in production, but
-- Postgres forbids it inside a transaction block; the migration runner wraps
-- each file in a transaction. These tables are small enough that the plain
-- form will finish within milliseconds.

create index if not exists defaulter_contacts_contacted_by_idx
  on public.defaulter_contacts (contacted_by);

create index if not exists office_sync_events_created_by_idx
  on public.office_sync_events (created_by);

create index if not exists payment_adjustment_reviews_created_by_idx
  on public.payment_adjustment_reviews (created_by);

create index if not exists receipt_adjustments_created_by_idx
  on public.receipt_adjustments (created_by);

create index if not exists receipt_finance_adjustments_created_by_idx
  on public.receipt_finance_adjustments (created_by);

create index if not exists scda_applied_by_idx
  on public.student_conventional_discount_assignments (applied_by);

create index if not exists student_family_groups_created_by_idx
  on public.student_family_groups (created_by);

create index if not exists student_family_groups_updated_by_idx
  on public.student_family_groups (updated_by);

create index if not exists student_share_links_created_by_idx
  on public.student_share_links (created_by);
