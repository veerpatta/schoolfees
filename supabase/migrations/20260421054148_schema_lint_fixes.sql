create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = private
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function private.set_actor_columns()
returns trigger
language plpgsql
set search_path = private
as $$
begin
  if tg_op = 'INSERT' then
    if new.created_by is null then
      new.created_by = auth.uid();
    end if;

    if new.updated_by is null then
      new.updated_by = coalesce(auth.uid(), new.created_by);
    end if;
  else
    new.updated_by = coalesce(auth.uid(), new.updated_by, old.updated_by);
  end if;

  return new;
end;
$$;

create or replace function private.set_created_by_column()
returns trigger
language plpgsql
set search_path = private
as $$
begin
  if new.created_by is null then
    new.created_by = auth.uid();
  end if;

  return new;
end;
$$;

create or replace function private.prevent_append_only_mutation()
returns trigger
language plpgsql
set search_path = private
as $$
begin
  raise exception '% is append-only and cannot be updated or deleted.', tg_table_name;
end;
$$;

create index if not exists idx_users_created_by
on public.users (created_by);

create index if not exists idx_users_updated_by
on public.users (updated_by);

create index if not exists idx_classes_created_by
on public.classes (created_by);

create index if not exists idx_classes_updated_by
on public.classes (updated_by);

create index if not exists idx_transport_routes_created_by
on public.transport_routes (created_by);

create index if not exists idx_transport_routes_updated_by
on public.transport_routes (updated_by);

create index if not exists idx_students_created_by
on public.students (created_by);

create index if not exists idx_students_updated_by
on public.students (updated_by);

create index if not exists idx_fee_settings_created_by
on public.fee_settings (created_by);

create index if not exists idx_fee_settings_updated_by
on public.fee_settings (updated_by);

create index if not exists idx_student_fee_overrides_fee_setting
on public.student_fee_overrides (fee_setting_id);

create index if not exists idx_student_fee_overrides_created_by
on public.student_fee_overrides (created_by);

create index if not exists idx_student_fee_overrides_updated_by
on public.student_fee_overrides (updated_by);

create index if not exists idx_installments_fee_setting
on public.installments (fee_setting_id);

create index if not exists idx_installments_student_fee_override
on public.installments (student_fee_override_id)
where student_fee_override_id is not null;

create index if not exists idx_installments_created_by
on public.installments (created_by);

create index if not exists idx_installments_updated_by
on public.installments (updated_by);

create index if not exists idx_receipts_created_by
on public.receipts (created_by);

create index if not exists idx_payments_receipt_student
on public.payments (receipt_id, student_id);

create index if not exists idx_payments_installment_student
on public.payments (installment_id, student_id);

create index if not exists idx_payments_created_by
on public.payments (created_by);

create index if not exists idx_payment_adjustments_payment_student_installment
on public.payment_adjustments (payment_id, student_id, installment_id);

create index if not exists idx_payment_adjustments_created_by
on public.payment_adjustments (created_by);
