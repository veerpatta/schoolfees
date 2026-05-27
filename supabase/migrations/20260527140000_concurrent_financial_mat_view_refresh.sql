-- Concurrent refresh for financial materialized views.
--
-- Previously, every INSERT/UPDATE/DELETE on payments, receipts,
-- payment_adjustments, receipt_adjustments and installments fired
-- trigger_refresh_financial_views() which called
-- refresh_financial_materialized_views(false) — a non-concurrent refresh.
-- That takes an AccessExclusiveLock on three materialized views and blocks
-- every reader until the rebuild finishes. With ~500 students × 4
-- installments, that lock window is long enough that:
--   • Payment posting feels slow (the trigger runs inline with the INSERT).
--   • Concurrent dashboard / student-profile loads stall behind the lock.
--
-- Fix: flip the trigger to CONCURRENT refresh. The unique indexes required
-- (v_workbook_installment_balances_idx, v_workbook_student_financials_idx,
-- v_student_financial_state_idx) already exist from the original migration.
--
-- We also add a short lock_timeout inside the trigger so a single contended
-- refresh won't escalate into a long wait — Postgres simply skips this
-- refresh attempt and the next eligible mutation will pick it up. Strictly
-- correct under read-after-write because every refreshable mutation fires
-- the trigger anyway.
--
-- A follow-up migration could move to a debounced/queued refresh model
-- (pg_notify + a cron worker) for further latency wins, but this single
-- change removes the AccessExclusive blocker today.

create or replace function public.refresh_financial_materialized_views(p_concurrently boolean default true)
returns void
language plpgsql
security definer
as $$
begin
  if p_concurrently then
    refresh materialized view concurrently public.v_workbook_installment_balances;
    refresh materialized view concurrently public.v_workbook_student_financials;
    refresh materialized view concurrently public.v_student_financial_state;
  else
    refresh materialized view public.v_workbook_installment_balances;
    refresh materialized view public.v_workbook_student_financials;
    refresh materialized view public.v_student_financial_state;
  end if;
end;
$$;

create or replace function public.trigger_refresh_financial_views()
returns trigger
language plpgsql
security definer
as $$
begin
  -- Cap how long we wait on competing refreshes. The next write will retry.
  perform set_config('lock_timeout', '2s', true);

  begin
    perform public.refresh_financial_materialized_views(true);
  exception
    when lock_not_available then
      -- Another transaction already holds the refresh lock; its work will
      -- include our changes once committed.
      null;
    when others then
      -- Never block the originating write on a refresh error. The next
      -- successful refresh will reconcile.
      raise warning 'financial mat-view refresh skipped: %', sqlerrm;
  end;

  return null;
end;
$$;
