-- Monthly EMI repayment plans — engine.
--
-- Helpers, the one shared status view, the four guarded RPCs, and the
-- plan-aware rewrite of post_student_payment_with_adjustments.
--
-- The public signature of post_student_payment_with_adjustments does not
-- change. Callers keep passing exactly what they pass today; the function
-- itself notices an active plan, allocates that plan's installments first, and
-- records the receipt link atomically.

-- ---------------------------------------------------------------------------
-- Schedule generation.
--
-- Keeps the day-of-month of the first due date, but never rolls past the end of
-- a shorter month: 31 Jan -> 28 Feb (29 in a leap year) -> 31 Mar. The final
-- row absorbs the remainder, so it is always <= monthly_amount.
-- ---------------------------------------------------------------------------

create or replace function private.repayment_plan_schedule(
  p_first_due_date date,
  p_monthly_amount integer,
  p_opening_balance integer
)
returns table (sequence_no smallint, due_date date, amount integer)
language sql
immutable
as $function$
  with term as (
    select greatest(
      ceil(p_opening_balance::numeric / nullif(p_monthly_amount, 0)::numeric)::integer,
      1
    ) as months
  )
  select
    n::smallint as sequence_no,
    least(
      (date_trunc('month', p_first_due_date::timestamp)::date + ((n - 1) || ' months')::interval)::date
        + (extract(day from p_first_due_date)::integer - 1),
      (date_trunc('month', p_first_due_date::timestamp)::date + (n || ' months')::interval)::date - 1
    ) as due_date,
    (case
      when n < (select months from term) then p_monthly_amount
      else p_opening_balance - p_monthly_amount * ((select months from term) - 1)
    end)::integer as amount
  from generate_series(1, (select months from term)) as n
  order by n;
$function$;


-- ---------------------------------------------------------------------------
-- Which installments a plan of a given scope would cover, priced live.
--
-- base_pending strips the late fee out of pending_amount. pending_amount is
-- `greatest(base + late - paid, 0)`, so subtracting the late fee and clamping
-- gives the base still owed in both the normal and the over-paid case.
-- ---------------------------------------------------------------------------

create or replace function private.repayment_plan_candidates(
  p_student_id uuid,
  p_session_label text,
  p_scope text,
  p_as_of date default current_date
)
returns table (
  installment_id uuid,
  installment_no smallint,
  installment_label text,
  due_date date,
  is_carry_forward boolean,
  base_charge integer,
  base_pending integer,
  charged_late_fee integer,
  late_fee_flat_amount integer
)
language sql
stable
set search_path to 'public', 'private', 'pg_temp'
as $function$
  select
    snap.installment_id,
    snap.installment_no,
    snap.installment_label,
    snap.due_date,
    coalesce(inst.is_carry_forward, false) as is_carry_forward,
    snap.base_charge,
    greatest(snap.pending_amount - snap.final_late_fee, 0)::integer as base_pending,
    greatest(least(snap.final_late_fee, snap.pending_amount), 0)::integer as charged_late_fee,
    coalesce(inst.late_fee_flat_amount, 0)::integer as late_fee_flat_amount
  from private.workbook_installment_snapshot(p_student_id, p_as_of, true) as snap
  join public.installments as inst on inst.id = snap.installment_id
  where snap.session_label = p_session_label
    and greatest(snap.pending_amount - snap.final_late_fee, 0) > 0
    and (
      p_scope = 'old_and_current'
      or (p_scope = 'old_balance_only' and coalesce(inst.is_carry_forward, false))
    )
  order by snap.due_date asc, snap.installment_no asc;
$function$;


-- ---------------------------------------------------------------------------
-- The one shared status view.
--
-- Student detail, Payment Desk, Dashboard, Defaulters, the student segments and
-- the exports all read THIS, so a family cannot be "behind" on one screen and
-- "on track" on another.
--
-- Lifecycle (active / cancelled / superseded) and payment standing (upcoming /
-- on_track / due / behind / completed) are separate axes and stay separate
-- columns. A cancelled plan still has a computable standing; the surfaces just
-- do not show it.
-- ---------------------------------------------------------------------------

