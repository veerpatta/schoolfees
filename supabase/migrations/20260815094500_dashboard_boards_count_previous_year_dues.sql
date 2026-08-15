-- The class board and the route board disagreed by exactly one year's old money.
--
-- 20260814143056 gave route_rows the money population, which fixed who was
-- counted. It did not touch WHAT was counted, and there the two boards still
-- differ: route_rows reads the per-student rollup, whose outstanding_amount
-- includes balances carried forward from last session, while class_rows reads
-- `scoped` with `where not is_carry_forward` and so shows this year's
-- installments only.
--
-- Live 2026-27, the same screen therefore said both:
--
--   class board   Rs 99,99,641
--   route board   Rs 1,06,12,816   <- and so does the money band above them
--
-- The gap is Rs 6,13,175 to the rupee: 56 carry-forward rows across 56
-- students. Neither number is labelled, so a reader comparing the two boards
-- sees a discrepancy rather than a difference of definition.
--
-- Two more places carry the same exclusion and must move with it:
--
--   per_student   feeds `concentration`, whose totalPending is currently equal
--                 to the class board total. Fixing class_rows alone would put a
--                 fresh contradiction in the same payload.
--   aged          feeds `debt_age`. A carry-forward row is the oldest debt the
--                 school has; leaving it out understates the 90+ bucket, which
--                 is the one the chart exists to show.
--
-- Deliberately NOT changed: next_accrual keeps `and not s.is_carry_forward`.
-- That one is correct and stays. A carry-forward row carries a late fee rate of
-- 0 on purpose, so it can never contribute to a future accrual -- verified live,
-- where carry-forward late_fee_pending sums to 0.
--
-- Nothing here touches the fees/late-fee split. `pending_amount` is still fees
-- only, and carry-forward rows add no late fee, so late_fee_pending on the class
-- board is unchanged.
--
-- Expected effect on live 2026-27:
--   class board fees pending   99,99,641 -> 1,06,12,816  (= route board, = money band)
--   class board expected      1,25,12,700 -> 1,33,80,400  (= totalExpectedFees)
--   debt_age overdue total       43,04,354 ->   49,17,529
--   concentration totalPending   99,99,641 -> 1,06,12,816
--
-- Patched by string replacement rather than restating the function, so the other
-- ~230 lines cannot drift while these three predicates are corrected.

begin;

do $$
declare
  v_src text;
  v_new text;
  v_from text;
  v_to   text;
begin
  select pg_get_functiondef(p.oid) into v_src
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'get_dashboard_analytics';

  if v_src is null then
    raise exception 'public.get_dashboard_analytics not found';
  end if;

  v_new := v_src;

  -- 1. debt_age: the oldest debt belongs in the aging chart.
  v_from := 'from scoped
    where pending_amount > 0
      and due_date < current_date
      and not is_carry_forward
  ),';
  v_to := 'from scoped
    where pending_amount > 0
      and due_date < current_date
  ),';
  if position(v_from in v_new) = 0 then
    raise exception 'aged no longer matches its expected carry-forward filter; re-read get_dashboard_analytics and update this migration rather than forcing it.';
  end if;
  v_new := replace(v_new, v_from, v_to);

  -- 2. class_rows: the class board counts the same money as the route board.
  v_from := 'from scoped
    where not is_carry_forward
    group by class_id, class_label';
  v_to := 'from scoped
    group by class_id, class_label';
  if position(v_from in v_new) = 0 then
    raise exception 'class_rows no longer matches its expected carry-forward filter; re-read get_dashboard_analytics and update this migration rather than forcing it.';
  end if;
  v_new := replace(v_new, v_from, v_to);

  -- 3. per_student: concentration must total the same as the class board.
  v_from := 'from scoped
    where not is_carry_forward
    group by student_id';
  v_to := 'from scoped
    group by student_id';
  if position(v_from in v_new) = 0 then
    raise exception 'per_student no longer matches its expected carry-forward filter; re-read get_dashboard_analytics and update this migration rather than forcing it.';
  end if;
  v_new := replace(v_new, v_from, v_to);

  if v_new = v_src then
    raise exception 'carry-forward patch produced no change';
  end if;

  execute v_new;
end;
$$;

-- Prove it took, rather than trusting the replace.
do $$
declare
  v_src text;
  v_remaining integer;
begin
  select pg_get_functiondef(p.oid) into v_src
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'get_dashboard_analytics';

  -- Exactly one carry-forward exclusion should survive: next_accrual's.
  v_remaining := (length(v_src) - length(replace(v_src, 'is_carry_forward', ''))) / length('is_carry_forward');

  if v_remaining <> 1 then
    raise exception
      'expected exactly 1 remaining is_carry_forward reference (next_accrual), found %', v_remaining;
  end if;

  if position('and not s.is_carry_forward' in v_src) = 0 then
    raise exception 'next_accrual lost its carry-forward exclusion; it must keep it';
  end if;
end;
$$;

comment on function public.get_dashboard_analytics(text) is
  'The five dashboard boards. Every board counts students under the money rule (active OR has paid something, 20260814143056) and counts previous-year carry-forward dues as money owed (20260815094500). The one exception is next_accrual, which excludes carry-forward because those rows never accrue a late fee. Headcount stays active-only and lives in get_dashboard_summary.';

commit;
