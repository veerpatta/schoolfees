-- An admin may waive a late fee that has already been collected.
--
-- This reverses `20260808190000_cannot_waive_a_paid_late_fee.sql` for admins, at
-- the school's instruction, and for late fees ONLY. That migration capped the
-- waivable pool at what was still owed, on the reasoning that handing collected
-- money back is a refund rather than a waiver. The reasoning is sound for fees.
-- It is not how the office actually works for late fees.
--
-- What actually happens: a late fee lands automatically the day an installment
-- passes its due date, and a fair share of them are simply wrong — the family
-- paid at the counter on time and the receipt was posted the next morning, the
-- installment was never really due, the parent has a stamped slip. By the time
-- anyone notices, the family has usually paid the whole quote including the
-- ₹1,000, because that is what the counter asked for. Under the old cap the
-- office had no way to put that right short of reversing a correct receipt, and
-- reversing a correct receipt to fix a wrong late fee is a worse record than the
-- one it replaces.
--
-- So: `p_include_collected`, honoured only for an admin (`fees:write`) or the
-- service role. Everyone else — accountants included — keeps the old cap and the
-- old refusal message, unchanged.
--
-- WHERE THE MONEY GOES, and why this needs no new money path.
--
--   v_workbook_student_financials:  total_due  = sum(total_charge)
--                                   total_charge = greatest(base_charge
--                                                  + raw_late_fee - waiver_applied, 0)
--                                   total_paid = sum(applied_amount)
--   v_student_financial_state:      credit_balance = greatest(total_paid - total_due, 0)
--
-- Inserting the waiver row raises `waiver_applied`, so `total_charge` and
-- therefore `total_due` fall by the waived amount, while `total_paid` does not
-- move at all. The rupees the family already handed over stop being owed and
-- become credit, and the student's pending figure falls by the same amount.
-- Nothing is written to `payments` or `receipts`; Hard Safety Rule 1 holds.
--
-- 20260808190000 called that credit "unexplained", and it was right to: nothing
-- recorded WHY it appeared. That is what `source = 'manual_collected'` is for.
-- It marks the waivers that released collected money, so the dashboard's
-- charged/waived split stays honest, `verify-late-fee-health.mjs` can assert the
-- credit actually landed, and a future `void_late_fee_waiver` can find them.
--
-- The other objection in that migration — "money that came in as a late fee
-- stopped being counted as one" — is unchanged and accepted. Collection
-- reporting reads `receipts`, which is untouched: the day's collection figure
-- does not move, and the receipt the parent holds still says what it said. What
-- moves is the forward-looking late-fee line, which is the point.
--
-- The signature gains a seventh parameter, so the six-argument version has to be
-- DROPPED rather than replaced: PostgREST cannot disambiguate overloads and
-- would start answering `PGRST203` for every waiver in the app. Same reason and
-- same shape as 20260808150000. The parameter is last and defaulted, so all
-- three existing TypeScript call sites keep working untouched.

alter table public.student_late_fee_waivers
  drop constraint if exists student_late_fee_waivers_source_check;

alter table public.student_late_fee_waivers
  add constraint student_late_fee_waivers_source_check
  check (source = any (array[
    'manual', 'payment_desk', 'migration', 'grandfather', 'repayment_plan',
    -- Released money the family had already handed over. See the header.
    'manual_collected'
  ]));

comment on column public.student_late_fee_waivers.source is
  'Where the waiver came from. manual = the standalone sheet; payment_desk = targeted at one installment; migration / grandfather = written by a rule change; repayment_plan = an EMI activation; manual_collected = an admin forgave a late fee the family had ALREADY PAID, which returns that money as credit.';

-- Splitting one installment's waiver into an owed half and a collected half
-- writes two rows for the same installment under one client_request_id, which
-- `student_late_fee_waivers_request_idx` (student_id, client_request_id,
-- installment_id) refuses. Widen it by `source` rather than dropping it: the
-- index is the backstop under the early-return idempotency check in the function
-- below, and the two halves are genuinely different facts about the same
-- request. A replay still returns the original result before reaching an insert.
drop index if exists public.student_late_fee_waivers_request_idx;

create unique index student_late_fee_waivers_request_idx
  on public.student_late_fee_waivers (student_id, client_request_id, installment_id, source)
  where client_request_id is not null;

drop function if exists public.waive_late_fee(uuid, integer, text, text, uuid, uuid);

