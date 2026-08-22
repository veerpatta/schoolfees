-- `v_whatsapp_run_outcomes` reads `receipts` and `whatsapp_reminder_sends`.
--
-- Created 40 minutes earlier in 20260822090000 without `security_invoker`, which
-- means it would run with its OWNER's privileges and RLS on the base tables
-- would simply not be consulted — anyone who can select the view sees every row
-- it can reach, whatever their own policies say. 25 of the 29 live plain views
-- here set it; this one should have.
--
-- A separate migration rather than an edit to the original, because 20260822090000
-- is already recorded in schema_migrations and editing it would not re-run.
-- `create or replace view` is idempotent, so a fresh environment applies both in
-- order and lands in the same place.

create or replace view public.v_whatsapp_run_outcomes
with (security_invoker = true) as
select
  run.id as run_id,
  run.campaign_id,
  run.session_label,
  run.campaign_name,
  run.situation,
  run.language,
  run.started_at,
  run.last_date,
  run.late_fee_phrase,
  count(*) filter (where s.status = 'sent') as messaged,
  count(*) filter (where s.status = 'failed') as failed,
  coalesce(sum(s.due_amount) filter (where s.status = 'sent'), 0) as money_quoted,
  count(*) filter (where s.status = 'sent' and coalesce(paid.amount_paid, 0) > 0)
    as families_paid,
  coalesce(sum(paid.amount_paid) filter (where s.status = 'sent'), 0)
    as money_collected
from public.whatsapp_campaign_runs run
left join public.whatsapp_reminder_sends s on s.run_id = run.id
left join lateral (
  select sum(r.total_amount) as amount_paid
  from public.receipts r
  where r.student_id = s.student_id
    and r.payment_date >= s.sent_on
    and (run.last_date is null or r.payment_date <= run.last_date)
    -- A discount close-out is not collection.
    and r.payment_mode <> 'discount'
    -- A fully reversed receipt never happened, as far as money is concerned.
    and not exists (
      select 1
      from public.v_receipt_reversal_totals rr
      where rr.receipt_id = r.id
        and rr.reversed_amount >= r.total_amount
    )
) paid on true
group by run.id;

comment on view public.v_whatsapp_run_outcomes is
  'Per run: who was messaged, and who paid between the send and the date the '
  'message asked for. Excludes discount close-outs and fully reversed receipts, '
  'matching the dashboard collection rule. This is correlation, not attribution.';

grant select on public.v_whatsapp_run_outcomes to authenticated;
