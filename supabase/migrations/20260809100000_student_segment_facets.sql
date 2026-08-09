-- One queryable facet surface per student, so filters and their counts agree.
--
-- Staff could not filter the roll by anything that mattered. Students offered
-- search / session / class / route / status; everything else a clerk needs to
-- slice by -- who carries an old balance from last year, who is overdue, who
-- left still owing, whose dues were never prepared, who is on transport, who
-- holds an RTE or staff-child discount -- was computed, rendered on the row,
-- and then unreachable.
--
-- There was a structural reason. The students list picks a page of 40 identities
-- FIRST and only then enriches them with money in a second pass scoped to those
-- 40 ids. A dues filter applied on top would have filtered inside the page while
-- the header count kept reporting the unfiltered total. This view collapses that
-- into one relation so a predicate and its COUNT come from the same query.
--
-- Regular views, not materialized, on purpose. Both heavy inputs
-- (v_workbook_student_financials, v_workbook_installment_balances) are ALREADY
-- materialized with unique indexes; at ~540 students this is a join over
-- pre-computed rows and costs single-digit milliseconds. A third matview would
-- add a second staleness layer on top of the existing 2-minute refresh queue and
-- would have to be sequenced inside refresh_financial_materialized_views -- real
-- risk, no measurable win. Counts therefore inherit the same ~2-minute lag as the
-- Dashboard and Defaulters, which keeps those surfaces agreeing with each other.
--
-- PREDICATE PARITY IS THE WHOLE RISK. Every seg_* below mirrors an existing
-- TypeScript predicate. Where the TS has a quirk, the SQL reproduces the quirk --
-- see the notes on overdue_base_amount. A filter that disagrees with the number
-- printed on the row it filters is worse than no filter.
--
-- Purely additive: three views, two functions, two indexes. No DROP, no CASCADE,
-- no data change. Rollback is six statements.

-- ---------------------------------------------------------------------------
-- Indexes. The installment matview is joined per-student for the first time
-- here; today it carries only (installment_id) unique and (session_label).
-- ---------------------------------------------------------------------------

create index if not exists idx_v_workbook_installments_student
  on public.v_workbook_installment_balances (student_id);

create index if not exists idx_v_workbook_installments_student_carry
  on public.v_workbook_installment_balances (student_id)
  where is_carry_forward;

-- ---------------------------------------------------------------------------
-- 1. Per-student installment rollups the financials matview does not carry.
-- ---------------------------------------------------------------------------

create or replace view public.v_student_installment_facets
with (security_invoker = true) as
select
  b.student_id,
  b.session_label,
  count(*)::integer                                      as installment_count,
  count(*) filter (where b.waiver_applied > 0)::integer  as late_fee_waived_count,

  -- The old-balance figure. Defaulters computes this in TypeScript by iterating
  -- every installment row (lib/defaulters/data.ts); this is the same sum, once,
  -- in SQL, so Students, Transactions and Defaulters can finally share it.
  coalesce(sum(b.pending_amount) filter (where b.is_carry_forward), 0)::integer
                                                         as carry_forward_pending_amount,
  coalesce(sum(b.base_charge) filter (where b.is_carry_forward), 0)::integer
                                                         as carry_forward_original_amount,

  -- Mirrors calculateOverdueBaseAmount + calculateInstallmentBasePending
  -- (lib/fees/due-amounts.ts). TWO QUIRKS ARE PRESERVED DELIBERATELY so that no
  -- number already on screen moves as a side effect of adding a filter:
  --   * paid and adjustment are clamped at zero INDIVIDUALLY, which drops a
  --     negative reversal adjustment. This is the same defect that
  --     20260808160000 documented and corrected for the dashboard. Correcting it
  --     here would shift the Overdue figure for roughly 19 rows; that belongs in
  --     its own commit with a before/after diff, not buried in a filter change.
  --   * discount_closeout_amount is not netted, though base_outstanding_amount
  --     on the financials matview does net it.
  coalesce(sum(
    greatest(b.base_charge - greatest(b.paid_amount, 0) - greatest(b.adjustment_amount, 0), 0)
  ) filter (where b.balance_status = 'overdue'), 0)::integer as overdue_base_amount,

  -- Mirrors calculatePendingLateFeeAmount (lib/fees/due-amounts.ts:40-45).
  coalesce(sum(
    least(greatest(b.final_late_fee, 0), greatest(b.pending_amount, 0))
  ), 0)::integer                                         as pending_late_fee_amount
