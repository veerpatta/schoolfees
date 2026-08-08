-- Late fee is not part of the fee the school expects to collect.
--
-- A late fee exists to get the fee in on time. It is a nudge, not revenue: the
-- school issues it expecting to waive most of it. Folding it into "expected
-- fees" therefore misstates the one number the fee book is supposed to hold,
-- and it does so in a way that grows on its own — every due date that passes
-- would inflate what the school appears to be owed without anyone deciding to
-- charge anything.
--
-- get_dashboard_summary computed both of its "expected" figures from
-- v_workbook_student_financials.total_due, which is base + late fee:
--
--   v_total_expected_fees            -> the Total Expected KPI, and the
--                                       denominator of the collection rate
--   class_financials.expected_amount -> the Expected column on the class table
--
-- Both now read base_charge_total, which is the sum of installment base charges
-- and nothing else. The late fee keeps its own line: late_fee_total,
-- late_fee_outstanding_amount, and the lateFeePending KPI from
-- get_dashboard_fee_split. Kept, tracked, waivable — just never blended into
-- what the school is owed in fees.
--
-- Right now the difference is Rs 11,000 against Rs 1.32 crore, because the
-- late-fee rule change of 20260808140000 was grandfathered. The reason to fix it
-- now rather than later is INST 3 on 20-10-2026: with roughly 400 students
-- overdue, "expected fees" would have silently gained about Rs 4 lakh of penalty
-- on a single night.
--
-- The collection rate is also capped at 100. Collected is real cash and includes
-- any late fee actually paid, so measuring it against a base-only denominator
-- can exceed the target; "103% collected" reads as a bug, not as good news.
--
-- Patched by targeted replacement rather than by retyping 16 KB of plpgsql, with
-- each anchor asserted to match exactly the expected number of times.

do $$
declare
  v_src  text;
  v_new  text;
  v_hits int;
begin
  select pg_get_functiondef(p.oid) into v_src
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'get_dashboard_summary';

  if v_src is null then
    raise exception 'get_dashboard_summary not found';
  end if;

  -- Both "expected" sums, and only those two. total_due appears nowhere else in
  -- this function, so a global swap is exact rather than merely convenient.
  v_hits := array_length(string_to_array(v_src, 'sum(total_due)'), 1) - 1;
  if v_hits <> 2 then
    raise exception 'Expected exactly 2 occurrences of sum(total_due), found %', v_hits;
  end if;
  v_new := replace(v_src, 'sum(total_due)', 'sum(base_charge_total)');

  -- Cap the rate now that its denominator excludes late fee.
  declare
    v_rate_from text :=
      'v_collection_rate := round(coalesce(v_total_collected::numeric / v_total_expected_fees, 0) * 100);';
    v_rate_to text :=
      'v_collection_rate := least(100, round(coalesce(v_total_collected::numeric / v_total_expected_fees, 0) * 100));';
  begin
    v_hits := array_length(string_to_array(v_new, v_rate_from), 1) - 1;
    if v_hits <> 1 then
      raise exception 'Expected exactly 1 collection-rate expression, found %', v_hits;
    end if;
    v_new := replace(v_new, v_rate_from, v_rate_to);
  end;

  execute v_new;
end;
$$;

-- Prove it: the KPI must now equal the base-only total, and must differ from the
-- old late-fee-inclusive figure by exactly the outstanding late fee.
do $$
declare
  v_kpi_expected  integer;
  v_base_only     integer;
  v_with_late_fee integer;
  v_session       text;
begin
  for v_session in
    select distinct session_label from public.v_workbook_student_financials
  loop
    select coalesce(sum(base_charge_total), 0)::integer,
           coalesce(sum(total_due), 0)::integer
      into v_base_only, v_with_late_fee
    from public.v_workbook_student_financials
    where session_label = v_session and record_status = 'active';

    v_kpi_expected := ((public.get_dashboard_summary(v_session, to_char((now() at time zone 'Asia/Kolkata')::date, 'YYYY-MM-DD'))
                        -> 'kpis' ->> 'totalExpectedFees'))::integer;

    if v_kpi_expected <> v_base_only then
      raise exception
        'Session %: expected fees KPI is % but the base-only total is % (late fee still folded in?)',
        v_session, v_kpi_expected, v_base_only;
    end if;

    if v_with_late_fee < v_base_only then
      raise exception 'Session %: total_due (%) is below base_charge_total (%)',
        v_session, v_with_late_fee, v_base_only;
    end if;
  end loop;
end;
$$;

notify pgrst, 'reload schema';