create or replace view public.v_student_repayment_plan_status
with (security_invoker = true) as
with as_of_day as (
  select (now() at time zone 'Asia/Kolkata')::date as as_of
),
item_state as (
  select
    i.plan_id,
    count(*)::integer as item_count,
    coalesce(sum(greatest(coalesce(b.pending_amount, 0) - coalesce(b.final_late_fee, 0), 0)), 0)::integer
      as remaining_balance,
    count(*) filter (
      where coalesce(b.base_charge, i.snapshot_base_charge) is distinct from i.snapshot_base_charge
    )::integer as changed_item_count
  from public.student_repayment_plan_items i
  left join public.v_workbook_installment_balances b on b.installment_id = i.installment_id
  group by i.plan_id
),
plan_base as (
  select
    p.*,
    coalesce(s.item_count, 0) as item_count,
    coalesce(s.remaining_balance, 0) as remaining_balance,
    greatest(p.opening_balance - coalesce(s.remaining_balance, 0), 0) as paid_to_date,
    coalesce(s.changed_item_count, 0) as changed_item_count
  from public.student_repayment_plans p
  left join item_state s on s.plan_id = p.id
),
schedule_roll as (
  select
    sch.plan_id,
    sch.sequence_no,
    sch.due_date,
    sch.amount,
    sum(sch.amount) over (
      partition by sch.plan_id
      order by sch.sequence_no
      rows between unbounded preceding and current row
    )::integer as cumulative_amount
  from public.student_repayment_schedule sch
),
schedule_state as (
  select
    pb.id as plan_id,
    coalesce(sum(sr.amount) filter (where sr.due_date <= d.as_of), 0)::integer as expected_to_date,
    coalesce(sum(sr.amount) filter (where sr.due_date < d.as_of), 0)::integer as expected_overdue,
    -- A scheduled EMI counts as MISSED once its due date is strictly in the
    -- past and the money paid so far does not reach its running total.
    count(*) filter (where sr.due_date < d.as_of and sr.cumulative_amount > pb.paid_to_date)::integer
      as missed_installment_count,
    count(*) filter (where sr.cumulative_amount <= pb.paid_to_date)::integer as paid_installment_count,
    max(sr.due_date) as end_date
  from plan_base pb
  join schedule_roll sr on sr.plan_id = pb.id
  cross join as_of_day d
  -- paid_to_date has to be grouped explicitly: pb is a CTE, so Postgres cannot
  -- infer functional dependency on its id the way it would for a real table.
  group by pb.id, pb.paid_to_date
),
next_row as (
  select
    pb.id as plan_id,
    nxt.sequence_no,
    nxt.due_date,
    nxt.amount,
    nxt.cumulative_amount
  from plan_base pb
  join lateral (
    select sr.*
    from schedule_roll sr
    where sr.plan_id = pb.id
      and sr.cumulative_amount > pb.paid_to_date
    order by sr.sequence_no
    limit 1
  ) nxt on true
)
select
  pb.id as plan_id,
  pb.student_id,
  pb.session_label,
  pb.scope,
  pb.lifecycle,
  pb.opening_balance,
  pb.monthly_amount,
  pb.first_due_date,
  pb.term_months,
  pb.final_installment_amount,
  pb.waived_late_fee_total,
  pb.reason,
  pb.supersedes_plan_id,
  pb.superseded_by_plan_id,
  pb.activated_at,
  pb.activated_by,
  pb.activated_by_label,
  pb.cancelled_at,
  pb.cancellation_reason,
  pb.item_count,
  pb.remaining_balance,
  pb.paid_to_date,
  coalesce(ss.expected_to_date, 0) as expected_to_date,
  coalesce(ss.expected_overdue, 0) as expected_overdue,
  greatest(coalesce(ss.expected_to_date, 0) - pb.paid_to_date, 0)::integer as catch_up_amount,
  coalesce(ss.missed_installment_count, 0) as missed_installment_count,
  coalesce(ss.paid_installment_count, 0) as paid_installment_count,
  nr.sequence_no as next_due_sequence_no,
  nr.due_date as next_due_date,
  case
    when nr.plan_id is null then null
    else least(nr.amount, nr.cumulative_amount - pb.paid_to_date)::integer
  end as next_due_amount,
  ss.end_date,
  case
    when pb.remaining_balance <= 0 then 'completed'
    when d.as_of < pb.first_due_date then 'upcoming'
    when coalesce(ss.missed_installment_count, 0) > 0 then 'behind'
    when pb.paid_to_date < coalesce(ss.expected_to_date, 0) then 'due'
    else 'on_track'
  end as payment_status,
  -- "Plan review needed": either a covered charge moved under the plan's feet,
  -- or a NEW unpaid charge appeared inside the plan's scope that the family
  -- never agreed to. Neither silently changes the monthly amount.
  (
    pb.changed_item_count > 0
    or exists (
      select 1
      from public.v_workbook_installment_balances nb
      where nb.student_id = pb.student_id
        and nb.session_label = pb.session_label
        and greatest(nb.pending_amount - nb.final_late_fee, 0) > 0
        and (pb.scope = 'old_and_current' or nb.is_carry_forward)
        and not exists (
          select 1
          from public.student_repayment_plan_items ni
          where ni.plan_id = pb.id
            and ni.installment_id = nb.installment_id
        )
    )
  ) as plan_review_needed
from plan_base pb
cross join as_of_day d
left join schedule_state ss on ss.plan_id = pb.id
left join next_row nr on nr.plan_id = pb.id;

comment on view public.v_student_repayment_plan_status is
  'Single source of EMI plan standing. Every surface (Student, Payment Desk, Dashboard, Defaulters, Exports) reads this so statuses cannot disagree.';

grant select on table public.v_student_repayment_plan_status to authenticated;
grant select on table public.v_student_repayment_plan_status to service_role;


-- ---------------------------------------------------------------------------
-- Preview
--
-- Read-only. Returns exactly what activation would do, so the admin sees the
-- opening balance, the split, the late fees about to be forgiven, the term and
-- the full monthly calendar BEFORE committing. The opening balance it returns
-- is echoed back to create_student_repayment_plan, which refuses if the dues
-- moved in between.
-- ---------------------------------------------------------------------------

create or replace function public.preview_student_repayment_plan(
  p_student_id uuid,
  p_session_label text,
  p_scope text,
  p_monthly_amount integer default null,
  p_first_due_date date default null
)
returns jsonb
language plpgsql
stable
set search_path to 'public', 'private', 'pg_temp'
as $function$
declare
  v_opening integer;
  v_old integer;
  v_current integer;
  v_late integer;
  v_items jsonb;
  v_schedule jsonb;
  v_term integer;
  v_final integer;
  v_end date;
  v_errors text[] := array[]::text[];
  v_active_plan uuid;