from public.v_workbook_installment_balances as b
group by b.student_id, b.session_label;

comment on view public.v_student_installment_facets is
  'Per-student installment rollups that v_workbook_student_financials does not expose -- notably the previous-year carry-forward balance. Mirrors the TypeScript helpers in lib/fees/due-amounts.ts, including their existing rounding quirks, so filters agree with the figures already rendered.';

-- ---------------------------------------------------------------------------
-- 2. Conventional discount policies as queryable codes.
--
-- The financials matview carries only a joined display string, so "students on
-- RTE" was not answerable. conventional_discount_policies.code is a checked
-- enum: rte | staff_child | third_child.
-- ---------------------------------------------------------------------------

create or replace view public.v_student_conventional_discounts
with (security_invoker = true) as
select
  a.student_id,
  a.academic_session_label as session_label,
  array_agg(p.code order by p.sort_order, p.code)                        as policy_codes,
  string_agg(p.display_name, ', ' order by p.sort_order, p.display_name) as policy_labels
from public.student_conventional_discount_assignments as a
join public.conventional_discount_policies as p on p.id = a.policy_id
where a.is_active
group by a.student_id, a.academic_session_label;

comment on view public.v_student_conventional_discounts is
  'Active conventional discount assignments per student as an array of policy codes (rte / staff_child / third_child), so each policy is individually filterable rather than only as a joined label string.';

-- ---------------------------------------------------------------------------
-- 3. The directory. One row per student, every segment a seg_* boolean.
--
-- Naming every segment seg_<id> lets the TypeScript layer address columns by
-- string from a single definition table, with no per-segment SQL and no way for
-- the two to drift silently -- a test asserts every SegmentDef.column exists here.
-- ---------------------------------------------------------------------------

