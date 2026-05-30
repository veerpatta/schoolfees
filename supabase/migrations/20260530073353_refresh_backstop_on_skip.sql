-- Refresh backstop: self-heal materialized views when the synchronous refresh
-- is skipped under write contention.
--
-- trigger_refresh_financial_views() refreshes the three workbook materialized
-- views CONCURRENTLY inline on every payment/receipt/installment write, with a
-- 2s lock_timeout. Under a busy counter (concurrent postings) that refresh can
-- hit lock_not_available and be skipped — previously with nothing to catch it,
-- so dashboards/defaulters/exports could drift until the next non-contended
-- write. The workbook_materialized_view_refresh_queue + the 2-min
-- `refresh-workbook-materialized-views` pg_cron already exist but were dead
-- because nothing marked the queue pending.
--
-- This makes a skipped refresh mark the queue pending so the existing 2-min
-- cron (refresh_workbook_materialized_views_if_requested) re-refreshes and
-- clears it. Happy path stays instant; worst-case catch-up is <=2 min.
-- CREATE OR REPLACE keeps every existing trigger bound to this function.

create or replace function public.trigger_refresh_financial_views()
returns trigger
language plpgsql
security definer
as $function$
begin
  perform set_config('lock_timeout', '2s', true);

  begin
    perform public.refresh_financial_materialized_views(true);
  exception
    when lock_not_available then
      -- Contended: defer to the 2-min cron backstop instead of dropping it.
      update public.workbook_materialized_view_refresh_queue
        set pending = true,
            requested_at = now(),
            request_count = coalesce(request_count, 0) + 1
      where queue_key = 'workbook';
    when others then
      update public.workbook_materialized_view_refresh_queue
        set pending = true,
            requested_at = now(),
            request_count = coalesce(request_count, 0) + 1
      where queue_key = 'workbook';
      raise warning 'financial mat-view refresh deferred to 2-min backstop: %', sqlerrm;
  end;

  return null;
end;
$function$;