begin
  if not public.has_permission('fees:repayment_plan') then
    raise exception 'You do not have permission to manage EMI repayment plans.';
  end if;

  if p_scope not in ('old_balance_only', 'old_and_current') then
    raise exception 'Unknown repayment plan scope: %.', p_scope;
  end if;

  select id into v_active_plan
  from public.student_repayment_plans
  where student_id = p_student_id and lifecycle = 'active'
  limit 1;

  select
    coalesce(sum(c.base_pending), 0)::integer,
    coalesce(sum(c.base_pending) filter (where c.is_carry_forward), 0)::integer,
    coalesce(sum(c.base_pending) filter (where not c.is_carry_forward), 0)::integer,
    coalesce(sum(c.charged_late_fee), 0)::integer,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'installmentId', c.installment_id,
          'installmentNo', c.installment_no,
          'installmentLabel', c.installment_label,
          'dueDate', c.due_date,
          'isCarryForward', c.is_carry_forward,
          'baseCharge', c.base_charge,
          'includedBaseBalance', c.base_pending,
          'chargedLateFee', c.charged_late_fee
        )
        order by c.due_date, c.installment_no
      ),
      '[]'::jsonb
    )
  into v_opening, v_old, v_current, v_late, v_items
  from private.repayment_plan_candidates(
    p_student_id,
    p_session_label,
    p_scope,
    (now() at time zone 'Asia/Kolkata')::date
  ) as c;

  if v_active_plan is not null then
    v_errors := v_errors || 'This student already has an active EMI plan. Reschedule or cancel it first.';
  end if;

  if v_opening <= 0 then
    v_errors := v_errors || case
      when p_scope = 'old_balance_only'
        then 'This student has no unpaid previous-year balance to convert.'
      else 'This student has no unpaid dues to convert.'
    end;
  end if;

  if p_monthly_amount is null or p_monthly_amount <= 0 then
    v_errors := v_errors || 'Enter a monthly EMI amount greater than 0.';
  elsif v_opening > 0 then
    v_term := greatest(ceil(v_opening::numeric / p_monthly_amount::numeric)::integer, 1);

    if v_term > 12 then
      v_errors := v_errors || format(
        'At Rs %s a month this plan needs %s months. The maximum term is 12 months — Rs %s a month or more clears it in time.',
        p_monthly_amount,
        v_term,
        ceil(v_opening::numeric / 12)::integer
      );
      v_term := null;
    end if;
  end if;

  if p_first_due_date is null then
    v_errors := v_errors || 'Choose the first EMI due date.';
  end if;

  if v_term is not null and p_first_due_date is not null then
    select
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'sequenceNo', s.sequence_no,
            'dueDate', s.due_date,
            'amount', s.amount
          )
          order by s.sequence_no
        ),
        '[]'::jsonb
      ),
      max(s.due_date),
      max(s.amount) filter (where s.sequence_no = v_term)
    into v_schedule, v_end, v_final
    from private.repayment_plan_schedule(p_first_due_date, p_monthly_amount, v_opening) as s;
  end if;

  return jsonb_build_object(
    'studentId', p_student_id,
    'sessionLabel', p_session_label,
    'scope', p_scope,
    'openingBalance', coalesce(v_opening, 0),
    'oldBalanceIncluded', coalesce(v_old, 0),
    'currentYearIncluded', coalesce(v_current, 0),
    'lateFeeWaived', coalesce(v_late, 0),
    'installmentCount', jsonb_array_length(coalesce(v_items, '[]'::jsonb)),
    'monthlyAmount', p_monthly_amount,
    'firstDueDate', p_first_due_date,
    'termMonths', v_term,
    'finalInstallmentAmount', v_final,
    'endDate', v_end,
    'items', coalesce(v_items, '[]'::jsonb),
    'schedule', coalesce(v_schedule, '[]'::jsonb),
    'hasActivePlan', v_active_plan is not null,
    'errors', to_jsonb(v_errors),
    'canActivate', array_length(v_errors, 1) is null
  );
end;
$function$;


-- ---------------------------------------------------------------------------
-- Activate
-- ---------------------------------------------------------------------------

create or replace function public.create_student_repayment_plan(
  p_student_id uuid,
  p_session_label text,
  p_scope text,
  p_monthly_amount integer,
  p_first_due_date date,
  p_reason text,
  p_expected_opening_balance integer,
  p_client_request_id uuid default null,
  p_supersedes_plan_id uuid default null
)
returns uuid
language plpgsql
set search_path to 'public', 'private', 'pg_temp'
as $function$
declare
  v_plan_id uuid;
  v_opening integer;
  v_late integer;
  v_term integer;
  v_final integer;
  v_actor_label text;
  v_reason text;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_candidates jsonb;
  v_candidate record;
  v_schedule record;
