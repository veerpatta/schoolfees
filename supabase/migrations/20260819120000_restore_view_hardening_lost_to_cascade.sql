-- Restore the view hardening that two later CASCADE rebuilds silently undid.
--
-- What happened, in order:
--
--   20260718090711  hardened five v_notion_* views: security_invoker = true,
--                   and revoked anon + authenticated so only notion_fee_sync_role
--                   and service_role could read them.
--   20260807120000  dropped the financial view stack with CASCADE and recreated
--                   three of those five with `create view ... as`. That statement
--                   does not carry reloptions, so security_invoker was lost. The
--                   two views the cascade did not reach still have it today, which
--                   is what makes this a regression rather than a decision.
--   20260812120000  restored "grants and comments the cascade took with it" — but
--                   restored the PRE-hardening grant list, handing anon and
--                   authenticated back `all` on those same three views.
--
-- The result, verified against production on 2026-08-19: an unauthenticated
-- caller holding the publishable key (which ships in the browser bundle by
-- design) could select 614 rows of v_workbook_student_financials, 2,426 rows of
-- v_workbook_installment_balances, and 583 rows of v_notion_student_fee_summary
-- — the last carrying student name, both parents' names, phone numbers and date
-- of birth alongside the fee figures.
--
-- Ten relations are reachable that way. They are exactly the relations RLS
-- cannot defend:
--   * three materialized views — a matview cannot carry RLS or security_invoker
--     at all, so the grant is the only control there is;
--   * seven plain views without security_invoker, which therefore read their
--     base tables as the view owner and never consult a policy.
-- No table is affected: every table in public has RLS enabled, which is why the
-- ordinary Supabase anon grants on them are safe and are left alone.

begin;

-- ---------------------------------------------------------------------------
-- 1. anon has no business reading any of this.
-- ---------------------------------------------------------------------------
-- Nothing in the product reads as anon. The app talks to Postgres as
-- `authenticated` (lib/supabase/server.ts) or as the service role; the public
-- receipt-verification page /r/[code] uses the admin client; and the MCP Worker
-- reads with the service-role key and touches the publishable key only against
-- /auth/v1 for sign-in. So this revoke closes the hole without changing a single
-- authenticated read.
revoke all on
  public.v_workbook_student_financials,
  public.v_workbook_installment_balances,
  public.v_student_financial_state,
  public.v_student_carry_forward_balances,
  public.v_student_directory,
  public.v_student_installment_facets,
  public.v_student_repayment_plan_status,
  public.v_notion_student_fee_summary,
  public.v_notion_family_fee_summary,
  public.v_notion_daily_collection_summary
from anon;

-- ---------------------------------------------------------------------------
-- 2. Re-apply the Notion hardening 20260718090711 established.
-- ---------------------------------------------------------------------------
-- These five views exist for one consumer: the notion-fee-sync Edge Function,
-- which connects as notion_fee_sync_role over its own Postgres URL. Nothing in
-- app/, lib/, components/ or workers/ references them — the only occurrences in
-- the tree are in supabase/functions/notion-fee-sync/index.ts. So authenticated
-- staff never needed them either.
--
-- security_invoker is safe for the sync role specifically because
-- 20260718090711 also gave it SELECT grants and `using (true)` select policies
-- on all thirteen base tables these views read. Its rows do not change; the
-- difference is that everyone else's now do.
alter view public.v_notion_student_fee_summary      set (security_invoker = true);
alter view public.v_notion_family_fee_summary       set (security_invoker = true);
alter view public.v_notion_daily_collection_summary set (security_invoker = true);
-- The other two kept theirs through the cascade; stated here so this migration
-- describes the whole intended end state rather than only the drifted half.
alter view public.v_notion_student_fee_sync         set (security_invoker = true);
alter view public.v_notion_daily_summary            set (security_invoker = true);

revoke all on
  public.v_notion_student_fee_summary,
  public.v_notion_family_fee_summary,
  public.v_notion_daily_collection_summary,
  public.v_notion_student_fee_sync,
  public.v_notion_daily_summary
from authenticated;

-- Re-grant the two roles that do read them, so this file states the whole
-- access list rather than only what it takes away.
grant select on
  public.v_notion_student_fee_summary,
  public.v_notion_family_fee_summary,
  public.v_notion_daily_collection_summary,
  public.v_notion_student_fee_sync,
  public.v_notion_daily_summary
to notion_fee_sync_role, service_role;

comment on view public.v_notion_student_fee_summary is
  'Notion read-only mirror projection. security_invoker = true and readable only by notion_fee_sync_role and service_role. A CASCADE rebuild (20260807120000) dropped the invoker flag and 20260812120000 re-granted anon/authenticated; 20260819120000 restored both. Recreating this view with `create view` drops reloptions again — re-apply the option in the same migration.';
comment on view public.v_notion_family_fee_summary is
  'Notion read-only mirror projection. security_invoker = true and readable only by notion_fee_sync_role and service_role. See the comment on v_notion_student_fee_summary for the cascade history.';
comment on view public.v_notion_daily_collection_summary is
  'Notion read-only mirror projection. security_invoker = true and readable only by notion_fee_sync_role and service_role. See the comment on v_notion_student_fee_summary for the cascade history.';

-- ---------------------------------------------------------------------------
-- 3. What this migration deliberately does NOT do.
-- ---------------------------------------------------------------------------
-- The four v_student_* views above keep running as their owner for authenticated
-- staff. Setting security_invoker on them is the better posture and is worth
-- doing, but it is not a no-op: docs/maps/database-map.md records that
-- student_fee_overrides carries narrower RLS than students, so a teacher reading
-- through an invoker view gets a NULL join and a confidently wrong number rather
-- than an error. That needs its own migration, with the per-role read checks to
-- go with it. Removing anon is the part that is both urgent and safe.
--
-- The three materialized views cannot be fixed this way at all. A matview has no
-- RLS and no security_invoker, so `authenticated` reading one always sees every
-- row; role scoping for those lives in the app layer (requireStaffPermission)
-- and in the MCP Worker's own scope rules. Worth knowing, unchanged here.

commit;