create or replace view public.v_student_directory
with (security_invoker = true) as
select
  s.id                            as student_id,
  s.admission_no,
  s.full_name,
  s.date_of_birth,
  s.father_name,
  s.mother_name,
  s.primary_phone,
  s.secondary_phone,
  s.status                        as record_status,
  s.class_id,
  s.transport_route_id,
  s.updated_at,
  s.photo_path,
  c.session_label,
  c.status                        as class_status,
  c.sort_order                    as class_sort_order,

  -- Mirrors buildClassLabel in lib/students/data.ts:184-199 -- NOT
  -- private.normalize_workbook_class_label, which the workbook matview uses and
  -- which produces a different string. The list renders this one.
  array_to_string(array_remove(array[
    nullif(btrim(c.class_name), ''),
    case
      when nullif(btrim(coalesce(c.section, '')), '') is not null
      then 'Section ' || btrim(c.section)
    end,
    nullif(btrim(coalesce(c.stream_name, '')), '')
  ], null), ' - ')                as class_label,

  -- ── money & dues ─────────────────────────────────────────────────────────
  coalesce(f.status_label, '')                        as status_label,
  coalesce(f.outstanding_amount, 0)                   as outstanding_amount,
  coalesce(f.base_outstanding_amount, 0)              as base_outstanding_amount,
  coalesce(f.late_fee_outstanding_amount, 0)          as late_fee_outstanding_amount,
  coalesce(i.carry_forward_pending_amount, 0)         as old_balance_amount,
  coalesce(i.overdue_base_amount, 0)                  as overdue_base_amount,
  coalesce(i.pending_late_fee_amount, 0)              as pending_late_fee_amount,
  coalesce(f.total_paid, 0)                           as total_paid,
  coalesce(f.base_charge_total, 0)                    as base_charge_total,
  f.last_payment_date,

  (coalesce(i.carry_forward_pending_amount, 0) > 0)   as seg_old_balance_due,
  (coalesce(f.status_label, '') = 'OVERDUE')          as seg_overdue,
  (coalesce(f.late_fee_outstanding_amount, 0) > 0)    as seg_late_fee_pending,
  (coalesce(f.status_label, '') = 'PARTLY PAID')      as seg_partly_paid,
  (coalesce(f.status_label, '') = 'PAID')             as seg_fully_paid,
  (coalesce(f.status_label, '') = 'NOT STARTED')      as seg_never_paid,
  (coalesce(f.outstanding_amount, 0) > 0)             as seg_has_dues,

  -- ── enrolment ────────────────────────────────────────────────────────────
  (s.status = 'active')                               as seg_active,
  (s.status = 'left')                                 as seg_left,
  (s.status = 'graduated')                            as seg_graduated,
  -- The rule settled in 20260808210000: a leaver who never paid had their unpaid
  -- installments cancelled on withdrawal and owes nothing; a leaver who HAD paid
  -- keeps the rest of their dues and must still be chased.
  (s.status <> 'active' and coalesce(f.outstanding_amount, 0) > 0) as seg_left_owing,
  coalesce(f.student_status_label, 'Old')             as student_status_label,
  (coalesce(f.student_status_label, 'Old') = 'New')   as seg_new_this_year,

  -- ── data quality ─────────────────────────────────────────────────────────
  (coalesce(nullif(btrim(coalesce(s.primary_phone, '')), ''),
            nullif(btrim(coalesce(s.secondary_phone, '')), '')) is null)
                                                      as seg_missing_phone,
  (coalesce(i.installment_count, 0) = 0)              as seg_dues_not_prepared,
  coalesce(f.missing_dob_flag, s.date_of_birth is null) as seg_missing_dob,
  coalesce(f.duplicate_sr_flag, false)                as seg_duplicate_sr,
  -- Mirrors isPendingAdmissionNo in lib/students/constants.ts.
  (upper(btrim(coalesce(s.admission_no, ''))) like 'PENDING-%') as seg_pending_sr,

  -- ── fee profile ──────────────────────────────────────────────────────────
  -- Mirrors hasTransport in lib/transport/label.ts: a real route (the sentinel
  -- row literally named "No Transport" is not one) OR a charged amount. This is
  -- why the count is 286 and not 292.
  ((r.route_name is not null and lower(btrim(r.route_name)) <> 'no transport')
   or coalesce(f.transport_fee, 0) > 0)               as seg_on_transport,
  coalesce(f.transport_fee, 0)                        as transport_fee,
  r.route_name                                        as transport_route_name,
  r.route_code                                        as transport_route_code,
  coalesce(f.discount_amount, 0)                      as discount_amount,
  (coalesce(f.discount_amount, 0) > 0)                as seg_has_discount,
  coalesce(d.policy_codes, '{}'::text[])              as conventional_policy_codes,
  d.policy_labels                                     as conventional_discount_labels,
  ('rte'         = any(coalesce(d.policy_codes, '{}'::text[]))) as seg_discount_rte,
  ('staff_child' = any(coalesce(d.policy_codes, '{}'::text[]))) as seg_discount_staff_child,
  ('third_child' = any(coalesce(d.policy_codes, '{}'::text[]))) as seg_discount_third_child,

  -- Mirrors hasFeeException in lib/students/data.ts:1048-1055.
  --
  -- NOTE ON RLS: this view is security_invoker, and the read policy on
  -- student_fee_overrides is has_permission('fees:view') -- strictly narrower
  -- than the policy on students. A teacher therefore gets a NULL join here and
  -- reads false. That is exactly what happens today (getStudentsPageUncached
  -- queries the same table directly), so it is not a regression -- but it IS why
  -- the fee-profile chips must be gated on fees:view in the UI rather than shown
  -- as zeros.
  (o.id is not null and (
       o.custom_tuition_fee_amount is not null
    or o.custom_transport_fee_amount is not null
    or coalesce(o.discount_amount, 0) > 0
    or coalesce(o.late_fee_waiver_amount, 0) > 0
    or o.other_adjustment_amount is not null
    or nullif(btrim(coalesce(o.other_adjustment_head, '')), '') is not null))
                                                      as seg_fee_exception,
  (o.id is not null)                                  as has_fee_profile,
  (coalesce(i.late_fee_waived_count, 0) > 0)          as seg_late_fee_waived,

  -- ── search ───────────────────────────────────────────────────────────────
  -- The search box has always promised "name, SR no, or phone" and the
  -- client-side pass honoured it, while the server matched full_name only -- so
  -- typing an SR number showed a match that vanished on the round trip. One
  -- lowercased haystack makes the server at least as wide as the promise.
  lower(concat_ws(' ',
    s.full_name, s.admission_no,
    c.class_name, c.section, c.stream_name,
    s.primary_phone, s.secondary_phone,
    s.father_name, s.mother_name
  ))                                                  as search_text