begin
  if not public.has_permission('fees:repayment_plan') then
    raise exception 'You do not have permission to manage EMI repayment plans.';
  end if;

  if p_scope not in ('old_balance_only', 'old_and_current') then
    raise exception 'Unknown repayment plan scope: %.', p_scope;
  end if;

  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  if v_reason is null or length(v_reason) < 4 then
    raise exception 'A reason of at least 4 characters is required to convert dues to EMI.';
  end if;

  if p_monthly_amount is null or p_monthly_amount <= 0 then
    raise exception 'Monthly EMI amount must be greater than 0.';
  end if;

  if p_first_due_date is null then
    raise exception 'First EMI due date is required.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_student_id::text, 0));

  -- Idempotency: a double-submit returns the plan the first submit created
  -- rather than failing on the one-active-plan index.
  if p_client_request_id is not null then
    select id into v_plan_id
    from public.student_repayment_plans
    where student_id = p_student_id
      and client_request_id = p_client_request_id
    limit 1;

    if v_plan_id is not null then
      return v_plan_id;
    end if;
  end if;

  if p_supersedes_plan_id is null
     and exists (
       select 1 from public.student_repayment_plans
       where student_id = p_student_id and lifecycle = 'active'
     )
  then
    raise exception 'This student already has an active EMI plan. Reschedule or cancel it first.';
  end if;

  -- Snapshot the candidates once into jsonb rather than a temp table, so a
  -- second call inside the same transaction cannot collide on the table name.
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'installment_id', c.installment_id,
          'installment_no', c.installment_no,
          'installment_label', c.installment_label,
          'due_date', c.due_date,
          'is_carry_forward', c.is_carry_forward,
          'base_charge', c.base_charge,
          'base_pending', c.base_pending,
          'charged_late_fee', c.charged_late_fee,
          'late_fee_flat_amount', c.late_fee_flat_amount
        )
        order by c.due_date, c.installment_no
      ),
      '[]'::jsonb
    ),
    coalesce(sum(c.base_pending), 0)::integer,
    coalesce(sum(c.charged_late_fee), 0)::integer
  into v_candidates, v_opening, v_late
  from private.repayment_plan_candidates(p_student_id, p_session_label, p_scope, v_today) as c;

  if v_opening <= 0 then
    raise exception 'This student has no unpaid dues in the selected scope.';
  end if;

  -- Stale-preview rejection. The admin agreed to a number; if the dues moved
  -- between preview and submit (a payment landed, Fee Setup republished), the
  -- plan is refused rather than quietly built on a different balance.
  if p_expected_opening_balance is not null and p_expected_opening_balance <> v_opening then
    raise exception
      'Dues changed while this plan was being set up (preview showed Rs %, now Rs %). Reload and review the new figures.',
      p_expected_opening_balance, v_opening;
  end if;

  v_term := greatest(ceil(v_opening::numeric / p_monthly_amount::numeric)::integer, 1);

  if v_term > 12 then
    raise exception
      'At Rs % a month this plan needs % months. The maximum term is 12 months.',
      p_monthly_amount, v_term;
  end if;

  v_final := v_opening - p_monthly_amount * (v_term - 1);

  select nullif(btrim(coalesce(u.full_name, '')), '')
  into v_actor_label
  from public.users u
  where u.id = auth.uid();

  insert into public.student_repayment_plans (
    student_id, session_label, scope,
    opening_balance, monthly_amount, first_due_date,
    term_months, final_installment_amount, waived_late_fee_total,
    reason, client_request_id, lifecycle, supersedes_plan_id,
    activated_by, activated_by_label
  )
  values (
    p_student_id, p_session_label, p_scope,
    v_opening, p_monthly_amount, p_first_due_date,
    v_term::smallint, v_final, v_late,
    v_reason, p_client_request_id, 'active', p_supersedes_plan_id,
    auth.uid(), v_actor_label
  )
  returning id into v_plan_id;

  for v_candidate in
    select *
    from jsonb_to_recordset(v_candidates) as c(
      installment_id uuid,
      installment_no smallint,
      installment_label text,
      due_date date,
      is_carry_forward boolean,
      base_charge integer,
      base_pending integer,
      charged_late_fee integer,
      late_fee_flat_amount integer
    )
  loop
    insert into public.student_repayment_plan_items (
      plan_id, student_id, installment_id,
      installment_no, installment_label, due_date, is_carry_forward,
      snapshot_base_charge, included_base_balance, waived_late_fee
    )
    values (
      v_plan_id, p_student_id, v_candidate.installment_id,
      v_candidate.installment_no, v_candidate.installment_label,
      v_candidate.due_date, v_candidate.is_carry_forward,
      v_candidate.base_charge, v_candidate.base_pending, v_candidate.charged_late_fee
    );

    -- Permanent late-fee waiver covering the row's FULL flat late fee, not just
    -- what is charged today. A plan installment whose due date has not passed
    -- yet would otherwise sprout a late fee mid-plan; waiving the flat amount
    -- up front means `waiver_applied = least(raw_late_fee, waived)` cancels it
    -- the moment it appears.
    if coalesce(v_candidate.late_fee_flat_amount, 0) > 0 then
      insert into public.student_late_fee_waivers (
        student_id, installment_id, session_label, amount, reason, source, waived_by, waived_by_label
      )
      values (
        p_student_id, v_candidate.installment_id, p_session_label,
        v_candidate.late_fee_flat_amount,
        format('EMI plan: late fee permanently waived on conversion to monthly EMI. %s', v_reason),
        'repayment_plan', auth.uid(), v_actor_label
      );
    end if;
  end loop;

  for v_schedule in
    select * from private.repayment_plan_schedule(p_first_due_date, p_monthly_amount, v_opening)
  loop
    insert into public.student_repayment_schedule (
      plan_id, student_id, sequence_no, due_date, amount
    )
    values (
      v_plan_id, p_student_id, v_schedule.sequence_no, v_schedule.due_date, v_schedule.amount
    );
  end loop;

  return v_plan_id;
end;
$function$;


-- ---------------------------------------------------------------------------
-- Reschedule — append-only. The old plan is retired and a REPLACEMENT is built
-- from what is still owed on the same underlying installments. Nothing about
-- the original agreement is edited, so the schedule a parent was shown last
-- month is still on file.
-- ---------------------------------------------------------------------------

create or replace function public.reschedule_student_repayment_plan(
  p_plan_id uuid,
  p_monthly_amount integer,
  p_first_due_date date,
  p_reason text,
  p_expected_remaining_balance integer default null,
  p_client_request_id uuid default null
)
returns uuid
language plpgsql
set search_path to 'public', 'private', 'pg_temp'
as $function$
declare
  v_old record;
  v_new_plan_id uuid := gen_random_uuid();
  v_remaining integer;
  v_term integer;
  v_final integer;
  v_reason text;
  v_actor_label text;
  v_item record;
  v_schedule record;
