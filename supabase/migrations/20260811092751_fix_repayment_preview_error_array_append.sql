-- preview_student_repayment_plan crashed on every page load.
--
-- `v_errors := v_errors || 'some literal'` looks like "append a string" but the
-- literal is untyped, so Postgres resolves the operator to
-- array_cat(anyarray, anyarray) and tries to parse the sentence as an array:
--   malformed array literal: "Enter a monthly EMI amount greater than 0."
--
-- Student Edit loads the preview with no amount and no date yet, precisely to
-- price both scopes for the form — so it hit that branch every time, the read
-- failed, and the section fell back to "Nothing to convert. This student has no
-- unpaid dues", which was wrong for every student in the school.
--
-- The branches built with format() and case were fine, which is why the
-- lifecycle testing never saw it. array_append is unambiguous; use it
-- throughout rather than relying on which expressions happen to carry a type.
create or replace function public.preview_student_repayment_plan(
  p_student_id uuid,
  p_session_label text,
  p_scope text,
  p_monthly_amount integer default null,
  p_first_due_date date default null
)
returns jsonb
language plpgsql
stable
set search_path to 'public', 'private', 'pg_temp'
as $function$
declare
  v_opening integer;
  v_old integer;
  v_current integer;
  v_late integer;
  v_items jsonb;
  v_schedule jsonb;
  v_term integer;
  v_final integer;
  v_end date;
  v_errors text[] := array[]::text[];
  v_active_plan uuid;
begin
  if not public.has_permission('fees:repayment_plan') then
    raise exception 'You do not have permission to manage EMI repayment plans.';
  end if;

  if p_scope not in ('old_balance_only', 'old_and_current') then
    raise exception 'Unknown repayment plan scope: %.', p_scope;
  end if;

  select id into v_active_plan
  from public.student_repayment_plans
  where student_id = p_student_id and lifecycle = 'active'
  limit 1;

  select
    coalesce(sum(c.base_pending), 0)::integer,
    coalesce(sum(c.base_pending) filter (where c.is_carry_forward), 0)::integer,
    coalesce(sum(c.base_pending) filter (where not c.is_carry_forward), 0)::integer,
    coalesce(sum(c.charged_late_fee), 0)::integer,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'installmentId', c.installment_id,
          'installmentNo', c.installment_no,
          'installmentLabel', c.installment_label,
          'dueDate', c.due_date,
          'isCarryForward', c.is_carry_forward,
          'baseCharge', c.base_charge,
          'includedBaseBalance', c.base_pending,
          'chargedLateFee', c.charged_late_fee
        )
        order by c.due_date, c.installment_no
      ),
      '[]'::jsonb
    )
  into v_opening, v_old, v_current, v_late, v_items
  from private.repayment_plan_candidates(
    p_student_id,
    p_session_label,
    p_scope,
    (now() at time zone 'Asia/Kolkata')::date
  ) as c;

  if v_active_plan is not null then
    v_errors := array_append(
      v_errors,
      'This student already has an active EMI plan. Reschedule or cancel it first.'::text
    );
  end if;

  if v_opening <= 0 then
    v_errors := array_append(
      v_errors,
      case
        when p_scope = 'old_balance_only'
          then 'This student has no unpaid previous-year balance to convert.'
        else 'This student has no unpaid dues to convert.'
      end::text
    );
  end if;

  if p_monthly_amount is null or p_monthly_amount <= 0 then
    v_errors := array_append(v_errors, 'Enter a monthly EMI amount greater than 0.'::text);
  elsif v_opening > 0 then
    v_term := greatest(ceil(v_opening::numeric / p_monthly_amount::numeric)::integer, 1);

    if v_term > 12 then
      v_errors := array_append(v_errors, format(
        'At Rs %s a month this plan needs %s months. The maximum term is 12 months — Rs %s a month or more clears it in time.',
        p_monthly_amount,
        v_term,
        ceil(v_opening::numeric / 12)::integer
      )::text);
      v_term := null;
    end if;
  end if;

  if p_first_due_date is null then
    v_errors := array_append(v_errors, 'Choose the first EMI due date.'::text);
  end if;

  if v_term is not null and p_first_due_date is not null then
    select
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'sequenceNo', s.sequence_no,
            'dueDate', s.due_date,
            'amount', s.amount
          )
          order by s.sequence_no
        ),
        '[]'::jsonb
      ),
      max(s.due_date),
      max(s.amount) filter (where s.sequence_no = v_term)
    into v_schedule, v_end, v_final
    from private.repayment_plan_schedule(p_first_due_date, p_monthly_amount, v_opening) as s;
  end if;

  return jsonb_build_object(
    'studentId', p_student_id,
    'sessionLabel', p_session_label,
    'scope', p_scope,
    'openingBalance', coalesce(v_opening, 0),
    'oldBalanceIncluded', coalesce(v_old, 0),
    'currentYearIncluded', coalesce(v_current, 0),
    'lateFeeWaived', coalesce(v_late, 0),
    'installmentCount', jsonb_array_length(coalesce(v_items, '[]'::jsonb)),
    'monthlyAmount', p_monthly_amount,
    'firstDueDate', p_first_due_date,
    'termMonths', v_term,
    'finalInstallmentAmount', v_final,
    'endDate', v_end,
    'items', coalesce(v_items, '[]'::jsonb),
    'schedule', coalesce(v_schedule, '[]'::jsonb),
    'hasActivePlan', v_active_plan is not null,
    'errors', to_jsonb(v_errors),
    'canActivate', array_length(v_errors, 1) is null
  );
end;
$function$;
