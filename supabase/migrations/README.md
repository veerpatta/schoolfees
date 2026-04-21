# Supabase Migrations

Keep ordered schema changes in this folder when you start managing the database
through the Supabase CLI.

Current repo convention:

- `supabase/schema.sql` is the full setup snapshot for quick review and manual
  first-time bootstrap.
- `supabase/migrations/*.sql` is the long-term deployment history.
- create new files with `supabase migration new <name>` so the CLI generates
  the timestamped filename in the correct location.
- once migrations are the source of truth, avoid making remote schema changes
  directly in the Supabase dashboard.