from public.students as s
join public.classes as c
  on c.id = s.class_id
left join public.transport_routes as r
  on r.id = s.transport_route_id
left join public.v_workbook_student_financials as f
  on f.student_id = s.id
left join public.v_student_installment_facets as i
  on i.student_id = s.id
left join public.v_student_conventional_discounts as d
  on d.student_id = s.id and d.session_label = c.session_label
left join public.student_fee_overrides as o
  on o.student_id = s.id and o.is_active;

comment on view public.v_student_directory is
  'One row per student with every filterable segment exposed as a seg_* boolean, plus a lowercased search_text. The single source both Students and Transactions filter against, so a predicate and its COUNT come from the same query. security_invoker: fee-profile columns read false for staff without fees:view, matching existing behaviour -- gate those chips on the permission rather than showing zeros.';

-- ---------------------------------------------------------------------------
-- 4. Segment counts, in one round trip.
--
-- Scoping rule, which matters more than it looks: counts are scoped by the
-- STRUCTURAL filters (session / class / route / search) plus the ENROLMENT
-- family, and the three attribute families never scope each other or themselves.
--
-- Scope by everything and every unselected chip inside a family reads zero,
-- because the status buckets are mutually exclusive -- select "Overdue" and
-- "Fully paid" reads 0, which looks like a broken filter. Enrolment is the
-- population axis, so "419 of the 509 active" is the model staff already hold;
-- enrolment chips get their own un-status-scoped counts from a second CTE,
-- still one round trip.
--
-- security invoker (the default): this returns aggregates only, and invoker
-- keeps RLS honest for the caller.
-- ---------------------------------------------------------------------------

