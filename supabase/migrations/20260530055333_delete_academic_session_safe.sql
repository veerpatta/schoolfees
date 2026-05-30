-- Safe deletion of a mistakenly-created academic session.
--
-- Allows a hard delete ONLY when:
--   * the session is not the current/live session, and
--   * it was created within the last 30 days, and
--   * it has ZERO posted payments and ZERO receipts.
--
-- Posted payments/receipts are append-only (see prevent_append_only_mutation):
-- this function never touches them. If any exist, it raises and the caller is
-- told to archive the session instead. Everything else (students, installments,
-- fee settings, classes, copied fee policy, discount policies, family groups)
-- is removed in one transaction in FK-safe order. Deleting a student cascades
-- its installments, fee overrides, discount assignments, and family memberships.

create or replace function public.delete_academic_session_safe(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_label text;
  v_is_current boolean;
  v_created_at timestamptz;
  v_payment_count integer;
  v_receipt_count integer;
begin
  if not public.has_permission('settings:write') then
    raise exception 'You do not have permission to delete academic sessions.';
  end if;

  select session_label, is_current, created_at
  into v_label, v_is_current, v_created_at
  from public.academic_sessions
  where id = p_session_id;

  if v_label is null then
    raise exception 'Academic session not found.';
  end if;

  if v_is_current or lower(v_label) = lower(public.active_session_label()) then
    raise exception 'The live session cannot be deleted. Mark another session current first.';
  end if;

  if v_created_at < now() - interval '30 days' then
    raise exception 'Only sessions created in the last 30 days can be deleted. Archive this session instead.';
  end if;

  select count(*) into v_receipt_count
  from public.receipts r
  join public.students s on s.id = r.student_id
  join public.classes c on c.id = s.class_id
  where c.session_label = v_label;

  select count(*) into v_payment_count
  from public.payments p
  join public.installments i on i.id = p.installment_id
  join public.classes c on c.id = i.class_id
  where c.session_label = v_label;

  if v_payment_count > 0 or v_receipt_count > 0 then
    raise exception 'This session has posted payments or receipts and cannot be deleted. Archive it instead.';
  end if;

  -- Deleting students cascades installments, fee overrides, conventional
  -- discount assignments, and family memberships (all ON DELETE CASCADE).
  delete from public.students s
  using public.classes c
  where s.class_id = c.id
    and c.session_label = v_label;

  -- Fee settings reference classes (RESTRICT) and were referenced by the now
  -- deleted installments.
  delete from public.fee_settings fs
  using public.classes c
  where fs.class_id = c.id
    and c.session_label = v_label;

  delete from public.conventional_discount_policies
  where academic_session_label = v_label;

  delete from public.student_family_groups
  where academic_session_label = v_label;

  delete from public.classes
  where session_label = v_label;

  delete from public.fee_policy_configs
  where academic_session_label = v_label;

  delete from public.academic_sessions
  where id = p_session_id;
end;
$$;

revoke all on function public.delete_academic_session_safe(uuid) from public;
revoke all on function public.delete_academic_session_safe(uuid) from anon;
grant execute on function public.delete_academic_session_safe(uuid) to authenticated;
