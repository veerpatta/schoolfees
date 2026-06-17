-- Fix: waive_late_fee read the pending late fee from the wrong source.
--
-- WHY:
--   waive_late_fee (migration 20260528151726_waive_late_fee_advisory_lock.sql)
--   read its "pending late fee" from the materialized view
--   public.v_workbook_student_financials, using a column that does not exist:
--     coalesce(f.pending_late_fee_amount, f.late_fee_total, 0)
--   Migration 20260615120000_base_outstanding_excludes_late_fees.sql recreated
--   that view without a pending_late_fee_amount column, so every waiver attempt
--   raised: "column f.pending_late_fee_amount does not exist".
--
--   A plain column swap is NOT enough. Late fees only "materialize" in the view
--   once a payment posts after the due date. For a never-paid overdue student
--   the view stores late_fee_total = 0 / late_fee_outstanding_amount = 0, while
--   the UI shows an accruing ("candidate") late fee computed from the policy
--   flat rate. Reading the view would make the RPC reject valid waivers with
--   "This student has no pending late fee to waive." — the number the staff see
--   would not be wired to the number the RPC validates.
--
-- FIX:
--   Source the pending late fee from private.workbook_installment_snapshot(
--   p_student_id, <IST date>, true) — exactly the candidate-aware projection
--   that preview_workbook_payment_allocation and
--   post_student_payment_with_adjustments already use. summed final_late_fee
--   already nets out the existing waiver pool, so it is the remaining un-waived
--   effective late fee, which is what the cap must compare against.
--
-- SAFETY:
--   * security invoker preserved; the has_permission('payments:waive_late_fee')
--     guard, the pg_advisory_xact_lock salt, the audit-reason concatenation and
--     the insert/update branches on student_fee_overrides are byte-for-byte the
--     same. Only the pending-late-fee read changed.
--   * authenticated already has EXECUTE on
--     private.workbook_installment_snapshot, so no new grant is required.
--   * Append-only: never modifies posted payments / receipts /
--     payment_adjustments.

drop function if exists public.waive_late_fee(uuid, integer, text, text, uuid);

create or replace function public.waive_late_fee(
  p_student_id uuid,
  p_amount integer,
  p_remarks text,
  p_session_label text default null,
  p_client_request_id uuid default null
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
as $$
declare
  v_pending_late_fee integer;
  v_current_waiver integer;
  v_new_waiver integer;
  v_existing_override_id uuid;
  v_existing_reason text;
  v_audit_line text;
  v_combined_reason text;
  v_today text;
  v_fee_setting_id uuid;
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

  -- Audit 1.5 — same salt as post_student_payment_with_adjustments so a
  -- waiver and a payment for the same student serialise.
  perform pg_advisory_xact_lock(hashtextextended(p_student_id::text, 0));

  -- Pending (remaining, un-waived) late fee, computed the SAME way the UI and
  -- the payment RPCs do: candidate-aware installment snapshot. final_late_fee
  -- already nets out the current waiver pool, so summing it gives the remaining
  -- effective late fee. Use the IST date so the overdue/candidate set matches
  -- what the office sees on the student profile.
  select coalesce(sum(greatest(snap.final_late_fee, 0)), 0)::integer
  into v_pending_late_fee
  from private.workbook_installment_snapshot(
         p_student_id,
         (now() at time zone 'Asia/Kolkata')::date,
         true
       ) as snap;

  if v_pending_late_fee <= 0 then
    return query select
      false,
      'This student has no pending late fee to waive.'::text,
      null::integer,
      null::integer;
    return;
  end if;

  select o.id, o.late_fee_waiver_amount, o.reason
  into v_existing_override_id, v_current_waiver, v_existing_reason
  from public.student_fee_overrides as o
  where o.student_id = p_student_id
    and o.is_active = true
  for update;

  v_current_waiver := coalesce(v_current_waiver, 0);
  v_new_waiver := v_current_waiver + p_amount;

  if v_new_waiver > v_current_waiver + v_pending_late_fee then
    return query select
      false,
      format('Waiver cannot exceed the current pending late fee (%s).', v_pending_late_fee)::text,
      v_current_waiver,
      0::integer;
    return;
  end if;

  v_today := to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM-DD');
  v_audit_line := format('Waive late fee %s on %s: %s', p_amount, v_today, p_remarks);
  v_combined_reason := case
    when v_existing_reason is not null and length(trim(v_existing_reason)) > 0
      then v_existing_reason || ' | ' || v_audit_line
    else v_audit_line
  end;

  if v_existing_override_id is not null then
    update public.student_fee_overrides
    set late_fee_waiver_amount = v_new_waiver,
        reason = v_combined_reason,
        updated_at = now()
    where id = v_existing_override_id;
  else
    -- Insert path. Resolve fee_setting_id from the student's active class so
    -- the row passes existing FK + check constraints.
    select s.id
    into v_fee_setting_id
    from public.fee_settings as s
    join public.students as st on st.class_id = s.class_id
    where st.id = p_student_id
      and s.is_active = true
    order by s.created_at desc
    limit 1;

    if v_fee_setting_id is null then
      return query select
        false,
        'No active fee setting found for this student. Publish Fee Setup first.'::text,
        v_current_waiver,
        0::integer;
      return;
    end if;

    insert into public.student_fee_overrides (
      student_id,
      fee_setting_id,
      discount_amount,
      late_fee_waiver_amount,
      reason,
      is_active
    ) values (
      p_student_id,
      v_fee_setting_id,
      0,
      v_new_waiver,
      v_audit_line,
      true
    );
  end if;

  return query select
    true,
    'Waiver applied.'::text,
    v_new_waiver,
    p_amount;
end;
$$;

grant execute on function public.waive_late_fee(uuid, integer, text, text, uuid) to authenticated;

notify pgrst, 'reload schema';
