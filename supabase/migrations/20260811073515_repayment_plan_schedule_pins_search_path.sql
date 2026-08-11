-- Pin the search_path (Supabase linter 0011). Pure date/integer arithmetic, but
-- an unpinned search_path on a function is a foothold regardless.
create or replace function private.repayment_plan_schedule(
  p_first_due_date date,
  p_monthly_amount integer,
  p_opening_balance integer
)
returns table (sequence_no smallint, due_date date, amount integer)
language sql
immutable
set search_path to 'pg_catalog', 'pg_temp'
as $function$
  with term as (
    select greatest(
      ceil(p_opening_balance::numeric / nullif(p_monthly_amount, 0)::numeric)::integer,
      1
    ) as months
  )
  select
    n::smallint as sequence_no,
    least(
      (date_trunc('month', p_first_due_date::timestamp)::date + ((n - 1) || ' months')::interval)::date
        + (extract(day from p_first_due_date)::integer - 1),
      (date_trunc('month', p_first_due_date::timestamp)::date + (n || ' months')::interval)::date - 1
    ) as due_date,
    (case
      when n < (select months from term) then p_monthly_amount
      else p_opening_balance - p_monthly_amount * ((select months from term) - 1)
    end)::integer as amount
  from generate_series(1, (select months from term)) as n
  order by n;
$function$;
