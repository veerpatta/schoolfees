# Supabase Schema Notes

This folder is reserved for future split schema files if the single
`supabase/schema.sql` snapshot becomes too large to manage comfortably.

Current repo convention:

- keep `supabase/schema.sql` as the canonical one-file schema snapshot for
  initial setup
- keep `supabase/migrations/` as the ordered change history
- add modular reference files here later only if the schema needs to be broken
  into smaller parts
