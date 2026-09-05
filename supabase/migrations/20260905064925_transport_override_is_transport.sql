-- A transport override IS transport. It gets its own bucket, not "No transport".
--
-- Transport is charged two ways: a transport_routes row on the student, or
-- student_fee_overrides.custom_transport_fee_amount with no route at all.
-- v_workbook_student_financials.transport_fee already honours both, so every
-- money figure was right. What was wrong is every place that GROUPED or
-- LABELLED by route: get_dashboard_analytics' route board keyed on
-- transport_route_id and filed the override students under a bucket literally
-- named 'No transport' while summing their transport charge into it. The
-- TypeScript route rollup on the dashboard dropped them altogether. The
-- reports, the receipt header, the defaulter warning rows and the transactions
-- list called buildTransportRouteLabel with a route and no amount, so the
-- label helper fell through to "No transport" beside a Rs 14,000 charge.
--
-- This migration is the SQL half. The route board learns a third bucket,
-- 'Custom amount (no route)', keyed 'custom' so the app can filter on it, and
-- the students-with-a-route rows keep their ids. The dead
-- v_transport_route_outstanding view -- which bucketed the same students as
-- 'unassigned' and has no caller in src/, workers/ or scripts/ -- is dropped
-- rather than taught the new bucket.
--
-- get_dashboard_analytics is patched by string replacement of its own
-- definition, the same way 20260814143056 and 20260815094500 did it, so the
-- other ~230 lines cannot drift while one CTE is corrected. Every anchor is
-- asserted before the replace and the result is asserted after it.

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

  -- (a) The label: a real route name, else the custom bucket when the student
  -- is charged transport with no route, else -- and only then -- no transport.
  v_from := '      coalesce(
        nullif(trim(coalesce(f.transport_route_name, '''')), ''''),
        ''No transport''
      )                                                        as route_label,';
  v_to := '      case
        when nullif(trim(coalesce(f.transport_route_name, '''')), '''') is not null
          then trim(f.transport_route_name)
        -- Charged transport through student_fee_overrides with no route: a
        -- real bucket, not "No transport". Mirrors CUSTOM_TRANSPORT_BUCKET_LABEL
        -- in src/modules/fees/domain/label.ts.
        when coalesce(f.transport_fee, 0) > 0
          then ''Custom amount (no route)''
        else ''No transport''
      end                                                      as route_label,';

  if position(v_from in v_src) = 0 then
    raise exception
      'route_rows route_label no longer matches the expected expression; get_dashboard_analytics has changed. Re-read the function and update this migration rather than forcing it.';
  end if;
  v_new := replace(v_src, v_from, v_to);

  -- (b) A stable key for the bucket so the app can filter on it. Route rows
  -- keep their id; the custom bucket is 'custom'; the rest 'none'.
  v_from := '        ''routeId'',         route_id,
        ''routeLabel'',      route_label,';
  v_to := '        ''routeId'',         route_id,
        ''routeKey'',        coalesce(route_id::text,
                              case when route_label = ''Custom amount (no route)''
                                   then ''custom'' else ''none'' end),
        ''routeLabel'',      route_label,';

  if position(v_from in v_new) = 0 then
    raise exception
      'route_recovery jsonb_build_object no longer matches the expected shape; get_dashboard_analytics has changed. Re-read the function and update this migration rather than forcing it.';
  end if;
  v_new := replace(v_new, v_from, v_to);

  if v_new = v_src then
    raise exception 'transport override patch produced no change';
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
  where n.nspname = 'public'
    and p.proname = 'get_dashboard_analytics';

  if position('''Custom amount (no route)''' in v_src) = 0 then
    raise exception 'get_dashboard_analytics does not carry the custom transport bucket after patching';
  end if;

  if position('''routeKey''' in v_src) = 0 then
    raise exception 'get_dashboard_analytics does not carry routeKey after patching';
  end if;
end;
$$;

-- Dead since the route board moved into get_dashboard_analytics. No caller in
-- src/, workers/ or scripts/, and it bucketed override students as
-- 'unassigned'. Gone rather than taught a third bucket nobody would read.
drop view if exists public.v_transport_route_outstanding;

notify pgrst, 'reload schema';

commit;
