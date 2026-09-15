-- Job records are reachable when the app runs in test mode.
--
-- `APP_MODE=test` points every Supabase client at the `test` schema
-- (getSupabaseSchemaForAppMode in src/platform/env.ts). Without this, runJob()
-- looks for `job_runs` there, does not find it, and correctly refuses to run —
-- "Invalid schema: test". That is the contract behaving properly, but the
-- outcome is that no job works at all on a test-mode deployment.
--
-- The test schema already has two shapes and this follows the second one.
-- Mutable per-session data (students, payments, receipts, installments) exists
-- as physical copies, so test work cannot touch live rows. Shared catalogue and
-- reference data (academic_sessions, users, app_settings, fee_policy_configs)
-- is a read-through view onto public, so there is one copy of the truth.
--
-- `job_runs` and `backup_runs` are the second kind. "Did the nightly backup run"
-- is a fact about the deployment, not about a session, and splitting it per
-- app mode would mean a test-mode deployment quietly keeping its own private
-- answer to a question the school asks of the system as a whole.
--
-- A `select *` view over a single table with no aggregate is auto-updatable, so
-- the runner's insert and update pass straight through to public.
--
-- Additive only, and does nothing at all where the test schema is absent.

begin;

do $$
begin
  if to_regnamespace('test') is null then
    raise notice 'No test schema here; nothing to expose.';
    return;
  end if;

  execute $view$
    create or replace view test.job_runs
    with (security_invoker = true)
    as select * from public.job_runs;
  $view$;

  execute $view$
    create or replace view test.backup_runs
    with (security_invoker = true)
    as select * from public.backup_runs;
  $view$;

  -- Same shape as the public tables: admins read through RLS on the base table
  -- (security_invoker keeps the caller's policies in force), the service role
  -- writes.
  execute 'grant select on test.job_runs to authenticated, service_role';
  execute 'grant select on test.backup_runs to authenticated, service_role';
  execute 'grant insert, update on test.job_runs to service_role';
  execute 'grant insert on test.backup_runs to service_role';
end $$;

commit;
