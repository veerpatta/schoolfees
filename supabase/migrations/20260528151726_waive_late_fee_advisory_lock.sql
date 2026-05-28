-- Audit 1.5 — Atomic late-fee waiver with advisory lock.
--
-- WHY:
--   The standalone late-fee waiver action does a read-then-write across the
--   workbook view (for pending late fee) and student_fee_overrides (for the
--   current waiver), with no lock between read and write. Two near-
--   simultaneous waivers for the same student each observe the same pre-
--   waiver state and add their full amount on top — the late fee gets zeroed
--   out twice and the financial side is over-credited.
--
-- FIX:
--   Introduce waive_late_fee(p_student_id, p_amount, p_remarks,
--   p_session_label, p_client_request_id) that:
--     1. Takes pg_advisory_xact_lock(hashtextextended(p_student_id::text, 0))
--        — the same salt used by post_student_payment_with_adjustments so the
--        two actions serialise per student.
--     2. Reads pending late fee from v_workbook_student_financials.
--     3. Reads existing waiver from the active student_fee_overrides row.
--     4. Validates amount <= pending late fee.
--     5. Updates the override (or inserts a minimal row if none exists).
--     6. Returns the new waiver total and any audit metadata.
--
-- SAFETY:
--   * Append-only: never modifies posted payments / receipts /
--     payment_adjustments.
--   * Only the late_fee_waiver_amount and reason fields are touched.
--   * Insert path requires fee_setting_id resolved from the student's active
--     class so the row is valid against existing FKs and the check constraint.
--   * Apply to TEST Supabase branch first. Production rollout per
--     docs/go-live/audit-fix-rollout.md.

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

  select
    coalesce(
      f.pending_late_fee_amount,
      f.late_fee_total,
      0
    )
  into v_pending_late_fee
  from public.v_workbook_student_financials as f
  where f.student_id = p_student_id;

  if v_pending_late_fee is null then
    return query select
      false,
      'Student not found in workbook financials.'::text,
      null::integer,
      null::integer;
    return;
  end if;

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
