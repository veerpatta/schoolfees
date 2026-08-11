-- Per-instalment custom due dates.
--
-- The generated calendar (first date + monthly, month-end clamped) stays the
-- default and is almost always what a family agrees to. But real arrangements
-- bend around a harvest, a salary date or a wedding, and forcing those into an
-- even monthly rhythm meant the schedule on file was not the schedule the
-- office actually agreed. Activation and reschedule now accept an explicit
-- date per row.
--
-- Amounts are NOT overridable: the monthly amount and the final remainder are
-- what make the plan add up to the opening balance, and that invariant is
-- checked by student_repayment_plans_schedule_totals.

-- Dates must ascend with sequence_no. The status view walks the schedule by
-- sequence_no and treats the running total as the obligation to date; a row
-- dated before its predecessor would make "missed" and "catch up" nonsense.
-- Statement-level with a transition table so a whole schedule is judged once,
-- after every row of it has landed.
create or replace function private.enforce_repayment_schedule_order()
returns trigger
language plpgsql
set search_path to 'private', 'public', 'pg_temp'
as $function$
declare
  v_bad record;
begin
  select ordered.plan_id, ordered.sequence_no, ordered.due_date, ordered.prev_due
  into v_bad
  from (
    select
      sch.plan_id,
      sch.sequence_no,
      sch.due_date,
      lag(sch.due_date) over (partition by sch.plan_id order by sch.sequence_no) as prev_due
    from public.student_repayment_schedule sch
    where sch.plan_id in (select distinct nr.plan_id from new_rows nr)
  ) ordered
  where ordered.prev_due is not null and ordered.due_date <= ordered.prev_due
  limit 1;

  if v_bad.plan_id is not null then
    raise exception
      'EMI due dates must move forward: instalment % is dated % but the one before it is dated %.',
      v_bad.sequence_no, v_bad.due_date, v_bad.prev_due;
  end if;

  return null;
end;
$function$;

drop trigger if exists student_repayment_schedule_dates_ascend on public.student_repayment_schedule;
create trigger student_repayment_schedule_dates_ascend
  after insert on public.student_repayment_schedule
  referencing new table as new_rows
  for each statement execute function private.enforce_repayment_schedule_order();


-- Activation with optional explicit dates.
create or replace function public.create_student_repayment_plan(
  p_student_id uuid,
  p_session_label text,
  p_scope text,
  p_monthly_amount integer,
  p_first_due_date date,
  p_reason text,
  p_expected_opening_balance integer,
  p_client_request_id uuid default null,
  p_supersedes_plan_id uuid default null,
  -- One date per instalment, in order. NULL keeps the generated monthly
  -- calendar. Length must equal the derived term.
  p_due_dates date[] default null
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
  v_first_due date;
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

  v_first_due := coalesce(p_due_dates[1], p_first_due_date);

  if v_first_due is null then
    raise exception 'First EMI due date is required.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_student_id::text, 0));

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

  if p_due_dates is not null and array_length(p_due_dates, 1) is distinct from v_term then
    raise exception
      'This plan needs % instalment dates but % were supplied.',
      v_term, coalesce(array_length(p_due_dates, 1), 0);
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
    v_opening, p_monthly_amount, v_first_due,
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
    select * from private.repayment_plan_schedule(v_first_due, p_monthly_amount, v_opening)
  loop
    insert into public.student_repayment_schedule (
      plan_id, student_id, sequence_no, due_date, amount
    )
    values (
      v_plan_id, p_student_id, v_schedule.sequence_no,
      coalesce(p_due_dates[v_schedule.sequence_no], v_schedule.due_date),
      v_schedule.amount
    );
  end loop;

  return v_plan_id;
end;
$function$;


-- Reschedule with the same option.
create or replace function public.reschedule_student_repayment_plan(
  p_plan_id uuid,
  p_monthly_amount integer,
  p_first_due_date date,
  p_reason text,
  p_expected_remaining_balance integer default null,
  p_client_request_id uuid default null,
  p_due_dates date[] default null
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
  v_first_due date;
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

  v_first_due := coalesce(p_due_dates[1], p_first_due_date);

  if v_first_due is null then
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

  v_remaining := private.repayment_plan_remaining(p_plan_id);

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

  if p_due_dates is not null and array_length(p_due_dates, 1) is distinct from v_term then
    raise exception
      'This plan needs % instalment dates but % were supplied.',
      v_term, coalesce(array_length(p_due_dates, 1), 0);
  end if;

  v_final := v_remaining - p_monthly_amount * (v_term - 1);

  select nullif(btrim(coalesce(u.full_name, '')), '')
  into v_actor_label
  from public.users u
  where u.id = auth.uid();

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
    v_remaining, p_monthly_amount, v_first_due,
    v_term::smallint, v_final, 0,
    v_reason, 'active', p_plan_id,
    auth.uid(), v_actor_label
  );

  for v_item in
    select
      i.installment_id,
      i.installment_no,
      i.installment_label,
      i.due_date,
      i.is_carry_forward,
      snap.base_charge,
      greatest(snap.pending_amount - snap.final_late_fee, 0)::integer as base_pending
    from public.student_repayment_plan_items i
    join lateral private.workbook_installment_snapshot(
      v_old.student_id, (now() at time zone 'Asia/Kolkata')::date, true
    ) snap on snap.installment_id = i.installment_id
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
    select * from private.repayment_plan_schedule(v_first_due, p_monthly_amount, v_remaining)
  loop
    insert into public.student_repayment_schedule (
      plan_id, student_id, sequence_no, due_date, amount
    )
    values (
      v_new_plan_id, v_old.student_id, v_schedule.sequence_no,
      coalesce(p_due_dates[v_schedule.sequence_no], v_schedule.due_date),
      v_schedule.amount
    );
  end loop;

  return v_new_plan_id;
end;
$function$;

grant execute on function public.create_student_repayment_plan(uuid, text, text, integer, date, text, integer, uuid, uuid, date[]) to authenticated;
grant execute on function public.create_student_repayment_plan(uuid, text, text, integer, date, text, integer, uuid, uuid, date[]) to service_role;
grant execute on function public.reschedule_student_repayment_plan(uuid, integer, date, text, integer, uuid, date[]) to authenticated;
grant execute on function public.reschedule_student_repayment_plan(uuid, integer, date, text, integer, uuid, date[]) to service_role;

-- The old 9-arg / 6-arg signatures would otherwise linger and be picked by
-- PostgREST for calls that omit the new parameter.
drop function if exists public.create_student_repayment_plan(uuid, text, text, integer, date, text, integer, uuid, uuid);
drop function if exists public.reschedule_student_repayment_plan(uuid, integer, date, text, integer, uuid);
