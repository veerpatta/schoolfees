-- Move the dashboard's current-year / previous-year / late-fee split into SQL.
--
-- get_dashboard_summary never returned these five figures, so lib/dashboard/data.ts
-- always fell through to a JavaScript fallback that paged EVERY installment row for
-- the session out of Mumbai and reduced it in Node -- roughly 2,100 rows on every
-- single dashboard render, to produce five integers.
--
-- Two bugs came with that, both measured on the live 2026-27 session:
--
--   1. Late fee pending read Rs 7,000 where the truth is Rs 6,000. The fallback
--      reduces v_workbook_installment_balances, which joins students with no status
--      predicate, so struck-off and left students were counted. Every other KPI on
--      the same card row filters `s.status = 'active' and c.status = 'active'`, so
--      this one number was computed over a different population from its neighbours.
--
--   2. Collected read Rs 25,39,809 where the truth is Rs 24,93,809 -- Rs 46,000 too
--      high. calculateRowApplied clamps paid and adjustment at zero INDIVIDUALLY
--      before adding them, so the 19 rows carrying a negative adjustment (reversed
--      receipts) had their reversal silently dropped. Netting them is what
--      applied_amount already does in the view.
--
-- This is a separate small function rather than a patch to get_dashboard_summary:
-- that function is 16 KB of plpgsql, and surgically editing it to thread five more
-- values through would risk far more than it buys. The app can request both in
-- parallel.
--
-- Definitions are deliberately identical to buildCarryForwardSummary in
-- lib/prev-year-dues/display.ts, EXCEPT for the two corrections above -- otherwise
-- the numbers would shift under the office for reasons unrelated to the fix:
--
--   currentYearExpected   = sum(base_charge)                        non-carry
--   currentYearCollected  = sum(min(applied_amount, base_charge))   non-carry
--   lateFeePending        = sum(min(final_late_fee, pending))       non-carry
--   currentYearPending    = sum(pending - that late-fee part)       non-carry
--   previousYearOriginal  = sum(base_charge)                        carry-forward
--   previousYearCollected = sum(min(applied_amount, base_charge))   carry-forward
--   previousYearPending   = sum(pending)                            carry-forward
--
-- Carry-forward rows are identified by the is_carry_forward column added to the
-- matview in 20260808140000. Verified against the old label heuristic
-- (installment_no >= 90 or label like 'previous year%balance%') across every row in
-- the database: zero disagreements.

create or replace function public.get_dashboard_fee_split(p_session_label text)
returns table (
  current_year_expected   integer,
  current_year_collected  integer,
  current_year_pending    integer,
  previous_year_original  integer,
  previous_year_collected integer,
  previous_year_pending   integer,
  late_fee_pending        integer
)
language sql
stable
security definer
set search_path = public, private, pg_temp
as $fn$
  with scoped as (
    select
      b.is_carry_forward,
      b.base_charge,
      b.applied_amount,
      b.pending_amount,
      b.final_late_fee
    from public.v_workbook_installment_balances as b
    join public.students as s on s.id = b.student_id
    join public.classes  as c on c.id = b.class_id
    where b.session_label = p_session_label
      and s.status = 'active'
      and c.status = 'active'
  ),
  per_row as (
    select
      is_carry_forward,
      base_charge,
      least(greatest(applied_amount, 0), base_charge) as collected_against_base,
      pending_amount,
      least(greatest(final_late_fee, 0), pending_amount) as late_pending
    from scoped
  )
  select
    coalesce(sum(base_charge)             filter (where not is_carry_forward), 0)::integer,
    coalesce(sum(collected_against_base)  filter (where not is_carry_forward), 0)::integer,
    coalesce(sum(pending_amount - late_pending)
                                          filter (where not is_carry_forward), 0)::integer,
    coalesce(sum(base_charge)             filter (where is_carry_forward), 0)::integer,
    coalesce(sum(collected_against_base)  filter (where is_carry_forward), 0)::integer,
    coalesce(sum(pending_amount)          filter (where is_carry_forward), 0)::integer,
    coalesce(sum(late_pending)            filter (where not is_carry_forward), 0)::integer
  from per_row;
$fn$;

revoke all on function public.get_dashboard_fee_split(text) from public, anon;
grant execute on function public.get_dashboard_fee_split(text) to authenticated;
grant execute on function public.get_dashboard_fee_split(text) to service_role;

comment on function public.get_dashboard_fee_split(text) is
  'Current-year / previous-year / late-fee split for the dashboard, scoped to ACTIVE students and classes so it matches the population every other KPI uses. Replaces a JavaScript fallback that paged every installment row for the session on each render and, in doing so, counted struck-off students and dropped reversal adjustments.';

notify pgrst, 'reload schema';
