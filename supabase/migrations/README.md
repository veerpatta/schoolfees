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
- never rename a migration file after it has been applied to any shared or
  remote database. Supabase tracks the timestamp version, not the SQL body.

Current one-time repair note:

- earlier repo history renamed three existing migrations to chronological
  timestamps:
  - `20260421113000` -> `20260421054019`
  - `20260421114500` -> `20260421054148`
  - `20260421123000` -> `20260421064517`
- if a remote project still has the old versions recorded, run migration
  repair against the remote history before the next deploy:

```bash
supabase migration repair --status reverted 20260421113000 20260421114500 20260421123000
supabase migration repair --status applied 20260421054019 20260421054148 20260421064517
```

- some remote projects also retained the pre-final staff sync version
  `20260421140354`; if it appears in remote history without a local file,
  repair it as reverted so only `20260421203000` remains:

```bash
supabase migration repair --status reverted 20260421140354
supabase migration repair --status applied 20260421203000
```
