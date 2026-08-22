-- Saved reminder campaigns, the runs they produce, and what those runs collected.
--
-- The send log already IS the cohort record: `whatsapp_reminder_sends` holds one
-- row per family per notice per day, with the amount quoted and the params as
-- sent. 142 rows for the single run that has happened. What was missing is only
-- a grouping key and a record of what the run WAS — so this is two small tables
-- and one nullable column, not a new subsystem.
--
-- Shape follows `promotion_runs` (20260525135507): a run table with denormalised
-- counts. RLS follows `whatsapp_reminder_sends` (20260820140000): staff read,
-- service-role writes, no insert policy at all.

-- ---------------------------------------------------------------- the definition
-- Editable in place, because it is intent rather than a financial record. What
-- actually went out is snapshotted on the run.
create table if not exists public.whatsapp_campaigns (
  id uuid primary key default gen_random_uuid(),
  session_label text not null,
  name text not null,
  situation text not null check (situation in ('fee_due', 'balance', 'prevyear')),
  language text not null check (language in ('hi', 'en')),
  -- The ReminderFilters snapshot, so re-running rebuilds the same audience rule
  -- against today's ledger rather than yesterday's list.
  filters jsonb not null default '{}'::jsonb,
  last_date date,
  late_fee_amount integer not null default 0 check (late_fee_amount >= 0),
  late_fee_basis text not null default 'per_installment'
    check (late_fee_basis in ('per_installment', 'per_day', 'flat', 'none')),
  archived_at timestamptz,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_label, name)
);

comment on table public.whatsapp_campaigns is
  'A saved, re-runnable reminder definition: which notice, in which language, to '
  'whom, by when, with what late fee. The audience is NEVER stored — only the '
  'filter rule — so a family who pays drops out of the next run for free.';

comment on column public.whatsapp_campaigns.late_fee_amount is
  'What the MESSAGE says a late payment costs. Deliberately not the ledger''s late '
  'fee: this is a lever for getting fees in on time, and the app does not charge '
  'it. The screen warns when the two disagree rather than refusing to send.';

comment on column public.whatsapp_campaigns.created_by is
  'Not a foreign key to auth.users, matching whatsapp_reminder_sends.sent_by — '
  'removing a staff account must not delete the record of what was sent.';

create index if not exists whatsapp_campaigns_session_idx
  on public.whatsapp_campaigns (session_label, archived_at nulls first, name);

-- --------------------------------------------------------------------- one press
-- Immutable once finished. `filters` and `late_fee_phrase` are snapshotted here
-- rather than read back through the campaign, because the campaign is editable
-- and what went out is not.
create table if not exists public.whatsapp_campaign_runs (
  id uuid primary key default gen_random_uuid(),
  -- set null, never cascade: deleting a saved campaign must not destroy the
  -- evidence that parents were messaged.
  campaign_id uuid references public.whatsapp_campaigns(id) on delete set null,
  session_label text not null,
  campaign_name text not null,
  situation text not null,
  language text not null,
  filters jsonb not null default '{}'::jsonb,
  last_date date,
  late_fee_phrase text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  started_by uuid,
  selected_count integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  already_count integer not null default 0,
  money_quoted bigint not null default 0,
  created_at timestamptz not null default now()
);

comment on table public.whatsapp_campaign_runs is
  'One press of Send. The counts are denormalised because sendRemindersAction '
  'already computes them and used to throw them away.';

comment on column public.whatsapp_campaign_runs.late_fee_phrase is
  'Exactly what slot 7 carried, as text. The composed phrase, not the amount and '
  'basis it came from — a later change to the campaign must not rewrite history.';

create index if not exists whatsapp_campaign_runs_session_idx
  on public.whatsapp_campaign_runs (session_label, started_at desc);
create index if not exists whatsapp_campaign_runs_campaign_idx
  on public.whatsapp_campaign_runs (campaign_id, started_at desc);

-- ------------------------------------------------------------- the grouping key
-- Nullable on purpose. The 142 rows already logged belong to no run and are NOT
-- backfilled: inventing a run nobody pressed would be a lie in the record.
alter table public.whatsapp_reminder_sends
  add column if not exists run_id uuid
    references public.whatsapp_campaign_runs(id) on delete set null;

comment on column public.whatsapp_reminder_sends.run_id is
  'Which press of Send produced this row. Null for anything sent before runs were '
  'recorded. DELIBERATELY NOT part of the unique index: '
  '(student_id, session_label, sent_on, campaign_name) is what stops a family '
  'being sent the same notice twice in one day, and adding run_id would let a '
  'second run that same day message everyone again.';

create index if not exists whatsapp_reminder_sends_run_idx
  on public.whatsapp_reminder_sends (run_id);

-- ------------------------------------------------------------------ did it work
-- A view, not a materialized one: a handful of runs a month over hundreds of
-- rows. A matview would add a refresh path to forget, and this schema already
-- works around one two-minute staleness window.
--
-- "Paid after the reminder", never "because of it". Payments here are spiky —
-- 17 Aug posted 107 families in one batch against 2-9 on a normal day, which is
-- counter cash entered in bulk. This view cannot tell that apart from a response
-- and does not pretend to.
-- One lateral per send row. A run is one campaign on one day, and the unique
-- index guarantees at most one send per student in it, so there is nothing to
-- de-duplicate and no way to double-count.
create or replace view public.v_whatsapp_run_outcomes as
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

-- -------------------------------------------------------------------------- RLS
-- Staff read from the screen. Writes go through the service role in a server
-- action, which bypasses RLS — there is deliberately no insert or update policy,
-- so nothing running in a browser can fabricate a record of a campaign run.
--
-- `(select auth.role())` rather than the bare call: the bare one is re-evaluated
-- per row, the auth_rls_initplan pattern 20260527090443 swept out everywhere.
alter table public.whatsapp_campaigns enable row level security;
alter table public.whatsapp_campaign_runs enable row level security;

drop policy if exists "whatsapp_campaigns: staff read" on public.whatsapp_campaigns;
create policy "whatsapp_campaigns: staff read"
  on public.whatsapp_campaigns for select
  using ((select auth.role()) = 'authenticated');

drop policy if exists "whatsapp_campaign_runs: staff read" on public.whatsapp_campaign_runs;
create policy "whatsapp_campaign_runs: staff read"
  on public.whatsapp_campaign_runs for select
  using ((select auth.role()) = 'authenticated');

grant select on public.whatsapp_campaigns to authenticated;
grant select on public.whatsapp_campaign_runs to authenticated;
grant select on public.v_whatsapp_run_outcomes to authenticated;
