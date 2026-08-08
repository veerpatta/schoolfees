-- A student who left owing money still owes it.
--
-- School rule, in the head's words: if a student is marked left and nothing was
-- ever collected from them, their dues are not collected either and come out of
-- expected. But if any amount WAS collected and they then left, the rest of
-- their dues must still be collected.
--
-- Half of that already worked. Withdrawing a student cancels every clean unpaid
-- installment (lib/fees/generator.ts), so a left student who never paid ends up
-- with no live installment rows at all: nothing expected, nothing owed, nothing
-- to chase. Live 2026-27 has 25 such students, 100 cancelled installments
-- between them, contributing exactly zero. Correct already.
--
-- The other half was broken, and by the reporting layer rather than the ledger.
-- Every money figure filtered `record_status = 'active'`, so the three left
-- students who HAD paid — and whose installments were therefore retained, not
-- cancelled — dropped out of expected, collected and pending entirely:
--
--     2174 SIMRAN SONI      base  9,375   paid  7,375   still owed  2,000
--     2268 RIDDHIKA SONI    base 26,875   paid 12,625   still owed 15,250
--     2389 DIKSHITA VERMA   base  5,500   paid  5,500   still owed      0
--
-- Rs 17,250 of collectable money, invisible. Worse, it was invisible in a way
-- that looked deliberate: the ledger held the debt, the dashboard denied it.
--
-- The money scope becomes "active, or has paid something". A non-active student
-- who paid nothing has no dues to report anyway (they were cancelled), so this
-- adds nobody spurious; it only stops hiding the ones who genuinely owe.
--
-- Deliberately NOT changed: total_students stays active-only. A student who has
-- left is not on the roll, however much they owe. Headcount and money are
-- different questions and conflating them is what this whole session has been
-- unpicking.

do $$
declare
  v_src  text;
  v_new  text;
  v_hits int;
  v_from text;
  v_to   text;
begin
  select pg_get_functiondef(p.oid) into v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'get_dashboard_summary';

  if v_src is null then
    raise exception 'get_dashboard_summary not found';
  end if;

  -- The money trio: expected / collected / pending.
  v_from := 'into v_total_expected_fees, v_total_collected, v_total_pending
  from public.v_workbook_student_financials
  where session_label = p_session_label and record_status = ''active'';';
  v_to := 'into v_total_expected_fees, v_total_collected, v_total_pending
  from public.v_workbook_student_financials
  where session_label = p_session_label
    and (record_status = ''active'' or total_paid > 0);';

  v_hits := array_length(string_to_array(v_src, v_from), 1) - 1;
  if v_hits <> 1 then
    raise exception 'Expected exactly 1 money-KPI scope clause, found %', v_hits;
  end if;
  v_new := replace(v_src, v_from, v_to);

  execute v_new;
end;
$$;

-- The split RPC uses the same scope, for the same reason.
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
      and c.status = 'active'
      -- Active, or left/inactive but with money already collected: their
      -- remaining dues are still collectable and must stay visible. A departed
      -- student who never paid has had their installments cancelled, so they
      -- contribute nothing either way.
      and (
        s.status = 'active'
        or exists (
          select 1
          from public.payments p
          join public.receipts r on r.id = p.receipt_id
          where p.student_id = s.id and r.payment_mode <> 'discount'
        )
      )
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
  'Current-year / previous-year / late-fee split for the dashboard. Scope is active students PLUS any departed student who has already paid something, because their remaining dues are still collectable; a departed student who never paid has had their installments cancelled and contributes nothing. Expected is base charges only -- late fee is never folded in.';

-- Prove the three paying leavers are back in scope, and that the 25 who never
-- paid still contribute nothing.
do $$
declare
  v_expected      integer;
  v_expected_only_active integer;
  v_leaver_base   integer;
  v_leaver_owed   integer;
  v_freeloaders   integer;
begin
  select coalesce(sum(base_charge_total), 0)::integer into v_expected
  from public.v_workbook_student_financials
  where session_label = '2026-27' and (record_status = 'active' or total_paid > 0);

  select coalesce(sum(base_charge_total), 0)::integer into v_expected_only_active
  from public.v_workbook_student_financials
  where session_label = '2026-27' and record_status = 'active';

  select coalesce(sum(base_charge_total), 0)::integer,
         coalesce(sum(outstanding_amount), 0)::integer
    into v_leaver_base, v_leaver_owed
  from public.v_workbook_student_financials
  where session_label = '2026-27' and record_status <> 'active' and total_paid > 0;

  select coalesce(sum(base_charge_total), 0)::integer into v_freeloaders
  from public.v_workbook_student_financials
  where session_label = '2026-27' and record_status <> 'active' and total_paid = 0;

  if v_leaver_owed <= 0 then
    raise exception 'Expected departed-but-paid students to still owe something; found %', v_leaver_owed;
  end if;

  if v_expected <> v_expected_only_active + v_leaver_base then
    raise exception 'Scope arithmetic is off: % <> % + %',
      v_expected, v_expected_only_active, v_leaver_base;
  end if;

  if v_freeloaders <> 0 then
    raise exception
      'Departed students who never paid still carry % of expected fee; their installments should have been cancelled on withdrawal',
      v_freeloaders;
  end if;
end;
$$;

notify pgrst, 'reload schema';
