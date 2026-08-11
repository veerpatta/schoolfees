-- Two defects found testing the first cut against real fixtures.
--
-- 1. It released waivers on installments NOT yet past their own due date.
--    Nothing is charged today, but the release is permanent — so months later,
--    when that installment finally comes due, a late fee fires for a month the
--    family may long since have caught up on. A release must correspond to a
--    charge that lands now.
--
-- 2. It counted a release as done even when a pre-existing grandfather or
--    manual waiver still covered the same installment. Those stand on their
--    own merits — the school forgave that fee for its own reasons — so
--    releasing the plan waiver underneath charges nobody, and the plan
--    silently "used up" a release.
--
-- Both fixed by only considering installments where releasing genuinely bites:
-- past due, carrying a flat late fee, and not already covered by a waiver from
-- another source.
--
-- KNOWN LIMIT, by design: carry-forward (previous-year) installments carry a
-- flat late fee of 0 — the school's existing rule that old balances do not
-- accrue late fees. So an `old_balance_only` plan has nothing to release and
-- this rule never bites on it. `capped` reports when a family has missed more
-- months than there are late fees left to release.
drop function if exists public.sync_repayment_plan_late_fees(text, boolean);

create function public.sync_repayment_plan_late_fees(
  p_session_label text default null,
  p_dry_run boolean default false
)
returns table (
  plan_id uuid,
  student_id uuid,
  missed_instalments integer,
  already_released integer,
  released_now integer,
  releasable_remaining integer,
  capped boolean
)
language plpgsql
security definer
set search_path to 'public', 'private', 'pg_temp'
as $function$
declare
  v_plan record;
  v_waiver record;
  v_missed integer;
  v_already integer;
  v_to_release integer;
  v_released integer;
  v_releasable integer;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not public.has_permission('fees:repayment_plan')
  then
    raise exception 'You do not have permission to release EMI late fees.';
  end if;

  for v_plan in
    select v.plan_id as pid, v.student_id as sid, v.missed_installment_count as missed
    from public.v_student_repayment_plan_status v
    where v.lifecycle = 'active'
      and v.missed_installment_count > 0
      and (p_session_label is null or v.session_label = p_session_label)
  loop
    v_missed := v_plan.missed;

    select count(*)::integer into v_already
    from public.student_late_fee_waivers w
    join public.student_repayment_plan_items i
      on i.installment_id = w.installment_id and i.plan_id = v_plan.pid
    where w.source = 'repayment_plan' and w.voided_at is not null;

    v_to_release := greatest(v_missed - v_already, 0);

    select count(*)::integer into v_releasable
    from public.student_late_fee_waivers w
    join public.student_repayment_plan_items i
      on i.installment_id = w.installment_id and i.plan_id = v_plan.pid
    join public.installments inst on inst.id = w.installment_id
    where w.source = 'repayment_plan'
      and w.voided_at is null
      and inst.due_date < (now() at time zone 'Asia/Kolkata')::date
      and coalesce(inst.late_fee_flat_amount, 0) > 0
      and coalesce((
        select sum(other.amount)
        from public.student_late_fee_waivers other
        where other.installment_id = w.installment_id
          and other.voided_at is null
          and other.source <> 'repayment_plan'
      ), 0) < coalesce(inst.late_fee_flat_amount, 0);

    v_released := 0;

    if v_to_release > 0 and not p_dry_run then
      for v_waiver in
        select w.id as wid
        from public.student_late_fee_waivers w
        join public.student_repayment_plan_items i
          on i.installment_id = w.installment_id and i.plan_id = v_plan.pid
        join public.installments inst on inst.id = w.installment_id
        where w.source = 'repayment_plan'
          and w.voided_at is null
          and inst.due_date < (now() at time zone 'Asia/Kolkata')::date
          and coalesce(inst.late_fee_flat_amount, 0) > 0
          and coalesce((
            select sum(other.amount)
            from public.student_late_fee_waivers other
            where other.installment_id = w.installment_id
              and other.voided_at is null
              and other.source <> 'repayment_plan'
          ), 0) < coalesce(inst.late_fee_flat_amount, 0)
        order by inst.due_date asc, inst.installment_no asc
        limit v_to_release
      loop
        update public.student_late_fee_waivers
        set voided_at = now(),
            void_reason = format(
              'EMI missed: a monthly instalment went past its due date unpaid, so the late fee on this installment applies again (%s of %s missed).',
              v_released + 1,
              v_missed
            )
        where id = v_waiver.wid;

        v_released := v_released + 1;
      end loop;
    end if;

    plan_id := v_plan.pid;
    student_id := v_plan.sid;
    missed_instalments := v_missed;
    already_released := v_already;
    released_now := case when p_dry_run then least(v_to_release, v_releasable) else v_released end;
    releasable_remaining := greatest(v_releasable - released_now, 0);
    -- True when the family has missed more months than there are late fees left
    -- to release: the cap is one per covered installment, by design.
    capped := v_to_release > v_releasable;
    return next;
  end loop;

  return;
end;
$function$;

revoke execute on function public.sync_repayment_plan_late_fees(text, boolean) from public;
grant execute on function public.sync_repayment_plan_late_fees(text, boolean) to authenticated;
grant execute on function public.sync_repayment_plan_late_fees(text, boolean) to service_role;