begin
  if not public.has_permission('fees:repayment_plan') then
    raise exception 'You do not have permission to manage EMI repayment plans.';
  end if;

  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  if v_reason is null or length(v_reason) < 4 then
    raise exception 'A reason of at least 4 characters is required to reschedule an EMI plan.';
  end if;

  if p_monthly_amount is null or p_monthly_amount <= 0 then
    raise exception 'Monthly EMI amount must be greater than 0.';
  end if;

  if p_first_due_date is null then
    raise exception 'First EMI due date is required.';
  end if;

  select * into v_old from public.student_repayment_plans where id = p_plan_id;

  if v_old.id is null then
    raise exception 'EMI plan not found.';
  end if;

  if v_old.lifecycle <> 'active' then
    raise exception 'Only an active EMI plan can be rescheduled (this one is %).', v_old.lifecycle;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_old.student_id::text, 0));

  -- What is still owed on the SAME underlying rows, priced live.
  select coalesce(sum(greatest(coalesce(b.pending_amount, 0) - coalesce(b.final_late_fee, 0), 0)), 0)::integer
  into v_remaining
  from public.student_repayment_plan_items i
  left join public.v_workbook_installment_balances b on b.installment_id = i.installment_id
  where i.plan_id = p_plan_id;

  if v_remaining <= 0 then
    raise exception 'This EMI plan is already cleared — there is nothing left to reschedule.';
  end if;

  if p_expected_remaining_balance is not null and p_expected_remaining_balance <> v_remaining then
    raise exception
      'The plan balance changed while this reschedule was being set up (showed Rs %, now Rs %). Reload and review.',
      p_expected_remaining_balance, v_remaining;
  end if;

  v_term := greatest(ceil(v_remaining::numeric / p_monthly_amount::numeric)::integer, 1);

  if v_term > 12 then
    raise exception
      'At Rs % a month this plan needs % months. The maximum term is 12 months.',
      p_monthly_amount, v_term;
  end if;

  v_final := v_remaining - p_monthly_amount * (v_term - 1);

  select nullif(btrim(coalesce(u.full_name, '')), '')
  into v_actor_label
  from public.users u
  where u.id = auth.uid();

  -- Retire first, then insert: one-active-plan-per-student is a partial unique
  -- index, and the forward reference is a deferred FK.
  update public.student_repayment_plans
  set lifecycle = 'superseded',
      superseded_by_plan_id = v_new_plan_id
  where id = p_plan_id;

  insert into public.student_repayment_plans (
    id, student_id, session_label, scope,
    opening_balance, monthly_amount, first_due_date,
    term_months, final_installment_amount, waived_late_fee_total,
    reason, lifecycle, supersedes_plan_id,
    activated_by, activated_by_label
  )
  values (
    v_new_plan_id, v_old.student_id, v_old.session_label, v_old.scope,
    v_remaining, p_monthly_amount, p_first_due_date,
    v_term::smallint, v_final, 0,
    v_reason, 'active', p_plan_id,
    auth.uid(), v_actor_label
  );

  -- Carry the same underlying rows across, re-snapshotted at today's figures.
  -- Rows already cleared are dropped: they are no longer part of the debt.
  for v_item in
    select
      i.installment_id,
      i.installment_no,
      i.installment_label,
      i.due_date,
      i.is_carry_forward,
      coalesce(b.base_charge, i.snapshot_base_charge) as base_charge,
      greatest(coalesce(b.pending_amount, 0) - coalesce(b.final_late_fee, 0), 0)::integer as base_pending
    from public.student_repayment_plan_items i
    left join public.v_workbook_installment_balances b on b.installment_id = i.installment_id
    where i.plan_id = p_plan_id
    order by i.due_date, i.installment_no
  loop
    if v_item.base_pending > 0 then
      insert into public.student_repayment_plan_items (
        plan_id, student_id, installment_id,
        installment_no, installment_label, due_date, is_carry_forward,
        snapshot_base_charge, included_base_balance, waived_late_fee
      )
      values (
        v_new_plan_id, v_old.student_id, v_item.installment_id,
        v_item.installment_no, v_item.installment_label, v_item.due_date, v_item.is_carry_forward,
        v_item.base_charge, v_item.base_pending, 0
      );
    end if;
  end loop;

  for v_schedule in
    select * from private.repayment_plan_schedule(p_first_due_date, p_monthly_amount, v_remaining)
  loop
    insert into public.student_repayment_schedule (
      plan_id, student_id, sequence_no, due_date, amount
    )
    values (
      v_new_plan_id, v_old.student_id, v_schedule.sequence_no, v_schedule.due_date, v_schedule.amount
    );
  end loop;

  return v_new_plan_id;
end;
$function$;


-- ---------------------------------------------------------------------------
-- Cancel
--
-- Restores ordinary due-date monitoring for whatever is left. The late-fee
-- waivers granted at activation are NOT reversed: the school forgave them, and
-- retroactively re-charging a family for a plan the school itself ended is not
-- a thing this app will do by accident.
-- ---------------------------------------------------------------------------

create or replace function public.cancel_student_repayment_plan(
  p_plan_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
set search_path to 'public', 'private', 'pg_temp'
as $function$
declare
  v_plan record;
  v_remaining integer;
  v_waived integer;
  v_reason text;
begin
  if not public.has_permission('fees:repayment_plan') then
    raise exception 'You do not have permission to manage EMI repayment plans.';
  end if;

  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  if v_reason is null or length(v_reason) < 4 then
    raise exception 'A reason of at least 4 characters is required to cancel an EMI plan.';
  end if;

  select * into v_plan from public.student_repayment_plans where id = p_plan_id;

  if v_plan.id is null then
    raise exception 'EMI plan not found.';
  end if;

  if v_plan.lifecycle <> 'active' then
    raise exception 'Only an active EMI plan can be cancelled (this one is %).', v_plan.lifecycle;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_plan.student_id::text, 0));

  select coalesce(sum(greatest(coalesce(b.pending_amount, 0) - coalesce(b.final_late_fee, 0), 0)), 0)::integer
  into v_remaining
  from public.student_repayment_plan_items i
  left join public.v_workbook_installment_balances b on b.installment_id = i.installment_id
  where i.plan_id = p_plan_id;

  select coalesce(sum(w.amount), 0)::integer
  into v_waived
  from public.student_late_fee_waivers w
  where w.student_id = v_plan.student_id
    and w.source = 'repayment_plan'
    and w.voided_at is null;

  update public.student_repayment_plans
  set lifecycle = 'cancelled',
      cancelled_at = now(),
      cancelled_by = auth.uid(),
      cancellation_reason = v_reason
  where id = p_plan_id;

  return jsonb_build_object(
    'planId', p_plan_id,
    'studentId', v_plan.student_id,
    'remainingBalance', v_remaining,
    'lateFeeWaiversKept', v_waived,
    'message', 'Plan cancelled. Remaining dues go back to their original due dates; the late fees already waived stay waived.'
  );