create function public.waive_late_fee(
  p_student_id uuid,
  p_amount integer,
  p_remarks text,
  p_session_label text default null::text,
  p_client_request_id uuid default null::uuid,
  p_installment_id uuid default null::uuid,
  p_include_collected boolean default false
)
returns table(ok boolean, message text, new_waiver_amount integer, added_amount integer)
language plpgsql
set search_path to 'public'
as $function$
declare
  v_pending_late_fee integer;
  v_charged_late_fee integer;
  v_remaining integer;
  v_take integer;
  v_take_owed integer;
  v_take_collected integer;
  v_added integer := 0;
  v_total_waiver integer;
  v_today text;
  v_audit text;
  v_row record;
  v_already_added integer;
  v_collected boolean := coalesce(p_include_collected, false);
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not public.has_permission('payments:waive_late_fee')
  then
    raise exception 'You do not have permission to waive late fees.';
  end if;

  -- Forgiving money the family has already handed over is a strictly larger act
  -- than forgiving money they still owe, so it carries a strictly narrower gate:
  -- admin (`fees:write`) or the harness. Accountants hold `fees:view` and stay
  -- on the old behaviour.
  --
  -- Raise rather than quietly downgrade to the narrow pool. A caller that asked
  -- to forgive a collected late fee and silently got a partial waiver leaves the
  -- office believing a correction landed when it did not — which is the failure
  -- this whole migration exists to stop happening by hand.
  if v_collected
     and coalesce(auth.role(), '') <> 'service_role'
     and not public.has_permission('fees:write')
  then
    raise exception
      'Only an admin can waive a late fee that has already been collected.';
  end if;

  if p_student_id is null then
    raise exception 'Student is required.';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Waiver amount must be greater than 0.';
  end if;
  if p_remarks is null or length(trim(p_remarks)) < 4 then
    raise exception 'Reason must be at least 4 characters.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_student_id::text, 0));

  -- A student on an active EMI plan has an agreed schedule; forgiving more on
  -- top of it changes the deal at the counter. Admins keep the escape hatch
  -- because an old-balance-only plan leaves current-year installments
  -- uncovered, and those can still legitimately need a waiver.
  if exists (
       select 1 from public.student_repayment_plans
       where student_id = p_student_id and lifecycle = 'active'
     )
     and coalesce(auth.role(), '') <> 'service_role'
     and not public.has_permission('fees:repayment_plan')
  then
    return query select
      false,
      'This student is on an EMI plan. Only an admin can waive late fees for them.'::text,
      null::integer,
      null::integer;
    return;
  end if;

  if p_client_request_id is not null then
    select coalesce(sum(amount), 0)::integer into v_already_added
    from public.student_late_fee_waivers
    where student_id = p_student_id
      and client_request_id = p_client_request_id
      and voided_at is null;

    if v_already_added > 0 then
      select coalesce(sum(amount), 0)::integer into v_total_waiver
      from public.student_late_fee_waivers
      where student_id = p_student_id and voided_at is null;

      return query select
        true,
        'Waiver applied.'::text,
        v_total_waiver,
        v_already_added;
      return;
    end if;
  end if;

  -- `remaining` is what this call may still take off the installment.
  --
  -- Narrow pool (the default): `late_fee_pending` — the late fee still OWED,
  -- after waivers and after any payment that already covered it. Note this is
  -- NOT `least(final_late_fee, pending_amount)`: since 20260812120000 split the
  -- columns, `pending_amount` is fees-only and that expression reads 0 for
  -- exactly the families who still have a waivable late fee.
  --
  -- Wide pool (admin, p_include_collected): `final_late_fee` — everything still
  -- charged, whether or not the family has paid it. `charged` stays the same
  -- either way so the refusal messages below can still tell the two cases apart.
  drop table if exists _waivable;
  create temporary table _waivable on commit drop as
  select
    snap.installment_id,
    snap.installment_no,
    snap.due_date,
    snap.session_label,
    greatest(snap.final_late_fee, 0)::integer as charged,
    case
      when v_collected then greatest(snap.final_late_fee, 0)::integer
      else greatest(snap.late_fee_pending, 0)::integer
    end as remaining,
    -- Carried separately, not as a boolean, because one installment can be
    -- PARTLY collected: ₹1,000 charged, ₹600 taken at the counter, ₹400 still
    -- owed. The loop below forgives the ₹400 first and labels only the ₹600 as
    -- released money, so `source` stays true row by row.
    greatest(snap.late_fee_pending, 0)::integer as still_owed
  from private.workbook_installment_snapshot(
         p_student_id,
         (now() at time zone 'Asia/Kolkata')::date,
         true
       ) as snap
  where greatest(snap.final_late_fee, 0) > 0
    and (p_installment_id is null or snap.installment_id = p_installment_id);

  select coalesce(sum(remaining), 0)::integer, coalesce(sum(charged), 0)::integer
    into v_pending_late_fee, v_charged_late_fee
  from _waivable;

  if v_pending_late_fee <= 0 then
    -- Distinguish "there is no late fee" from "the late fee is already paid".
    -- They call for different actions, and telling a cashier the student has no
    -- late fee when the receipt in their hand says otherwise is worse than
    -- refusing. The first branch is unreachable for an admin passing
    -- p_include_collected, because the wide pool IS the charged amount.
    if v_charged_late_fee > 0 then
      return query select
        false,
        'This late fee has already been paid, so it cannot be waived. An admin can forgive it from the student page, which returns the money as credit.'::text,
        null::integer,
        null::integer;
    else
      return query select
        false,
        'This student has no pending late fee to waive.'::text,
        null::integer,
        null::integer;
    end if;
    return;
  end if;

  if p_amount > v_pending_late_fee then
    select coalesce(sum(amount), 0)::integer into v_total_waiver
    from public.student_late_fee_waivers
    where student_id = p_student_id and voided_at is null;

    return query select
      false,
      case
        when v_collected then
          format('Waiver cannot exceed the late fee still charged (%s).', v_pending_late_fee)
        else
          format('Waiver cannot exceed the current pending late fee (%s).', v_pending_late_fee)
      end::text,
      v_total_waiver,
      0::integer;
    return;
  end if;

  if p_session_label is not null
     and not exists (select 1 from _waivable where session_label = p_session_label) then
    raise exception
      'Session % does not match any waivable installment for this student.', p_session_label;
  end if;

  v_today := to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM-DD');
  v_audit := format('Waive late fee %s on %s: %s', p_amount, v_today, p_remarks);

  v_remaining := p_amount;
  for v_row in
    select * from _waivable where remaining > 0 order by due_date, installment_no
  loop
    exit when v_remaining <= 0;
    v_take := least(v_remaining, v_row.remaining);
    -- Forgive what is still owed before releasing what has been collected, and
    -- write the two halves as separate rows. A single row carrying both would
    -- have to pick one `source`, and either choice makes the health check's
    -- "did the credit actually land?" arithmetic wrong by the other half.
    v_take_owed := least(v_take, v_row.still_owed);
    v_take_collected := v_take - v_take_owed;

    if v_take_owed > 0 then
      insert into public.student_late_fee_waivers (
        student_id, installment_id, session_label, amount, reason,
        source, client_request_id, waived_by
      ) values (
        p_student_id, v_row.installment_id, v_row.session_label, v_take_owed, v_audit,
        case when p_installment_id is null then 'manual' else 'payment_desk' end,
        p_client_request_id, auth.uid()
      );
    end if;

    if v_take_collected > 0 then
      insert into public.student_late_fee_waivers (
        student_id, installment_id, session_label, amount, reason,
        source, client_request_id, waived_by
      ) values (
        p_student_id, v_row.installment_id, v_row.session_label, v_take_collected, v_audit,
        'manual_collected',
        p_client_request_id, auth.uid()
      );
    end if;

    if v_take > 0 then
      v_remaining := v_remaining - v_take;
      v_added := v_added + v_take;
    end if;
  end loop;

  select coalesce(sum(amount), 0)::integer into v_total_waiver
  from public.student_late_fee_waivers
  where student_id = p_student_id and voided_at is null;

  return query select
    true,
    'Waiver applied.'::text,
    v_total_waiver,
    v_added;
end;
$function$;

revoke all on function public.waive_late_fee(uuid, integer, text, text, uuid, uuid, boolean) from public;
revoke all on function public.waive_late_fee(uuid, integer, text, text, uuid, uuid, boolean) from anon;
grant execute on function public.waive_late_fee(uuid, integer, text, text, uuid, uuid, boolean) to authenticated;
grant execute on function public.waive_late_fee(uuid, integer, text, text, uuid, uuid, boolean) to service_role;

comment on function public.waive_late_fee(uuid, integer, text, text, uuid, uuid, boolean) is
  'Forgives a late fee, one row per installment in public.student_late_fee_waivers. Caps at late_fee_pending. With p_include_collected an admin (fees:write) may also forgive a late fee the family has already paid: total_due falls, total_paid does not, and the difference becomes credit_balance. Never touches payments or receipts. SECURITY INVOKER on purpose.';
