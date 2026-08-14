-- One definition of "this student's ledger disagrees with their fee policy".
--
-- The identity that is supposed to hold for every active student is documented
-- on v_workbook_student_financials:
--
--     gross_base_before_discount - discount_amount = base_charge_total
--
-- Nothing enforced it. When it broke, it broke silently and in the school's
-- favour-losing direction: a bus route added mid-year to a student who had
-- already paid could not be written to any installment, so the rise was dropped
-- and the ledger simply asked for less than the policy said. Live 2026-27 ran
-- that way for months on eight students and Rs 54,225.
--
-- A view rather than a query in three places. The repair script, the health
-- script and the Settings page all have to mean exactly the same thing by
-- "drifted", and the last time this was written twice the two copies disagreed
-- about carry-forward rows and produced 104 false positives against 31 real
-- ones.
--
-- Three conditions, deliberately reported side by side rather than merged --
-- they need different responses:
--
--   drift <> 0            the money disagrees.
--   not has_ledger        dues were never prepared. Not the same as drift, and
--                         the older detector dropped these rows entirely.
--   stale_class_rows > 0  the installments still point at a class the student
--                         has left. Invisible whenever the two classes happen
--                         to price the same (SR 2141, 12 Arts -> 12 Commerce,
--                         both Rs 32,000) right up until one of them changes.
--
-- Stale class rows are counted twice over, because the two kinds need different
-- hands. A normal installment is re-pointed by the next regeneration. A
-- carry-forward or EMI late-fee row is deliberately excluded from every
-- regeneration sweep, so it stays stale forever and only a targeted update
-- moves it -- SR 2381 carries a Rs 15,000 previous-year balance still filed
-- under 12 Science after the student moved to 12 Arts, which quietly bills that
-- money to the wrong class on every per-class board.
--
-- Carry-forward rows are excluded from ledger_net on purpose: they are a
-- deliberate prior-year balance carried into this session, not part of the
-- current policy total.
--
-- security_invoker so the caller's RLS on public.installments still applies --
-- a default (definer) view here would hand every reader the whole school.

begin;

create or replace view public.v_ledger_policy_drift
with (security_invoker = true) as
with ledger as (
  select
    i.student_id,
    c.session_label,
    sum(case when i.is_carry_forward then 0 else i.amount_due end)::bigint as ledger_net,
    count(*) filter (
      where i.class_id <> s.class_id
        and not i.is_carry_forward
        and not coalesce(i.is_emi_late_fee, false)
    )::integer as stale_class_rows,
    count(*) filter (
      where i.class_id <> s.class_id
        and (i.is_carry_forward or coalesce(i.is_emi_late_fee, false))
    )::integer as stale_class_locked_rows
  from public.installments i
  join public.students s on s.id = i.student_id
  join public.classes c on c.id = i.class_id
  where i.status <> 'cancelled'
  group by i.student_id, c.session_label
)
select
  f.student_id,
  f.admission_no,
  f.student_name,
  f.class_label,
  f.session_label,
  (f.gross_base_before_discount - f.discount_amount)::bigint as policy_net,
  coalesce(l.ledger_net, 0)::bigint as ledger_net,
  ((f.gross_base_before_discount - f.discount_amount) - coalesce(l.ledger_net, 0))::bigint as drift,
  (l.student_id is not null) as has_ledger,
  coalesce(l.stale_class_rows, 0) as stale_class_rows,
  coalesce(l.stale_class_locked_rows, 0) as stale_class_locked_rows
from public.v_workbook_student_financials f
left join ledger l
  on l.student_id = f.student_id
 and l.session_label = f.session_label
where f.record_status = 'active';

comment on view public.v_ledger_policy_drift is
  'Active students whose installment ledger disagrees with their resolved fee policy. drift > 0 means the ledger charges LESS than policy (under-billed); drift < 0 means it charges more (a discount that never landed). Session-scoped through classes.session_label.';

grant select on public.v_ledger_policy_drift to authenticated, service_role;

commit;
