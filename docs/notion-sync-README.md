# VPPS Notion Fee Sync

This sync sends fee information one way:

`Schoolfees app / Supabase -> Notion`

Notion is only a read-only mirror. Staff should not use Notion to change fees,
payments, receipts, discounts, dues, promises, callback dates, contact status,
or next actions.

Recovery follow-up is owned by the Schoolfees app:

- Use `Defaulters` for daily recovery work, promises, no-answer tracking, and
  no-call flags.
- Use the Schoolfees MCP tools for AI analysis over the same app data.
- Treat any older Notion follow-up tracker as historical/reference-only.

## What It Updates

The sync creates or refreshes these Notion areas:

- `VPPS Fee Data Sync (Auto - Do Not Edit)` for one row per student.
- `VPPS Daily Fee Summary (Auto)` for one row per date.

The sync does not create, update, or depend on `VPPS Fee Follow-up Tracker`.
Manual follow-up fields belong in the app, not in Notion.

## First Setup In Notion

1. Open Notion in the workspace used for VPPS follow-up.
2. Go to `Settings`.
3. Open `Connections`.
4. Click `Develop or manage integrations`.
5. Click `New integration`.
6. Name it `VPPS Fee Sync`.
7. Select the VPPS workspace.
8. Save it.
9. Copy the internal integration secret. Keep it private.
10. Open the page `VPPS Fee Read-only Mirror Hub`.
11. Click the three dots in the top-right corner.
12. Click `Connections`.
13. Search for `VPPS Fee Sync`.
14. Select it and confirm access.
15. Copy the page ID from the Hub page URL. This is `NOTION_HUB_PAGE_ID`.

If the Hub page does not exist yet, create a normal Notion page named
`VPPS Fee Read-only Mirror Hub`, then share it with the integration.

## Supabase Secrets

Run these from the project folder, replacing only the placeholder values:

```powershell
npx supabase secrets set NOTION_API_KEY="secret_from_notion"
npx supabase secrets set NOTION_HUB_PAGE_ID="notion_hub_page_id"
npx supabase secrets set NOTION_SYNC_DEFAULT_SESSION="TEST-2026-27"
npx supabase secrets set NOTION_SYNC_DATABASE_URL="postgresql://notion_fee_sync_role:password@db.vgqyilgstjvgohrsiwkb.supabase.co:5432/postgres?sslmode=require"
npx supabase secrets set CRON_SHARED_SECRET="make_a_long_random_value"
```

The database password should be created in Supabase SQL Editor by a technical
helper:

```sql
alter role notion_fee_sync_role with login password 'replace_with_a_long_random_password';
```

For the daily schedule, also store these three values in Supabase Vault from SQL
Editor:

```sql
select vault.create_secret('https://vgqyilgstjvgohrsiwkb.supabase.co', 'VPPS_SUPABASE_PROJECT_URL');
select vault.create_secret('replace_with_supabase_anon_key', 'VPPS_SUPABASE_ANON_KEY');
select vault.create_secret('same_value_as_CRON_SHARED_SECRET', 'VPPS_NOTION_FEE_SYNC_CRON_SECRET');
```

Do not put these real values in GitHub, Notion notes, screenshots, or chat.

## Deploy

```powershell
npx supabase functions deploy notion-fee-sync
```

The migration creates the read-only views, the append-only `notion_sync_log`, and
the daily 06:30 IST schedule. The schedule is intentionally pointed at
`TEST-2026-27`.

## Safe Test Run

Start with dry-run. This reads the test session and writes only one sync log row.
It does not change Notion.

```powershell
npx supabase functions invoke notion-fee-sync --body '{"session":"TEST-2026-27","dry_run":true,"source":"manual"}'
```

If the dry-run looks correct, run the real test sync:

```powershell
npx supabase functions invoke notion-fee-sync --body '{"session":"TEST-2026-27","dry_run":false,"source":"manual"}'
```

Open Notion and check the two auto databases under `VPPS Fee Read-only Mirror Hub`.
Do not enter promise dates or follow-up decisions in Notion.

## Manual Refresh

Use this when the owner wants Notion refreshed outside the morning schedule:

```powershell
npx supabase functions invoke notion-fee-sync --body '{"session":"TEST-2026-27","dry_run":false,"source":"manual"}'
```

Do not use `2026-27` until the owner has checked the test output.

## Check The Sync Log

In Supabase SQL Editor:

```sql
select
  created_at,
  session_label,
  status,
  dry_run,
  students_synced,
  families_synced,
  daily_summaries_synced,
  tracker_rows_synced, -- retained for old log compatibility; expected to stay 0
  errors_count,
  error_detail
from public.notion_sync_log
order by created_at desc
limit 20;
```

## Owner Verification Checklist

Before trusting the live sync, compare these in `TEST-2026-27`:

1. Pick one test student and confirm `Total Pending` matches the app.
2. Pick one fully-paid test student and confirm pending is `0`.
3. Compare today's total collection in Notion with the app's Transactions page.
4. Compare one sibling family total with the related student rows.
5. Compare the defaulter count with the app's Defaulters page.
6. Confirm no one is using Notion for promise dates or recovery next actions.

## Switching To Live Later

Only after the owner confirms the test output:

1. Change the Edge Function default session:

```powershell
npx supabase secrets set NOTION_SYNC_DEFAULT_SESSION="2026-27"
```

2. Ask a technical helper to update the pg_cron schedule body from
   `TEST-2026-27` to `2026-27`.
3. Run one manual live sync.
4. Compare the five checklist items again against the real app.

Never test with fake payments or fake students in the live `2026-27` session.
