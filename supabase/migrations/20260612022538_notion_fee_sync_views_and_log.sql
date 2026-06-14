-- Historical remote migration placeholder.
--
-- The linked Supabase project already records version 20260612022538 as applied
-- from an early Notion sync migration. The current repo migration
-- 20260612023000_notion_fee_sync.sql owns the idempotent schema definition used
-- for fresh databases and upgrades existing remote tables safely.
--
-- Keep this file so Supabase Preview sees the same migration version that is
-- present in supabase_migrations.schema_migrations.
select 1;