create or replace function public.get_student_segment_counts(
  p_session_label       text,
  p_class_id            uuid    default null,
  p_route_id            uuid    default null,
  p_query               text    default null,
  p_statuses            text[]  default null,
  p_active_classes_only boolean default true
)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $fn$
  with population as (
    select d.*
    from public.v_student_directory as d
    where d.session_label = p_session_label
      and (not p_active_classes_only or d.class_status = 'active')
      and (p_class_id is null or d.class_id = p_class_id)
      and (p_route_id is null or d.transport_route_id = p_route_id)
      and (
        p_query is null or btrim(p_query) = ''
        or d.search_text like '%' || lower(btrim(p_query)) || '%'
      )
  ),
  scoped as (
    select * from population
    where p_statuses is null or record_status::text = any(p_statuses)
  )
  select jsonb_build_object(
    'scopeTotal',      (select count(*) from scoped),
    'populationTotal', (select count(*) from population),
    'enrolment', (
      select jsonb_build_object(
        'active',      count(*) filter (where seg_active),
        'left',        count(*) filter (where seg_left),
        'leftOwing',   count(*) filter (where seg_left_owing),
        'graduated',   count(*) filter (where seg_graduated),
        'newThisYear', count(*) filter (where seg_new_this_year)
      ) from population
    ),
    'counts', (
      select jsonb_build_object(
        'oldBalanceDue',       count(*) filter (where seg_old_balance_due),
        'overdue',             count(*) filter (where seg_overdue),
        'lateFeePending',      count(*) filter (where seg_late_fee_pending),
        'partlyPaid',          count(*) filter (where seg_partly_paid),
        'fullyPaid',           count(*) filter (where seg_fully_paid),
        'neverPaid',           count(*) filter (where seg_never_paid),
        'hasDues',             count(*) filter (where seg_has_dues),
        'missingPhone',        count(*) filter (where seg_missing_phone),
        'duesNotPrepared',     count(*) filter (where seg_dues_not_prepared),
        'missingDob',          count(*) filter (where seg_missing_dob),
        'duplicateSr',         count(*) filter (where seg_duplicate_sr),
        'pendingSr',           count(*) filter (where seg_pending_sr),
        'onTransport',         count(*) filter (where seg_on_transport),
        'hasDiscount',         count(*) filter (where seg_has_discount),
        'discountRte',         count(*) filter (where seg_discount_rte),
        'discountStaffChild',  count(*) filter (where seg_discount_staff_child),
        'discountThirdChild',  count(*) filter (where seg_discount_third_child),
        'feeException',        count(*) filter (where seg_fee_exception),
        'lateFeeWaived',       count(*) filter (where seg_late_fee_waived)
      ) from scoped
    )
  );
$fn$;

revoke all on function public.get_student_segment_counts(text, uuid, uuid, text, text[], boolean)
  from public, anon;
grant execute on function public.get_student_segment_counts(text, uuid, uuid, text, text[], boolean)
  to authenticated, service_role;

comment on function public.get_student_segment_counts(text, uuid, uuid, text, text[], boolean) is
  'Live counts for every filter chip, in one round trip. Attribute families are counted within the structural + enrolment scope but never scope each other, because the status buckets are mutually exclusive and cross-scoping would make every unselected chip read zero.';

-- ---------------------------------------------------------------------------
-- 5. Scope totals for the Transactions footer.
--
-- Today that summary is computed over the current page, so it reports the page
-- rather than the filtered set. Same scope as the counts above.
-- ---------------------------------------------------------------------------

create or replace function public.get_student_directory_summary(
  p_session_label       text,
  p_class_id            uuid    default null,
  p_route_id            uuid    default null,
  p_query               text    default null,
  p_statuses            text[]  default null,
  p_active_classes_only boolean default true
)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $fn$
  with scoped as (
    select d.*
    from public.v_student_directory as d
    where d.session_label = p_session_label
      and (not p_active_classes_only or d.class_status = 'active')
      and (p_class_id is null or d.class_id = p_class_id)
      and (p_route_id is null or d.transport_route_id = p_route_id)
      and (
        p_query is null or btrim(p_query) = ''
        or d.search_text like '%' || lower(btrim(p_query)) || '%'
      )
      and (p_statuses is null or d.record_status::text = any(p_statuses))
  )
  select jsonb_build_object(
    'studentCount',          count(*),
    'expectedFees',          coalesce(sum(base_charge_total), 0),
    'totalPaid',             coalesce(sum(total_paid), 0),
    'totalOutstanding',      coalesce(sum(outstanding_amount), 0),
    'oldBalanceOutstanding', coalesce(sum(old_balance_amount), 0),
    'lateFeeOutstanding',    coalesce(sum(late_fee_outstanding_amount), 0),
    'totalDiscount',         coalesce(sum(discount_amount), 0),
    'transportStudentCount', count(*) filter (where seg_on_transport)
  )
  from scoped;
$fn$;

revoke all on function public.get_student_directory_summary(text, uuid, uuid, text, text[], boolean)
  from public, anon;