end;
$function$;


-- ---------------------------------------------------------------------------
-- Dashboard metrics
-- ---------------------------------------------------------------------------

create or replace function public.get_dashboard_repayment_summary(p_session_label text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'private', 'pg_temp'
as $function$
declare
  v_result jsonb;
begin
  -- SECURITY DEFINER so the aggregate does not depend on the caller's row
  -- visibility, which means the permission check has to be explicit.
  if coalesce(auth.role(), '') <> 'service_role'
     and not public.has_any_permission(array['dashboard:view', 'finance:view', 'defaulters:view'])
  then
    raise exception 'You do not have permission to read EMI plan metrics.';
  end if;

  with scoped as (
    select v.*, s.full_name, s.admission_no
    from public.v_student_repayment_plan_status v
    join public.students s on s.id = v.student_id
    where v.lifecycle = 'active'
      and v.session_label = p_session_label
  ),
  month_window as (
    select
      date_trunc('month', (now() at time zone 'Asia/Kolkata')::date)::date as month_start,
      (date_trunc('month', (now() at time zone 'Asia/Kolkata')::date) + interval '1 month')::date as next_month_start
  ),
  expected_this_month as (
    select coalesce(sum(sch.amount), 0)::integer as expected
    from public.student_repayment_schedule sch
    join scoped on scoped.plan_id = sch.plan_id
    cross join month_window w
    where sch.due_date >= w.month_start and sch.due_date < w.next_month_start
  ),
  collected_this_month as (
    select coalesce(sum(link.contribution_amount), 0)::integer as collected
    from public.student_repayment_receipt_links link
    join scoped on scoped.plan_id = link.plan_id
    join public.receipts r on r.id = link.receipt_id
    cross join month_window w
    where r.payment_date >= w.month_start and r.payment_date < w.next_month_start
  ),
  priority as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'studentId', p.student_id,
          'planId', p.plan_id,
          'studentName', p.full_name,
          'admissionNo', p.admission_no,
          'paymentStatus', p.payment_status,
          'missedInstallmentCount', p.missed_installment_count,
          'catchUpAmount', p.catch_up_amount,
          'remainingBalance', p.remaining_balance,
          'nextDueDate', p.next_due_date
        )
        order by p.missed_installment_count desc, p.catch_up_amount desc, p.remaining_balance desc
      ),
      '[]'::jsonb
    ) as students
    from (
      select * from scoped
      where payment_status in ('due', 'behind')
      order by missed_installment_count desc, catch_up_amount desc, remaining_balance desc
      limit 8
    ) p
  )
  select jsonb_build_object(
    'sessionLabel',       p_session_label,
    'activePlans',        (select count(*) from scoped),
    'onTrack',            (select count(*) from scoped where payment_status in ('on_track', 'upcoming')),
    'dueNow',             (select count(*) from scoped where payment_status = 'due'),
    'missed',             (select count(*) from scoped where payment_status = 'behind'),
    'completed',          (select count(*) from scoped where payment_status = 'completed'),
    'planReviewNeeded',   (select count(*) from scoped where plan_review_needed),
    'openingBalanceTotal',(select coalesce(sum(opening_balance), 0)::integer from scoped),
    'remainingTotal',     (select coalesce(sum(remaining_balance), 0)::integer from scoped),
    'catchUpTotal',       (select coalesce(sum(catch_up_amount), 0)::integer from scoped),
    'expectedThisMonth',  (select expected from expected_this_month),
    'collectedThisMonth', (select collected from collected_this_month),
    'topPriorityStudents',(select students from priority)
  )
  into v_result;

  return v_result;
end;
$function$;

grant execute on function public.preview_student_repayment_plan(uuid, text, text, integer, date) to authenticated;
grant execute on function public.preview_student_repayment_plan(uuid, text, text, integer, date) to service_role;
grant execute on function public.create_student_repayment_plan(uuid, text, text, integer, date, text, integer, uuid, uuid) to authenticated;
grant execute on function public.create_student_repayment_plan(uuid, text, text, integer, date, text, integer, uuid, uuid) to service_role;
grant execute on function public.reschedule_student_repayment_plan(uuid, integer, date, text, integer, uuid) to authenticated;
grant execute on function public.reschedule_student_repayment_plan(uuid, integer, date, text, integer, uuid) to service_role;
grant execute on function public.cancel_student_repayment_plan(uuid, text) to authenticated;
grant execute on function public.cancel_student_repayment_plan(uuid, text) to service_role;
grant execute on function public.get_dashboard_repayment_summary(text) to authenticated;
grant execute on function public.get_dashboard_repayment_summary(text) to service_role;

