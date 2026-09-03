-- The only way to know whether a reminder CAUSED a payment.
--
-- `v_whatsapp_run_outcomes` has always said "paid after this reminder", never
-- "because of it", and the screen says so too. That honesty has a cost: nobody
-- can tell whether the reminders are working. Payments here are spiky — 17
-- August posted 107 families in one day against 2-9 on a normal day, which is
-- counter cash entered in a batch — and no join can tell that apart from a
-- response.
--
-- A random holdout can. Some families are deliberately NOT messaged, and the
-- difference in what they pay is the answer.
--
-- It is off by default and admin-only, because it means deliberately not chasing
-- money the school is owed. That is a real cost, paid to learn something real,
-- and it should be a decision somebody makes on purpose rather than a default.

create table if not exists public.whatsapp_run_holdouts (
  run_id uuid not null references public.whatsapp_campaign_runs(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (run_id, student_id)
);

comment on table public.whatsapp_run_holdouts is
  'Families deliberately NOT messaged in a run, so the run can be compared '
  'against a control. No message was sent and none is owed to them — this is '
  'the record of a decision not to send, which is why it is a table rather than '
  'an absence. '
  'ON DELETE CASCADE on run_id, unlike whatsapp_reminder_sends: a send row is '
  'evidence a parent WAS messaged and must outlive its run, while a holdout row '
  'is only meaningful next to the run it was held out of.';

create index if not exists whatsapp_run_holdouts_student_idx
  on public.whatsapp_run_holdouts (student_id);

alter table public.whatsapp_run_holdouts enable row level security;

-- Staff read, service-role writes, no insert policy from the browser — the same
-- shape as whatsapp_reminder_sends. `(select auth.role())` rather than the bare
-- call, per the auth_rls_initplan sweep in 20260527090443.
create policy "whatsapp_run_holdouts: staff read"
  on public.whatsapp_run_holdouts for select
  using ((select auth.role()) = 'authenticated');

-- How the holdout actually performed, next to how the messaged group did.
--
-- A plain view, like the outcomes it sits beside: a handful of runs a month.
create or replace view public.v_whatsapp_run_holdout_outcomes
with (security_invoker = true) as
select
  h.run_id,
  count(*) as held_out,
  count(*) filter (where coalesce(paid.amount_paid, 0) > 0) as held_out_paid,
  coalesce(sum(paid.amount_paid), 0) as held_out_collected
from public.whatsapp_run_holdouts h
join public.whatsapp_campaign_runs run on run.id = h.run_id
left join lateral (
  select sum(r.total_amount) as amount_paid
  from public.receipts r
  where r.student_id = h.student_id
    -- The same window the messaged group is measured over, or the comparison
    -- is between two different questions.
    and r.payment_date >= run.started_at::date
    and (run.last_date is null or r.payment_date <= run.last_date)
    and r.payment_mode <> 'discount'
    and not exists (
      select 1
      from public.v_receipt_reversal_totals rr
      where rr.receipt_id = r.id
        and rr.reversed_amount >= r.total_amount
    )
) paid on true
group by h.run_id;

comment on view public.v_whatsapp_run_holdout_outcomes is
  'What the families who were NOT messaged did, over exactly the window the '
  'messaged group is measured over. The difference between this and '
  'v_whatsapp_run_outcomes is the only causal number this system produces.';

grant select on public.v_whatsapp_run_holdout_outcomes to authenticated;
