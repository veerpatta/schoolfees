-- Reschedule and cancel must price the plan from LIVE dues, not the matview.
--
-- v_workbook_installment_balances is materialized and refreshes asynchronously
-- after a payment. Rescheduling off it built the replacement plan on the
-- pre-payment balance — a family who had just paid Rs 4,000 would have been
-- re-committed to the full original amount. Both functions now read
-- private.workbook_installment_snapshot, which computes from base tables.
--
-- The shared status VIEW deliberately stays on the matview: it feeds the same
-- read surfaces as every other financial number in the app and must not
-- re-derive the whole ledger on each dashboard render.

create or replace function private.repayment_plan_remaining(p_plan_id uuid)
returns integer
language sql
stable
set search_path to 'public', 'private', 'pg_temp'
as $function$
  select coalesce(
    sum(greatest(snap.pending_amount - snap.final_late_fee, 0)),
    0
  )::integer
  from public.student_repayment_plans p
  join public.student_repayment_plan_items i on i.plan_id = p.id
  join lateral private.workbook_installment_snapshot(
    p.student_id,
    (now() at time zone 'Asia/Kolkata')::date,
    true
  ) snap on snap.installment_id = i.installment_id
  where p.id = p_plan_id;
$function$;

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
    v_remaining, p_monthly_amount, p_first_due_date,
    v_term::smallint, v_final, 0,
    v_reason, 'active', p_plan_id,
    auth.uid(), v_actor_label
  );

  -- Carry the same underlying rows across, re-snapshotted live. Rows already
  -- cleared are dropped: they are no longer part of the debt.
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

  v_remaining := private.repayment_plan_remaining(p_plan_id);

  select coalesce(sum(w.amount), 0)::integer
  into v_waived
  from public.student_late_fee_waivers w
  join public.student_repayment_plan_items i
    on i.installment_id = w.installment_id
   and i.plan_id = p_plan_id
  where w.source = 'repayment_plan'
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
