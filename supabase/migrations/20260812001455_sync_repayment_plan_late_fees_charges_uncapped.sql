-- Rewrite the nightly job: charge, don't release.
--
-- For each active plan, walk the agreed calendar. A schedule row is missed when
-- its due date has passed and the running total through that row exceeds what
-- the family has actually paid into the plan. Every missed EMI gets its own
-- Rs1,000 — no cap, and it works identically for a previous-year-only plan,
-- which the old mechanism could never charge at all.
--
-- Backing installments take the first free number in the 101-199 band for that
-- (student, class). NOT 100 + sequence_no as first sketched: a reschedule mints
-- a new plan whose EMI 1 could also be missed, and 101 would already be taken
-- by the retired plan's EMI 1, so the insert would fail on the
-- (student_id, class_id, installment_no) unique index. Real installments use
-- 1-4 and carry-forward uses 99, so the band is free.
drop function if exists public.sync_repayment_plan_late_fees(text, boolean);

create function public.sync_repayment_plan_late_fees(
  p_session_label text default null,
  p_dry_run boolean default false,
  p_as_of date default null
)
returns table (
  plan_id uuid,
  student_id uuid,
  missed_emis integer,
  already_charged integer,
  charged_now integer,
  charged_amount integer
)
language plpgsql
security definer
set search_path to 'public', 'private', 'pg_temp'
as $function$
declare
  v_flat constant integer := 1000;
  v_today date := coalesce(p_as_of, (now() at time zone 'Asia/Kolkata')::date);
  v_plan record;
  v_emi record;
  v_missed integer;
  v_already integer;
  v_charged integer;
  v_class_id uuid;
  v_fee_setting_id uuid;
  v_installment_no smallint;
  v_installment_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not public.has_permission('fees:repayment_plan')
  then
    raise exception 'You do not have permission to charge EMI late fees.';
  end if;

  for v_plan in
    select p.id as pid, p.student_id as sid, p.session_label as slabel,
           coalesce(v.paid_to_date, 0) as paid
    from public.student_repayment_plans p
    join public.v_student_repayment_plan_status v on v.plan_id = p.id
    where p.lifecycle = 'active'
      and (p_session_label is null or p.session_label = p_session_label)
  loop
    -- Every covered installment belongs to the same student; take the class and
    -- fee setting from one of them so the synthetic row hangs off real config.
    select i.class_id, i.fee_setting_id
      into v_class_id, v_fee_setting_id
    from public.student_repayment_plan_items it
    join public.installments i on i.id = it.installment_id
    where it.plan_id = v_plan.pid
    order by i.installment_no desc
    limit 1;

    if v_class_id is null then
      continue;  -- a plan with no items cannot be priced; leave it alone
    end if;

    v_missed := 0;
    v_already := 0;
    v_charged := 0;

    for v_emi in
      select s.sequence_no, s.due_date,
             sum(s.amount) over (order by s.sequence_no
                                 rows between unbounded preceding and current row) as running_total
      from public.student_repayment_schedule s
      where s.plan_id = v_plan.pid
      order by s.sequence_no
    loop
      -- Missed: the due date has passed and the money owed by this point in the
      -- calendar has not arrived.
      if v_emi.due_date >= v_today or v_emi.running_total <= v_plan.paid then
        continue;
      end if;

      v_missed := v_missed + 1;

      if exists (
        select 1 from public.student_repayment_emi_late_fees f
        where f.plan_id = v_plan.pid and f.sequence_no = v_emi.sequence_no
      ) then
        v_already := v_already + 1;
        continue;
      end if;

      if p_dry_run then
        v_charged := v_charged + 1;
        continue;
      end if;

      select n into v_installment_no
      from generate_series(101, 199) as n
      where not exists (
        select 1 from public.installments i
        where i.student_id = v_plan.sid
          and i.class_id = v_class_id
          and i.installment_no = n
      )
      order by n
      limit 1;

      if v_installment_no is null then
        raise exception 'No free EMI late-fee installment number for student %', v_plan.sid;
      end if;

      insert into public.installments (
        student_id, class_id, fee_setting_id, installment_no, installment_label,
        due_date, base_amount, transport_amount, discount_amount, amount_due,
        late_fee_flat_amount, status, is_emi_late_fee, notes
      )
      values (
        v_plan.sid, v_class_id, v_fee_setting_id, v_installment_no,
        format('EMI %s late fee (%s)', v_emi.sequence_no,
               to_char(v_emi.due_date, 'DD-MM-YYYY')),
        v_emi.due_date, 0, 0, 0, 0,
        v_flat, 'scheduled', true,
        format('Monthly EMI %s was not paid by %s. Flat late fee.',
               v_emi.sequence_no, to_char(v_emi.due_date, 'DD-MM-YYYY'))
      )
      returning id into v_installment_id;

      insert into public.student_repayment_emi_late_fees (
        plan_id, student_id, session_label, sequence_no, emi_due_date,
        amount, backing_installment_id
      )
      values (
        v_plan.pid, v_plan.sid, v_plan.slabel, v_emi.sequence_no, v_emi.due_date,
        v_flat, v_installment_id
      );

      v_charged := v_charged + 1;
    end loop;

    if v_missed > 0 then
      plan_id := v_plan.pid;
      student_id := v_plan.sid;
      missed_emis := v_missed;
      already_charged := v_already;
      charged_now := v_charged;
      charged_amount := v_charged * v_flat;
      return next;
    end if;
  end loop;

  return;
end;
$function$;

revoke execute on function public.sync_repayment_plan_late_fees(text, boolean, date) from public;
grant execute on function public.sync_repayment_plan_late_fees(text, boolean, date) to authenticated;
grant execute on function public.sync_repayment_plan_late_fees(text, boolean, date) to service_role;
