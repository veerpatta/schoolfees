-- The replayable half of 20260727113603, so a database built from nothing still
-- gets the hardening.
--
-- That migration does two unrelated jobs in one file. The first is schema and
-- permissions: revoke the financial projections from anon, grant them to
-- authenticated, tighten execute on the posting RPCs, drop the retired
-- post_family_payment, and create public.v_receipt_effective_allocation_totals.
-- The second is a one-off repair of the May 24 allocation import drift, and it
-- is deliberately guarded:
--
--   if v_anomaly_count <> 12 or v_pair_count <> 6 then
--     raise exception 'Receipt allocation repair aborted: expected 12 anomalies
--     in 6 guarded pairs, found % anomalies in % pairs.'
--
-- That guard is correct. A data repair that runs against data it has not been
-- checked against is how a repair becomes a corruption, and the author pinned
-- the exact six receipt pairs they had reviewed. The consequence is that the
-- migration cannot run anywhere except the production database of 27 July 2026:
-- on an empty database it finds 0 anomalies and aborts, taking the permission
-- hardening down with it.
--
-- So the development bootstrap records 20260727113603 as applied without running
-- it — it is genuinely a no-op against data that does not exist — and this file
-- replays the half that every database needs. The list of migrations treated
-- that way, and why, is in scripts/school-one/dev-db.mjs; there is no silent
-- skipping.
--
-- Every statement below is copied verbatim from 20260727113603 lines 8-80 and is
-- idempotent: revoke, grant, drop-if-exists, create-or-replace. On production
-- this file sits before the last applied version, so a plain "supabase db push"
-- skips it; were it ever applied there it would change nothing, because
-- production ran these statements on 27 July 2026.
--
-- Found by the School One Phase 0 dev bootstrap (P0.2) — the first time anybody
-- had built this schema from nothing. Additive and permission-only; no fee
-- table, trigger or policy is altered, and no row is written.

revoke all on table public.mv_student_sibling_groups from public, anon;
revoke all on table public.v_student_financial_state from public, anon;
revoke all on table public.v_workbook_installment_balances from public, anon;
revoke all on table public.v_workbook_student_financials from public, anon;

grant select on table public.mv_student_sibling_groups to authenticated, service_role;
grant select on table public.v_student_financial_state to authenticated, service_role;
grant select on table public.v_workbook_installment_balances to authenticated, service_role;
grant select on table public.v_workbook_student_financials to authenticated, service_role;

revoke execute on function public.post_student_payment_with_adjustments(
  uuid, date, public.payment_mode, integer, text, text, text, text, uuid, integer, integer
) from public, anon;
grant execute on function public.post_student_payment_with_adjustments(
  uuid, date, public.payment_mode, integer, text, text, text, text, uuid, integer, integer
) to authenticated, service_role;

revoke execute on function public.waive_late_fee(
  uuid, integer, text, text, uuid
) from public, anon;
grant execute on function public.waive_late_fee(
  uuid, integer, text, text, uuid
) to authenticated, service_role;

revoke execute on function public.post_family_payment(
  uuid, text, date, public.payment_mode, text, text, text, integer, jsonb, text, text
) from public, anon, authenticated;
drop function if exists public.post_family_payment(
  uuid, text, date, public.payment_mode, text, text, text, integer, jsonb, text, text
);
drop function if exists private.derive_family_child_client_request_id(text, uuid);

create or replace view public.v_receipt_effective_allocation_totals
with (security_invoker = true)
as
with payment_effective as (
  select
    payment_row.id as payment_id,
    payment_row.receipt_id,
    payment_row.amount::bigint as original_amount,
    coalesce(sum(adjustment_row.amount_delta), 0)::bigint as adjustment_amount
  from public.payments as payment_row
  left join public.payment_adjustments as adjustment_row
    on adjustment_row.payment_id = payment_row.id
    and adjustment_row.adjustment_type = 'correction'
  group by payment_row.id, payment_row.receipt_id, payment_row.amount
)
select
  receipt_row.id as receipt_id,
  receipt_row.student_id,
  receipt_row.total_amount::bigint as receipt_total,
  coalesce(sum(payment_effective.original_amount), 0)::bigint as original_allocation_total,
  coalesce(sum(payment_effective.adjustment_amount), 0)::bigint as adjustment_total,
  coalesce(
    sum(payment_effective.original_amount + payment_effective.adjustment_amount),
    0
  )::bigint as effective_allocation_total,
  (
    coalesce(
      sum(payment_effective.original_amount + payment_effective.adjustment_amount),
      0
    ) - receipt_row.total_amount
  )::bigint as variance
from public.receipts as receipt_row
left join payment_effective
  on payment_effective.receipt_id = receipt_row.id
group by receipt_row.id, receipt_row.student_id, receipt_row.total_amount;

comment on view public.v_receipt_effective_allocation_totals is
  'Authenticated audit projection reconciling receipt totals to append-only payment allocations and corrections.';

revoke all on table public.v_receipt_effective_allocation_totals from public, anon;
grant select on table public.v_receipt_effective_allocation_totals to authenticated, service_role;