revoke execute on function public.preview_student_repayment_plan(uuid, text, text, integer, date) from public;
revoke execute on function public.create_student_repayment_plan(uuid, text, text, integer, date, text, integer, uuid, uuid) from public;
revoke execute on function public.reschedule_student_repayment_plan(uuid, integer, date, text, integer, uuid) from public;
revoke execute on function public.cancel_student_repayment_plan(uuid, text) from public;
revoke execute on function public.get_dashboard_repayment_summary(text) from public;


-- ---------------------------------------------------------------------------
-- Payment posting, now plan-aware.
--
-- Signature unchanged. Three behavioural changes, all inside:
--
--   1. Installments covered by an ACTIVE plan are allocated FIRST, oldest due
--      date first, before anything the plan does not cover. Excess spills into
--      the remaining dues automatically — one receipt, one payment, no split
--      entry for the cashier.
--   2. Quick discount and quick late-fee waiver are refused while a plan is
--      active. Changing what a family owes under an agreed plan is a
--      rescheduling decision, not a counter decision.
--   3. The receipt's contribution to the plan is recorded in
--      student_repayment_receipt_links in the same transaction.
--
-- Advisory locking, idempotency, receipt-number retry, immutable receipts and
-- the pending_before/after snapshots on public.payments are untouched.
-- ---------------------------------------------------------------------------

create or replace function public.post_student_payment_with_adjustments(
  p_student_id uuid,
  p_payment_date date,
  p_payment_mode payment_mode,
  p_total_amount integer,
  p_reference_number text default null::text,
  p_remarks text default null::text,
  p_received_by text default null::text,
  p_receipt_prefix text default 'SVP'::text,
  p_client_request_id uuid default null::uuid,
  p_quick_discount_amount integer default 0,
  p_quick_late_fee_waiver_amount integer default 0
)
returns table (receipt_id uuid, receipt_number text, allocated_total integer)
language plpgsql
set search_path to 'public'
as $function$
declare
  balance_row record;
  v_payment_allocation integer;
  v_discount_allocation integer;
  v_waiver_allocation integer;
  v_remaining_payment integer;
  v_remaining_discount integer;
  v_remaining_waiver integer;
  v_daily_sequence integer;
  v_candidate_receipt_number text;
  v_candidate_receipt_id uuid;
  v_existing_receipt_number text;
  v_existing_total_amount integer;
  v_total_pending integer;
  v_revised_pending integer;
  v_normalized_prefix text;
  v_pending_after integer;
  v_receipt_notes text;
  v_workbook_snapshot jsonb;
  v_plan_id uuid;
  v_plan_balance_before integer := 0;
  v_plan_contribution integer := 0;
