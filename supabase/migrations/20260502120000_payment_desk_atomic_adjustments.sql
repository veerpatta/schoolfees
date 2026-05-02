-- Atomic Payment Desk posting path.
-- Keeps receipts.total_amount as amount received, while applying discount/late-fee waiver
-- as audited student override adjustments in the same transaction before allocation.
create or replace function public.post_student_payment_with_adjustments(
  p_student_id uuid,
  p_payment_date date,
  p_payment_mode public.payment_mode,
  p_total_amount integer,
  p_reference_number text default null,
  p_remarks text default null,
  p_received_by text default null,
  p_receipt_prefix text default 'SVP',
  p_client_request_id uuid default null,
  p_quick_discount_amount integer default 0,
  p_quick_late_fee_waiver_amount integer default 0
)
returns table (
  receipt_id uuid,
  receipt_number text,
  allocated_total integer
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  override_row public.student_fee_overrides%rowtype;
  effective_discount integer := greatest(coalesce(p_quick_discount_amount, 0), 0);
  effective_waiver integer := greatest(coalesce(p_quick_late_fee_waiver_amount, 0), 0);
  active_fee_setting_id uuid;
begin
  if effective_discount > 0 or effective_waiver > 0 then
    select o.* into override_row
    from public.student_fee_overrides o
    where o.student_id = p_student_id and o.is_active = true
    order by o.updated_at desc
    limit 1;

    if override_row.id is null then
      select fs.id into active_fee_setting_id
      from public.students s
      join public.fee_settings fs on fs.class_id = s.class_id and fs.is_active = true
      where s.id = p_student_id
      limit 1;

      if active_fee_setting_id is null then
        raise exception 'No active fee settings found for this student class.';
      end if;

      insert into public.student_fee_overrides (
        student_id, fee_setting_id, discount_amount, late_fee_waiver_amount, reason, is_active
      ) values (
        p_student_id, active_fee_setting_id, effective_discount, effective_waiver,
        'Payment Desk quick adjustment', true
      );
    else
      update public.student_fee_overrides
      set discount_amount = greatest(coalesce(discount_amount, 0) + effective_discount, 0),
          late_fee_waiver_amount = greatest(coalesce(late_fee_waiver_amount, 0) + effective_waiver, 0),
          reason = 'Payment Desk quick adjustment',
          updated_at = timezone('utc', now())
      where id = override_row.id;
    end if;
  end if;

  return query
  select * from public.post_student_payment(
    p_student_id,
    p_payment_date,
    p_payment_mode,
    p_total_amount,
    p_reference_number,
    p_remarks,
    p_received_by,
    p_receipt_prefix,
    p_client_request_id
  );
end;
$$;

grant execute on function public.post_student_payment_with_adjustments(
  uuid, date, public.payment_mode, integer, text, text, text, text, uuid, integer, integer
) to authenticated;
