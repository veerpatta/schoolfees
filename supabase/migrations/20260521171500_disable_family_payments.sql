-- Family pay-together posting was removed because office payments must be
-- posted student-by-student to avoid cashier confusion.
drop policy if exists "authenticated can insert family payments" on public.family_payments;

revoke execute on function public.post_family_payment(
  uuid, text, date, public.payment_mode, text, text, text, integer, jsonb, text, text
) from authenticated;

drop function if exists public.post_family_payment(
  uuid, text, date, public.payment_mode, text, text, text, integer, jsonb, text, text
);

drop function if exists private.derive_family_child_client_request_id(text, uuid);

comment on table public.family_payments is
  'Historical ledger retained only for any already-posted family batches. Payments must be posted student-by-student.';
