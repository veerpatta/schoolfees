-- The nightly job could never have run.
--
-- pg_cron executes as `postgres` with no request context, so `auth.role()` is
-- null and `has_permission()` returns false. The guard therefore raised
-- 'You do not have permission...' on every fire. The old release-based job
-- carried the identical guard and had never actually run once (empty
-- cron.job_run_details), so the failure was invisible: no charge, no alert.
--
-- Distinguish "called through the API without permission" from "called with no
-- API request at all". PostgREST always populates request.jwt.claims, even for
-- anon; an empty setting means the call arrived over a direct database
-- connection, which already implies credentials far beyond this function.
do $$
declare
  v_src text;
  v_new text;
  v_anchor constant text :=
    E'  if coalesce(auth.role(), \'\') <> \'service_role\'\n'
    '     and not public.has_permission(\'fees:repayment_plan\')';
  v_replacement constant text :=
    E'  if coalesce(auth.role(), \'\') <> \'service_role\'\n'
    '     and coalesce(current_setting(\'request.jwt.claims\', true), \'\') <> \'\'\n'
    '     and not public.has_permission(\'fees:repayment_plan\')';
begin
  select pg_get_functiondef('public.sync_repayment_plan_late_fees(text,boolean,date)'::regprocedure)
    into v_src;

  if position('request.jwt.claims' in v_src) > 0 then
    return;  -- replay is a no-op
  end if;

  if position(v_anchor in v_src) = 0 then
    raise exception 'sync_repayment_plan_late_fees: permission guard anchor not found';
  end if;

  v_new := replace(v_src, v_anchor, v_replacement);
  execute v_new;
end $$;

do $$
begin
  if position('request.jwt.claims' in pg_get_functiondef(
       'public.sync_repayment_plan_late_fees(text,boolean,date)'::regprocedure)) = 0
  then
    raise exception 'cron guard patch did not apply';
  end if;
end $$;

-- The job charges now; it does not release anything.
select cron.unschedule('release-emi-late-fees-daily');
select cron.schedule(
  'charge-emi-late-fees-daily',
  '50 18 * * *',
  $cron$ select public.sync_repayment_plan_late_fees(); $cron$
);
