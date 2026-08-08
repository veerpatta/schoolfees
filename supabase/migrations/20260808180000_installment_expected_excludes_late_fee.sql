-- The per-installment "Expected" was still base + late fee.
--
-- 20260808170000 took late fee out of the two student-level expected figures
-- (the Total Expected KPI and the class table) but missed a third: the
-- installment summary that drives the four installment cards and the
-- class-by-installment matrix computed expectedAmount as sum(total_charge),
-- and total_charge is base_charge + final_late_fee.
--
-- Same rule, same reason: a late fee is a nudge to pay on time, mostly waived,
-- and it is not part of what the school expects to collect. It stays visible on
-- its own lines (late_fee_total, late_fee_outstanding_amount, the lateFeePending
-- KPI) and never inside an "expected" figure.
--
-- Note the JavaScript builder in lib/dashboard/summary.ts already had this
-- right — it accumulates row.baseCharge — so the two paths disagreed. They
-- agree now.
--
-- The other two sum(total_charge) uses in this function are left alone on
-- purpose: they compute what a student still OWES, which legitimately includes
-- an unwaived late fee. Owed and expected are different questions.

do $$
declare
  v_src  text;
  v_new  text;
  v_hits int;
  v_from text := 'sum(total_charge)::integer as "expectedAmount"';
  v_to   text := 'sum(base_charge)::integer as "expectedAmount"';
begin
  select pg_get_functiondef(p.oid) into v_src
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'get_dashboard_summary';

  if v_src is null then
    raise exception 'get_dashboard_summary not found';
  end if;

  v_hits := array_length(string_to_array(v_src, v_from), 1) - 1;
  if v_hits <> 1 then
    raise exception 'Expected exactly 1 installment expectedAmount using total_charge, found %', v_hits;
  end if;

  v_new := replace(v_src, v_from, v_to);
  execute v_new;
end;
$$;

-- No "expected" anywhere in this function may be derived from a late-fee-
-- inclusive total again.
do $$
declare
  v_src text;
begin
  select pg_get_functiondef(p.oid) into v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'get_dashboard_summary';

  if v_src like '%sum(total_due)%' then
    raise exception 'An expected figure still reads sum(total_due)';
  end if;
  if v_src like '%sum(total_charge)::integer as "expectedAmount"%' then
    raise exception 'An expected figure still reads sum(total_charge)';
  end if;
end;
$$;

-- And prove it against real rows: every installment card's expected must equal
-- the base charge for that installment, late fee excluded.
do $$
declare
  v_session   text;
  v_kpi       integer;
  v_base_only integer;
begin
  for v_session in select distinct session_label from public.v_workbook_installment_balances loop
    select coalesce(sum((entry ->> 'expectedAmount')::integer), 0)
      into v_kpi
    from jsonb_array_elements(
           (public.get_dashboard_summary(
              v_session,
              to_char((now() at time zone 'Asia/Kolkata')::date, 'YYYY-MM-DD')
            ) -> 'installmentSummary')::jsonb
         ) as entry;

    -- Compared unfiltered on purpose: the installment summary in this function
    -- does not scope to active students (unlike the student-level KPIs beside
    -- it). That inconsistency is real and pre-dates this change; conflating it
    -- with the late-fee question here would just make both harder to see. What
    -- is being asserted is only that the figure is base charges and nothing
    -- else.
    select coalesce(sum(b.base_charge), 0)::integer
      into v_base_only
    from public.v_workbook_installment_balances b
    where b.session_label = v_session;

    if v_kpi <> v_base_only then
      raise exception
        'Session %: installment expected totals % but base charges total % (late fee still folded in?)',
        v_session, v_kpi, v_base_only;
    end if;
  end loop;
end;
$$;

notify pgrst, 'reload schema';
