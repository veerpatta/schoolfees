-- The dashboard gets a discounts board; this gives the RPC its data.
--
-- Live 2026-27 carries Rs 13,62,600 of tuition discount across 100 students
-- (conventional Rs 13,05,500 + manual Rs 57,100), and no board shows any of
-- it. The office can see what one student's discount is, and the AI bundle
-- exports every row, but "how much are we giving, and under which policy" has
-- no screen.
--
-- The block this adds:
--
--   discounts: {
--     totalDiscount,          -- conventional + manual. NEVER includes close-outs.
--     conventionalDiscount,   -- policy-driven (RTE / Staff Child / 3rd Child)
--     manualDiscount,         -- per-student amounts entered by the office
--     studentsWithDiscount,
--     byPolicy: [{ label, students, amount }],   -- conventional only, grouped
--                                                -- by the applied label set
--     closeouts: { amount, students }            -- discount-mode write-offs,
--                                                -- kept OUT of the totals above
--   }
--
-- Two vocabulary rules, from lib/money/glossary.ts, that this block must not
-- blur:
--
--   * discountTotal "does NOT include close-out write-offs". A close-out is a
--     receipt clearing a pending balance, not a reduction of what was owed, so
--     it is its own sub-object and is never summed into totalDiscount.
--   * Late-fee waivers are not here at all. They stay on the late-fee board,
--     where byWaiverSource already separates the Rs 8,000 a person granted
--     from the Rs 8,50,000 of automatic grandfather/migration rows.
--
-- Population: the money rule, `record_status = 'active' or total_paid > 0`,
-- same as every other board in this function (20260814143056). A student who
-- left still counts here if they paid: their discount shaped what the ledger
-- expected of them.
--
-- byPolicy groups by the view's conventional_discount_labels string — the
-- label SET that actually applied ("Staff Child, 3rd Child Policy" is a real
-- combination in live data). Splitting per-policy from the assignments table
-- instead would double-count every two-policy student, because only the
-- lowest-tuition candidate wins (lib/fees/conventional-discount-rules.ts).
--
-- Patched by string replacement rather than restating the function, so the
-- other ~240 lines cannot drift while one block is added.

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

  if position('''discounts''' in v_src) > 0 then
    raise exception 'get_dashboard_analytics already carries a discounts block; this migration would double it.';
  end if;

  v_new := v_src;

  -- 1. The discount CTEs, appended after `concentration` (the last CTE).
  v_from := '    ) as data
    from ranked
  )

  select jsonb_build_object(';
  v_to := '    ) as data
    from ranked
  ),

  -- ── How much is the school giving away, and under which policy? ─────────
  -- Money rule, like every board here. Close-outs are carried separately and
  -- never summed into the discount totals: a close-out clears a pending
  -- balance, it does not reduce what was owed.
  discount_rows as (
    select
      coalesce(f.discount_amount, 0)::bigint              as discount_amount,
      coalesce(f.conventional_discount_amount, 0)::bigint as conventional_amount,
      coalesce(f.student_discount_amount, 0)::bigint      as manual_amount,
      nullif(trim(coalesce(f.conventional_discount_labels, '''')), '''') as labels,
      coalesce(f.total_discount_closeouts, 0)::bigint     as closeout_amount
    from public.v_workbook_student_financials f
    where f.session_label = p_session_label
      and (f.record_status = ''active'' or coalesce(f.total_paid, 0) > 0)
  ),
  discount_totals as (
    select
      coalesce(sum(discount_amount), 0)::bigint     as total,
      coalesce(sum(conventional_amount), 0)::bigint as conventional,
      coalesce(sum(manual_amount), 0)::bigint       as manual,
      count(*) filter (where discount_amount > 0)::integer as students_with_discount,
      coalesce(sum(closeout_amount), 0)::bigint     as closeouts,
      count(*) filter (where closeout_amount > 0)::integer as students_with_closeout
    from discount_rows
  ),
  discount_policies as (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        ''label'',    label,
        ''students'', students,
        ''amount'',   amount
      ) order by amount desc, label
    ), ''[]''::jsonb) as data
    from (
      select labels as label,
             count(*)::integer as students,
             sum(conventional_amount)::bigint as amount
      from discount_rows
      where labels is not null
        and conventional_amount > 0
      group by labels
    ) as policy_rollup
  ),
  discounts as (
    select jsonb_build_object(
      ''totalDiscount'',        discount_totals.total,
      ''conventionalDiscount'', discount_totals.conventional,
      ''manualDiscount'',       discount_totals.manual,
      ''studentsWithDiscount'', discount_totals.students_with_discount,
      ''byPolicy'',             discount_policies.data,
      ''closeouts'', jsonb_build_object(
        ''amount'',   discount_totals.closeouts,
        ''students'', discount_totals.students_with_closeout
      )
    ) as data
    from discount_totals, discount_policies
  )

  select jsonb_build_object(';
  if position(v_from in v_new) = 0 then
    raise exception 'the concentration CTE tail no longer matches; re-read get_dashboard_analytics and update this migration rather than forcing it.';
  end if;
  v_new := replace(v_new, v_from, v_to);

  -- 2. The key in the payload.
  v_from := '''concentration'',     concentration.data
  )';
  v_to := '''concentration'',     concentration.data,
    ''discounts'',         discounts.data
  )';
  if position(v_from in v_new) = 0 then
    raise exception 'the payload key list no longer matches; re-read get_dashboard_analytics and update this migration rather than forcing it.';
  end if;
  v_new := replace(v_new, v_from, v_to);

  -- 3. The CTE in the final FROM.
  v_from := 'monthly, class_recovery, route_recovery, concentration;';
  v_to := 'monthly, class_recovery, route_recovery, concentration, discounts;';
  if position(v_from in v_new) = 0 then
    raise exception 'the final FROM list no longer matches; re-read get_dashboard_analytics and update this migration rather than forcing it.';
  end if;
  v_new := replace(v_new, v_from, v_to);

  if v_new = v_src then
    raise exception 'discounts patch produced no change';
  end if;

  execute v_new;