begin
  if not public.has_permission('payments:write') then
    raise exception 'You do not have permission to post payments.';
  end if;

  if p_total_amount is null or p_total_amount <= 0 then
    raise exception 'Payment amount must be greater than 0.';
  end if;

  v_remaining_discount := greatest(coalesce(p_quick_discount_amount, 0), 0);
  v_remaining_waiver := greatest(coalesce(p_quick_late_fee_waiver_amount, 0), 0);
  v_remaining_payment := p_total_amount;
  v_receipt_notes := nullif(trim(coalesce(p_remarks, '')), '');

  perform pg_advisory_xact_lock(hashtextextended(p_student_id::text, 0));

  if p_client_request_id is not null then
    select r.id, r.receipt_number, r.total_amount
    into v_candidate_receipt_id, v_existing_receipt_number, v_existing_total_amount
    from public.receipts as r
    where r.student_id = p_student_id
      and r.client_request_id = p_client_request_id
    order by r.created_at desc
    limit 1;

    if v_candidate_receipt_id is not null then
      return query select v_candidate_receipt_id, v_existing_receipt_number, v_existing_total_amount;
      return;
    end if;
  end if;

  select p.id into v_plan_id
  from public.student_repayment_plans as p
  where p.student_id = p_student_id
    and p.lifecycle = 'active'
  limit 1;

  if v_plan_id is not null and (v_remaining_discount > 0 or v_remaining_waiver > 0) then
    raise exception
      'This student is on an EMI plan. Discounts and late-fee waivers cannot be applied at the counter — reschedule the plan instead.';
  end if;

  -- Plan installments sort first (plan_priority 0), then everything else, and
  -- within each group oldest due date first. This is the only change to how a
  -- payment lands.
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'installment_id', snapshot_row.installment_id,
        'pending_amount', snapshot_row.pending_amount,
        'due_date', snapshot_row.due_date,
        'installment_no', snapshot_row.installment_no,
        'plan_priority', case when plan_item.installment_id is null then 1 else 0 end
      )
      order by
        case when plan_item.installment_id is null then 1 else 0 end asc,
        snapshot_row.due_date asc,
        snapshot_row.installment_no asc
    ),
    '[]'::jsonb
  )
  into v_workbook_snapshot
  from private.workbook_installment_snapshot(p_student_id, p_payment_date, true) as snapshot_row
  left join public.student_repayment_plan_items as plan_item
    on plan_item.installment_id = snapshot_row.installment_id
    and plan_item.plan_id = v_plan_id;

  select coalesce(sum(snapshot.pending_amount), 0)
  into v_total_pending
  from jsonb_to_recordset(v_workbook_snapshot) as snapshot(
    installment_id uuid,
    pending_amount integer,
    due_date date,
    installment_no smallint,
    plan_priority integer
  )
  where snapshot.pending_amount > 0;

  if v_plan_id is not null then
    select coalesce(sum(snapshot.pending_amount), 0)
    into v_plan_balance_before
    from jsonb_to_recordset(v_workbook_snapshot) as snapshot(
      installment_id uuid,
      pending_amount integer,
      due_date date,
      installment_no smallint,
      plan_priority integer
    )
    where snapshot.pending_amount > 0
      and snapshot.plan_priority = 0;
  end if;

  v_revised_pending := v_total_pending - v_remaining_discount - v_remaining_waiver;

  if v_total_pending <= 0 then
    raise exception 'No pending dues are available for this student.';
  end if;

  if v_revised_pending <= 0 then
    raise exception 'No payable dues found after discount and late fee waiver.';
  end if;

  if p_total_amount > v_revised_pending then
    raise exception 'Payment amount cannot exceed revised payable amount.';
  end if;

  v_normalized_prefix := coalesce(nullif(trim(coalesce(p_receipt_prefix, '')), ''), 'SVP');

  select coalesce(max((regexp_match(receipt_row.receipt_number, '-([0-9]{4})$'))[1]::integer), 0)
  into v_daily_sequence
  from public.receipts as receipt_row
  where receipt_row.receipt_number like v_normalized_prefix || to_char(p_payment_date, 'YYYYMMDD') || '-%';

  for _attempt in 1..12 loop
    v_daily_sequence := v_daily_sequence + 1;
    v_candidate_receipt_number := v_normalized_prefix || to_char(p_payment_date, 'YYYYMMDD') || '-' || lpad(v_daily_sequence::text, 4, '0');

    begin
      insert into public.receipts (
        receipt_number, student_id, payment_date, payment_mode, total_amount,
        reference_number, notes, received_by, client_request_id
      )
      values (
        v_candidate_receipt_number, p_student_id, p_payment_date, p_payment_mode, p_total_amount,
        nullif(trim(coalesce(p_reference_number, '')), ''),
        v_receipt_notes,
        nullif(trim(coalesce(p_received_by, '')), ''),
        p_client_request_id
      )
      returning id into v_candidate_receipt_id;
      exit;
    exception when unique_violation then
      if p_client_request_id is not null then
        select r.id, r.receipt_number, r.total_amount
        into v_candidate_receipt_id, v_existing_receipt_number, v_existing_total_amount
        from public.receipts as r
        where r.student_id = p_student_id
          and r.client_request_id = p_client_request_id
        order by r.created_at desc
        limit 1;

        if v_candidate_receipt_id is not null then
          return query
          select v_candidate_receipt_id, v_existing_receipt_number, v_existing_total_amount;
          return;
        end if;
      end if;
      continue;
    end;
  end loop;

  if v_candidate_receipt_id is null then
    raise exception 'Unable to generate a unique receipt number. Please retry.';
  end if;

  for balance_row in
    select snapshot.installment_id, snapshot.pending_amount, snapshot.due_date,
           snapshot.installment_no, snapshot.plan_priority
    from jsonb_to_recordset(v_workbook_snapshot) as snapshot(
      installment_id uuid,
      pending_amount integer,
      due_date date,
      installment_no smallint,
      plan_priority integer
    )
    where snapshot.pending_amount > 0
    order by snapshot.plan_priority asc, snapshot.due_date asc, snapshot.installment_no asc
  loop
    exit when v_remaining_payment <= 0 and v_remaining_discount <= 0 and v_remaining_waiver <= 0;

    v_discount_allocation := least(v_remaining_discount, balance_row.pending_amount);
    v_waiver_allocation := least(v_remaining_waiver, balance_row.pending_amount - v_discount_allocation);
    v_payment_allocation := least(v_remaining_payment, balance_row.pending_amount - v_discount_allocation - v_waiver_allocation);

    if v_discount_allocation > 0 then
      insert into public.receipt_adjustments (
        receipt_id, student_id, installment_id, adjustment_type, amount_delta, reason, notes
      )
      values (
        v_candidate_receipt_id, p_student_id, balance_row.installment_id, 'discount',
        v_discount_allocation, 'Payment Desk quick discount', null
      );
      v_remaining_discount := v_remaining_discount - v_discount_allocation;
    end if;

    if v_waiver_allocation > 0 then
      insert into public.receipt_adjustments (
        receipt_id, student_id, installment_id, adjustment_type, amount_delta, reason, notes
      )
      values (
        v_candidate_receipt_id, p_student_id, balance_row.installment_id, 'writeoff',
        v_waiver_allocation, 'Payment Desk late fee waiver', null
      );
      v_remaining_waiver := v_remaining_waiver - v_waiver_allocation;
    end if;

    if v_payment_allocation > 0 then
      v_pending_after := balance_row.pending_amount
        - v_discount_allocation - v_waiver_allocation - v_payment_allocation;
      insert into public.payments (
        receipt_id, student_id, installment_id, amount, notes,
        discount_applied_at_posting, waiver_applied_at_posting,
        pending_before_posting, pending_after_posting
      )
      values (
        v_candidate_receipt_id, p_student_id, balance_row.installment_id, v_payment_allocation,
        null,
        v_discount_allocation, v_waiver_allocation,
        balance_row.pending_amount, v_pending_after
      );
      v_remaining_payment := v_remaining_payment - v_payment_allocation;

      if balance_row.plan_priority = 0 then
        v_plan_contribution := v_plan_contribution + v_payment_allocation;
      end if;
    end if;
  end loop;

  if v_remaining_payment <> 0 or v_remaining_discount <> 0 or v_remaining_waiver <> 0 then
    raise exception 'Unable to allocate payment and concessions cleanly. Please retry.';
  end if;

  if v_plan_id is not null then
    insert into public.student_repayment_receipt_links (
      plan_id, student_id, receipt_id,
      contribution_amount, spillover_amount,
      plan_balance_before, plan_balance_after
    )
    values (
      v_plan_id, p_student_id, v_candidate_receipt_id,
      v_plan_contribution, p_total_amount - v_plan_contribution,
      v_plan_balance_before, v_plan_balance_before - v_plan_contribution
    );
  end if;

  return query select v_candidate_receipt_id, v_candidate_receipt_number, p_total_amount;
end;
$function$;
