-- Did the message actually arrive?
--
-- `submitted_message_id` is an acceptance receipt from AiSensy, not proof a
-- parent's phone lit up. The Basic plan has no delivery webhooks — that is the
-- Pro "Project API" — so until the plan changes the only source of truth is the
-- campaign report CSV an admin downloads from the AiSensy dashboard.
--
-- These columns hold whichever source answered, so the run page can stop saying
-- "messaged" when it means "submitted".

alter table public.whatsapp_reminder_sends
  add column if not exists delivery_status text,
  add column if not exists delivered_at timestamptz,
  add column if not exists read_at timestamptz,
  -- How many times this row has been attempted. A retry UPDATES the row rather
  -- than inserting a second one, so without a counter the record would say a
  -- family was messaged once when they were messaged three times.
  add column if not exists attempts integer not null default 1,
  add column if not exists last_error text,
  add column if not exists last_attempt_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.whatsapp_reminder_sends'::regclass
      and conname = 'whatsapp_reminder_sends_delivery_status_check'
  ) then
    alter table public.whatsapp_reminder_sends
      add constraint whatsapp_reminder_sends_delivery_status_check
      check (
        delivery_status is null
        or delivery_status in ('submitted', 'delivered', 'read', 'failed')
      );
  end if;
end $$;

comment on column public.whatsapp_reminder_sends.delivery_status is
  'What the PROVIDER says happened, as opposed to `status`, which is what this '
  'app did. Null until a delivery report is imported or a webhook arrives — and '
  'null is the honest answer, not a failure. '
  'Only ever written to rows whose `status` is ''sent'': a `covered_by_sibling` '
  'row shares its sibling''s provider_message_id, and writing a delivery result '
  'to both would count one delivered message twice on the screen the office '
  'trusts.';

comment on column public.whatsapp_reminder_sends.attempts is
  'Starts at 1 for the initial claim. A retry updates this row in place — never '
  'inserts a second — so the unique index still holds and the send history does '
  'not grow a duplicate every time a number is re-tried.';

comment on column public.whatsapp_reminder_sends.last_error is
  'The most recent provider error, kept separately from `error_message` so a '
  'successful retry can clear the row''s failure without erasing what went wrong '
  'the first time.';

-- Counting delivered / read per run, which the run page does on every load.
create index if not exists whatsapp_reminder_sends_delivery_idx
  on public.whatsapp_reminder_sends (run_id, delivery_status)
  where delivery_status is not null;

-- "Seen but not paid": rows read more than N days ago. Partial, because
-- `read_at` is null for almost every row.
create index if not exists whatsapp_reminder_sends_read_idx
  on public.whatsapp_reminder_sends (read_at)
  where read_at is not null;

-- ------------------------------------------------------------ run outcomes

-- The view gains delivery counts, run provenance and days-to-pay.
--
-- Columns are APPENDED, never inserted mid-list. `create or replace view` cannot
-- reorder or rename an existing column — it fails with "cannot change name of
-- view column" — and the alternative, dropping and recreating, would silently
-- lose the `security_invoker = true` that 20260822093000 exists to add and the
-- grant beneath it. RLS on the base tables would stop being consulted and
-- nothing would fail. So: append, and keep both lines below.
--
-- Every delivery count is DISTINCT on provider_message_id. Siblings on one phone
-- share the id of the single message that went to it, so a plain count reports a
-- family of three as three delivered — on the exact screen the office uses to
-- decide whether reminders are working.
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
    as money_collected,
  run.source,
  run.scheduled_for,
  count(*) filter (where s.status = 'covered_by_sibling') as covered_by_sibling,
  count(distinct s.provider_message_id) filter (
    where s.status = 'sent' and s.delivery_status = 'delivered'
  ) as delivered,
  count(distinct s.provider_message_id) filter (
    where s.status = 'sent' and s.delivery_status = 'read'
  ) as read_count,
  count(distinct s.provider_message_id) filter (
    where s.status = 'sent' and s.delivery_status = 'failed'
  ) as delivery_failed,
  array_remove(
    array_agg(paid.days_to_pay) filter (where s.status = 'sent'),
    null
  ) as days_to_pay
from public.whatsapp_campaign_runs run
left join public.whatsapp_reminder_sends s on s.run_id = run.id
left join lateral (
  select
    sum(r.total_amount) as amount_paid,
    min(r.payment_date - s.sent_on) as days_to_pay
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
  'Per run: who was messaged, whether it arrived, and who paid between the send '
  'and the date the message asked for. Delivery counts are DISTINCT on '
  'provider_message_id, because siblings on one phone share the id of the one '
  'message that went to it. Excludes discount close-outs and fully reversed '
  'receipts, matching the dashboard collection rule. '
  'This is correlation, not attribution.';

grant select on public.v_whatsapp_run_outcomes to authenticated;
