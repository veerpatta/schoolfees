-- The route board counted a different set of students from every other board
-- beside it.
--
-- get_dashboard_analytics opens with a `scoped` CTE that applies the school's
-- money rule -- a student is in financial scope if they are active OR have paid
-- something (20260808210000) -- and debt_age, late_fee, class_rows and
-- concentration all read from it. route_rows does not. It reads
-- v_workbook_student_financials directly and filters `record_status = 'active'`,
-- which is the headcount rule, not the money rule.
--
-- So inside one response the class board and the route board disagreed about
-- both students and rupees, and neither the Dashboard nor the MCP server said
-- why. Live 2026-27: the class rows carry 3 students who left after paying and
-- still owe Rs 16,250 between them; the route rows silently dropped all three.
--
-- The fix is to give route_rows the same population as everything else. It still
-- reads the per-student rollup rather than `scoped` -- that is deliberate, and
-- the existing comment explains it: one row per student means the student count
-- is a plain count instead of a count(distinct) over installment rows. Only the
-- filter changes.
--
-- Deliberately NOT changed: total_students in get_dashboard_summary stays
-- active-only. Headcount and money are different questions and this migration
-- does not blur them -- it only stops one money board answering the headcount
-- question by accident.
--
-- The function is replaced by string-patching its own definition rather than
-- being restated in full, so the other ~230 lines cannot drift while this one
-- predicate is corrected.

begin;

do $$
declare
  v_src  text;
  v_new  text;
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

  v_from := 'from public.v_workbook_student_financials f
    where f.session_label = p_session_label
      and f.record_status = ''active''
    group by f.transport_route_id, 2';

  v_to := 'from public.v_workbook_student_financials f
    where f.session_label = p_session_label
      -- The money rule, matching the `scoped` CTE that feeds every other board
      -- in this function: a student who left owing money still owes it.
      and (f.record_status = ''active'' or coalesce(f.total_paid, 0) > 0)
    group by f.transport_route_id, 2';

  if position(v_from in v_src) = 0 then
    raise exception
      'route_rows no longer matches the expected active-only filter; get_dashboard_analytics has changed. Re-read the function and update this migration rather than forcing it.';
  end if;

  v_new := replace(v_src, v_from, v_to);

  if v_new = v_src then
    raise exception 'route_rows patch produced no change';
  end if;

  execute v_new;
end;
$$;

-- Prove it took, rather than trusting the replace.
do $$
declare
  v_src text;
begin
  select pg_get_functiondef(p.oid) into v_src
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'get_dashboard_analytics';

  if position('or coalesce(f.total_paid, 0) > 0' in v_src) = 0 then
    raise exception 'route_rows is still on the active-only filter after patching';
  end if;
end;
$$;

comment on function public.get_dashboard_analytics(text) is
  'The five dashboard boards. Every board — including route recovery since 20260814143056 — counts students under the money rule: active OR has paid something. Headcount stays active-only and lives in get_dashboard_summary.';

commit;
