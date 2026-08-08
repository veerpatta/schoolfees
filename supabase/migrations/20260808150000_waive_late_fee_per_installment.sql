-- waive_late_fee writes per-installment waiver rows, and is finally idempotent.
--
-- The previous migration moved both late-fee engines onto
-- public.student_late_fee_waivers. This RPC still wrote
-- student_fee_overrides.late_fee_waiver_amount, which nothing reads any more --
-- so until this lands, pressing "Waive late fee" silently does nothing. These
-- two migrations belong together.
--
-- What changes:
--
--   * Writes one row per installment into public.student_late_fee_waivers
--     instead of incrementing a student-level pool. This is the actual fix for
--     "the waiver keeps coming back": a waiver is now attached to the
--     installment it forgave, so a later payment cannot slide it elsewhere.
--
--   * p_installment_id (new, optional). Supplied -> waive exactly that
--     installment. Omitted -> allocate oldest-first by due date, which is what
--     the existing callers get without changing their call.
--
--   * p_client_request_id is honoured. It was accepted and thrown away, so a
--     double-submit waived twice; the sheet's own comment claimed otherwise.
--     A replay now returns the original result instead of stacking a second
--     waiver, backed by the partial unique index on
--     (student_id, client_request_id, installment_id).
--
--   * session_label is derived from installments -> classes, never taken from
--     p_session_label. The old pool had no session column at all, which is how
--     a waiver could leak across academic years. p_session_label is retained
--     for signature compatibility and, when supplied, is validated rather than
--     trusted.
--
--   * student_fee_overrides is no longer touched. In particular the RPC no
--     longer INSERTS an override row for a student who has none, so waiving no
--     longer fails with "No active fee setting found for this student" and no
--     longer invents override rows as a side effect.
--
-- SECURITY INVOKER is deliberate and load-bearing. The first guard is
-- public.has_permission(...), which needs auth.uid(); under a service-role JWT
-- auth.uid() is null and every call would raise "You do not have permission".
-- Callers must use the user-JWT client (lib/supabase/server.ts), never
-- lib/supabase/admin.ts. RLS on student_late_fee_waivers is the real
-- enforcement for the INSERT.
--
-- User-facing message strings are preserved verbatim: app/protected/payments/
-- actions.ts matches on them.

-- One function, not an overload: PostgREST cannot disambiguate a 5-named-arg
-- call between (a,b,c,d,e) and (a,b,c,d,e,f default).
drop function if exists public.waive_late_fee(uuid, integer, text, text, uuid);

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

  -- Same salt as post_student_payment_with_adjustments, so a waiver and a
  -- payment for one student serialise against each other.
  perform pg_advisory_xact_lock(hashtextextended(p_student_id::text, 0));

  -- Replay protection, inside the lock. The unique index is the hard backstop;
  -- this branch is what makes a retry return the ORIGINAL answer rather than an
  -- opaque constraint violation.
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

  -- What is still waivable, per installment, straight from the canonical
  -- engine. final_late_fee is already net of waivers that exist, so it IS the
  -- remaining waivable amount for that installment.
  create temporary table _waivable on commit drop as
  select
    snap.installment_id,
    snap.installment_no,
    snap.due_date,
    snap.session_label,
    greatest(snap.final_late_fee, 0)::integer as remaining
  from private.workbook_installment_snapshot(
         p_student_id,
         (now() at time zone 'Asia/Kolkata')::date,
         true
       ) as snap
  where greatest(snap.final_late_fee, 0) > 0
    and (p_installment_id is null or snap.installment_id = p_installment_id);

  select coalesce(sum(remaining), 0)::integer into v_pending_late_fee from _waivable;

  if v_pending_late_fee <= 0 then
    return query select
      false,
      'This student has no pending late fee to waive.'::text,
      null::integer,
      null::integer;
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

  -- Oldest first, so a partial waiver clears the debt the family has carried
  -- longest. With p_installment_id supplied there is only one candidate row.
  v_remaining := p_amount;
  for v_row in
    select * from _waivable order by due_date, installment_no
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
  'Waive late fee for a student, writing per-installment rows to public.student_late_fee_waivers. p_installment_id targets one installment; omitted, the amount is allocated oldest-first. Idempotent on p_client_request_id. MUST be called with the user-JWT client -- it is SECURITY INVOKER and guards on has_permission(), which needs auth.uid().';

-- ---------------------------------------------------------------------------
-- Undo. A waiver is never deleted; it is voided, and the row stays.
-- ---------------------------------------------------------------------------
--
-- Gated on payments:adjust rather than payments:waive_late_fee, because voiding
-- RAISES what a family owes -- a heavier action than forgiving a fee.

create or replace function public.void_late_fee_waiver(
  p_waiver_id uuid,
  p_reason text
)
returns table (
  ok boolean,
  message text,
  new_waiver_amount integer,
  removed_amount integer
)
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  v_student_id uuid;
  v_amount integer;
  v_voided timestamptz;
  v_total integer;
begin
  if not public.has_permission('payments:adjust') then
    raise exception 'You do not have permission to reverse a late-fee waiver.';
  end if;

  if p_waiver_id is null then
    raise exception 'Waiver is required.';
  end if;
  if p_reason is null or length(trim(p_reason)) < 4 then
    raise exception 'Reason must be at least 4 characters.';
  end if;

  select student_id, amount, voided_at
    into v_student_id, v_amount, v_voided
  from public.student_late_fee_waivers
  where id = p_waiver_id;

  if v_student_id is null then
    return query select false, 'That waiver no longer exists.'::text, null::integer, null::integer;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_student_id::text, 0));

  if v_voided is not null then
    return query select false, 'That waiver has already been reversed.'::text, null::integer, 0::integer;
    return;
  end if;

  update public.student_late_fee_waivers
     set voided_at = now(),
         voided_by = auth.uid(),
         void_reason = trim(p_reason)
   where id = p_waiver_id;

  select coalesce(sum(amount), 0)::integer into v_total
  from public.student_late_fee_waivers
  where student_id = v_student_id and voided_at is null;

  return query select true, 'Waiver reversed.'::text, v_total, v_amount;
end;
$fn$;

revoke all on function public.void_late_fee_waiver(uuid, text) from public, anon;
grant execute on function public.void_late_fee_waiver(uuid, text) to authenticated;
grant execute on function public.void_late_fee_waiver(uuid, text) to service_role;

comment on function public.void_late_fee_waiver(uuid, text) is
  'Reverse a late-fee waiver, restoring the charge. The row is marked voided, never deleted. Gated on payments:adjust because this RAISES what a family owes. MUST be called with the user-JWT client.';

-- student_fee_overrides.late_fee_waiver_amount is now write-only dead weight.
-- It is not dropped yet: lib/fees/policy.ts, lib/fees/config-change.ts, the
-- student import chain and both MCP surfaces still read it. Marked so nobody
-- reintroduces a writer while those are being cleaned up.
comment on column public.student_fee_overrides.late_fee_waiver_amount is
  'DEPRECATED 2026-08-08. Late-fee waivers now live in public.student_late_fee_waivers, one row per installment. No engine reads this column any more. Retained read-only for legacy consumers pending their removal -- do not write to it.';

notify pgrst, 'reload schema';
