-- Historical remote migration placeholder.
--
-- The linked Supabase project already records version 20260612022836 as applied
-- from an early Notion sync cron migration. The current repo migration
-- 20260612023000_notion_fee_sync.sql schedules the current TEST-session cron
-- using Vault-backed secrets instead of embedding runtime values.
--
-- Keep this file so Supabase Preview sees the same migration version that is
-- present in supabase_migrations.schema_migrations.
select 1;