grant execute on function public.get_student_directory_summary(text, uuid, uuid, text, text[], boolean)
  to authenticated, service_role;

comment on function public.get_student_directory_summary(text, uuid, uuid, text, text[], boolean) is
  'Totals over the whole filtered set rather than the current page. Expected fees is base charges only -- late fee is never folded in (see 20260808170000).';

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on public.v_student_directory              from public, anon;
revoke all on public.v_student_installment_facets     from public, anon;
revoke all on public.v_student_conventional_discounts from public, anon;

grant select on public.v_student_directory              to authenticated, service_role;
grant select on public.v_student_installment_facets     to authenticated, service_role;
grant select on public.v_student_conventional_discounts to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Structural invariants.
--
-- Deliberately NOT numeric parity assertions. Fixing "overdue = 419" into a
-- migration would be brittle -- the number moves the next time a payment posts --
-- and a migration runs once, so it protects nothing ongoing. Numeric parity
-- against the TypeScript predicates belongs in a repeatable test.
--
-- What IS asserted here is the failure mode a view can introduce and a test
-- would be slow to notice: row fan-out. student_fee_overrides and the
-- conventional-discount view are both LEFT JOINed on student_id, so a duplicate
-- active override would silently double a student in every list and every count.
-- ---------------------------------------------------------------------------

do $$
declare
  v_directory_rows  bigint;
  v_distinct_rows   bigint;
  v_expected_rows   bigint;
  v_null_segments   bigint;
  v_negative        bigint;
begin
  select count(*), count(distinct student_id)
    into v_directory_rows, v_distinct_rows
  from public.v_student_directory;

  if v_directory_rows <> v_distinct_rows then
    raise exception
      'v_student_directory fans out: % rows for % students (duplicate active student_fee_overrides or conventional-discount rows?)',
      v_directory_rows, v_distinct_rows;
  end if;

  select count(*) into v_expected_rows
  from public.students s join public.classes c on c.id = s.class_id;

  if v_directory_rows <> v_expected_rows then
    raise exception
      'v_student_directory has % rows but students-with-a-class is %', v_directory_rows, v_expected_rows;
  end if;

  -- Every seg_* must be a real boolean. A null would make `.eq(col,true)` and
  -- `.eq(col,false)` both exclude the row, so it would vanish from every filter.
  select count(*) into v_null_segments
  from public.v_student_directory
  where seg_old_balance_due is null or seg_overdue is null or seg_late_fee_pending is null
     or seg_partly_paid is null or seg_fully_paid is null or seg_never_paid is null
     or seg_has_dues is null or seg_active is null or seg_left is null
     or seg_graduated is null or seg_left_owing is null or seg_new_this_year is null
     or seg_missing_phone is null or seg_dues_not_prepared is null or seg_missing_dob is null
     or seg_duplicate_sr is null or seg_pending_sr is null or seg_on_transport is null
     or seg_has_discount is null or seg_discount_rte is null or seg_discount_staff_child is null
     or seg_discount_third_child is null or seg_fee_exception is null or seg_late_fee_waived is null
     or search_text is null;

  if v_null_segments <> 0 then
    raise exception '% row(s) carry a null segment flag or search_text', v_null_segments;
  end if;

  select count(*) into v_negative
  from public.v_student_directory
  where old_balance_amount < 0 or overdue_base_amount < 0 or pending_late_fee_amount < 0;

  if v_negative <> 0 then
    raise exception '% row(s) carry a negative facet amount', v_negative;
  end if;

  -- The counts RPC must agree with a direct count over the same scope, or the
  -- chip numbers and the list would disagree the moment anyone filtered.
  if (public.get_student_segment_counts('2026-27') ->> 'populationTotal')::bigint
     <> (select count(*) from public.v_student_directory
          where session_label = '2026-27' and class_status = 'active') then
    raise exception 'get_student_segment_counts populationTotal disagrees with the directory';
  end if;
end;
$$;

notify pgrst, 'reload schema';