end;
$$;

-- Prove it took, and prove the numbers reconcile — not just that text changed.
do $$
declare
  v_payload jsonb;
  v_expected_total bigint;
  v_expected_conventional bigint;
  v_expected_manual bigint;
  v_label text;
begin
  -- The RPC gates on has_any_permission unless the caller is the service role,
  -- and a migration runs as postgres with no JWT at all. Claim the service
  -- role for THIS transaction only (`is_local => true`), which is exactly what
  -- auth.role() reads. Without this the assertion — and therefore db push —
  -- dies on the RPC's own permission check.
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  -- Any session with students works for the identity checks; use the label the
  -- live project actually has so the assertion means something. On an empty
  -- database (fresh clone) every side is zero and the identities still hold.
  select session_label into v_label
  from public.v_workbook_student_financials
  group by session_label
  order by count(*) desc
  limit 1;

  if v_label is null then
    return; -- empty database: nothing to reconcile against
  end if;

  v_payload := public.get_dashboard_analytics(v_label);

  if v_payload->'discounts' is null then
    raise exception 'get_dashboard_analytics(%) returned no discounts block', v_label;
  end if;

  select
    coalesce(sum(coalesce(discount_amount, 0)), 0),
    coalesce(sum(coalesce(conventional_discount_amount, 0)), 0),
    coalesce(sum(coalesce(student_discount_amount, 0)), 0)
  into v_expected_total, v_expected_conventional, v_expected_manual
  from public.v_workbook_student_financials
  where session_label = v_label
    and (record_status = 'active' or coalesce(total_paid, 0) > 0);

  if (v_payload->'discounts'->>'totalDiscount')::bigint <> v_expected_total then
    raise exception 'discounts.totalDiscount % does not reconcile to the view''s %',
      v_payload->'discounts'->>'totalDiscount', v_expected_total;
  end if;

  -- The reconciling identity the whole board rests on.
  if (v_payload->'discounts'->>'conventionalDiscount')::bigint
     + (v_payload->'discounts'->>'manualDiscount')::bigint
     <> v_expected_total then
    raise exception 'conventional + manual does not equal totalDiscount';
  end if;

  if v_expected_conventional <> (v_payload->'discounts'->>'conventionalDiscount')::bigint then
    raise exception 'conventionalDiscount does not reconcile to the view';
  end if;

  if v_expected_manual <> (v_payload->'discounts'->>'manualDiscount')::bigint then
    raise exception 'manualDiscount does not reconcile to the view';
  end if;

  -- byPolicy must total the conventional side exactly: it is a breakdown of
  -- it, not a second measurement.
  if coalesce((
    select sum((entry->>'amount')::bigint)
    from jsonb_array_elements(v_payload->'discounts'->'byPolicy') as entry
  ), 0) <> v_expected_conventional then
    raise exception 'byPolicy amounts do not sum to conventionalDiscount';
  end if;
end;
$$;

comment on function public.get_dashboard_analytics(text) is
  'The six dashboard boards. Every board counts students under the money rule (active OR has paid something, 20260814143056) and counts previous-year carry-forward dues as money owed (20260815094500). The one exception is next_accrual, which excludes carry-forward because those rows never accrue a late fee. The discounts block (20260818050000) carries tuition discounts only: close-outs ride separately inside it and late-fee waivers stay on the late-fee board. Headcount stays active-only and lives in get_dashboard_summary.';

commit;
