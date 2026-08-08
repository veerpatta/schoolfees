-- A late fee that has already been paid cannot be waived.
--
-- waive_late_fee offered the whole of final_late_fee as waivable, whether or not
-- the family had already handed over the money. Waiving a collected late fee did
-- not give it back — it reduced what the installment charged, so the payment that
-- had covered it turned into an unexplained credit sitting on the ledger, and the
-- late fee silently vanished from the late-fee lines. Money that came in as a
-- late fee stopped being counted as one.
--
-- Waivable is now capped at what is still outstanding on that installment:
--
--     least(final_late_fee, pending_amount)
--
-- so a fully-settled installment offers nothing to waive, and a partly-settled
-- one offers only the part still owed. A late fee already collected stays a
-- collected late fee. Giving it back is a refund — a different act, with its own
-- surface and its own audit trail — not a waiver.
--
-- Concrete case from the live data: a student whose installment 1 has base 7,125
-- and 8,125 applied has paid their Rs 1,000 late fee in full. Before this, the
-- waive sheet offered Rs 1,000; now it offers nothing and says why.
--
-- The UI already computed its picker this way (the student page caps each entry
-- at min(finalLateFee, pendingAmount)), so this closes the gap between what the
-- sheet offered and what the server would accept.

create or replace function public.waive_late_fee(
  p_student_id uuid,
  p_amount integer,
  p_remarks text,
  p_session_label text default null,
  p_client_request_id uuid default null,
  p_installment_id uuid default null
)
returns table (
  ok boolean,
  message text,
  new_waiver_amount integer,
  added_amount integer
)
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  v_pending_late_fee integer;
  v_charged_late_fee integer;
  v_remaining integer;
  v_take integer;
  v_added integer := 0;
  v_total_waiver integer;
  v_today text;
  v_audit text;
  v_row record;
  v_already_added integer;
begin
  if not public.has_permission('payments:waive_late_fee') then
    raise exception 'You do not have permission to waive late fees.';
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

  -- `remaining` is the late fee still OWED on the installment, not the late fee
  -- charged. pending_amount is what the installment has left outstanding across
  -- base and late fee together, so capping against it means a payment that has
  -- already covered the late fee removes it from the waivable pool.
  create temporary table _waivable on commit drop as
  select
    snap.installment_id,
    snap.installment_no,
    snap.due_date,
    snap.session_label,
    greatest(snap.final_late_fee, 0)::integer as charged,
    least(
      greatest(snap.final_late_fee, 0),
      greatest(snap.pending_amount, 0)
    )::integer as remaining
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
    -- refusing.
    if v_charged_late_fee > 0 then
      return query select
        false,
        'This late fee has already been paid, so it cannot be waived. Reverse the receipt or raise a refund if it was collected in error.'::text,
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
      format('Waiver cannot exceed the current pending late fee (%s).', v_pending_late_fee)::text,
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
    if v_take > 0 then
      insert into public.student_late_fee_waivers (
        student_id, installment_id, session_label, amount, reason,
        source, client_request_id, waived_by
      ) values (
        p_student_id, v_row.installment_id, v_row.session_label, v_take, v_audit,
        case when p_installment_id is null then 'manual' else 'payment_desk' end,
        p_client_request_id, auth.uid()
      );
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
$fn$;

revoke all on function public.waive_late_fee(uuid, integer, text, text, uuid, uuid) from public, anon;
grant execute on function public.waive_late_fee(uuid, integer, text, text, uuid, uuid) to authenticated;
grant execute on function public.waive_late_fee(uuid, integer, text, text, uuid, uuid) to service_role;

comment on function public.waive_late_fee(uuid, integer, text, text, uuid, uuid) is
  'Waive late fee for a student, writing per-installment rows to public.student_late_fee_waivers. Waivable is capped at least(final_late_fee, pending_amount): a late fee already paid cannot be waived, because waiving it would turn collected money into an unexplained credit and drop it out of the late-fee figures. p_installment_id targets one installment; omitted, the amount is allocated oldest-first. Idempotent on p_client_request_id. MUST be called with the user-JWT client -- it is SECURITY INVOKER and guards on has_permission(), which needs auth.uid().';

notify pgrst, 'reload schema';
