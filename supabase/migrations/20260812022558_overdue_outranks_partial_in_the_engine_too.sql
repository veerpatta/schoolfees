-- Half of migration 20260522030225 had silently regressed.
--
-- That migration exists to make a past-due installment read 'overdue' EVEN IF
-- it carries a partial payment, and it applied the change to both
-- private.workbook_installment_snapshot and v_workbook_installment_balances.
-- The view kept it. The function did not: a later rewrite restored the old
-- branch order, putting 'partial' back ahead of 'overdue'.
--
-- Measured on live 2026-27: 105 installments across 105 students, Rs 3,66,852
-- of pending money, where the two disagree from byte-identical inputs. The
-- view says overdue; the function says partial.
--
-- The view is right, and it is what the student page, Defaulters and the
-- dashboard read — so nothing user-facing moves. What DOES move is
-- preview_workbook_payment_allocation, the only consumer of the function's
-- balance_status: it hands the status to the Payment Desk, which was therefore
-- telling a cashier "partial" about a row the rest of the app calls overdue.
--
-- A family that paid Rs 500 of a Rs 10,000 installment two months ago is
-- overdue. Partial is true but not the fact the office is acting on.
do $$
declare
  v_src text;
  v_new text;
  v_partial constant text :=
    '      when waiver_eval.applied_amount > 0 or waiver_eval.discount_closeout_amount > 0 then ''partial''';
  v_overdue constant text :=
    '      when p_as_of_date > waiver_eval.due_date then ''overdue''';
begin
  select pg_get_functiondef('private.workbook_installment_snapshot(uuid,date,boolean)'::regprocedure)
    into v_src;

  if position(v_overdue in v_src) < position(v_partial in v_src) then
    return;  -- already ordered correctly; replay is a no-op
  end if;

  if position(v_partial in v_src) = 0 or position(v_overdue in v_src) = 0 then
    raise exception 'snapshot: balance_status branch anchors not found';
  end if;

  -- Swap the two adjacent branches, nothing else.
  v_new := replace(
    v_src,
    v_partial || E'\n' || v_overdue,
    v_overdue || E'\n' || v_partial
  );

  if v_new = v_src then
    raise exception 'snapshot: the two branches were not adjacent as expected';
  end if;

  execute v_new;
end $$;

do $$
declare
  v_src text := pg_get_functiondef(
    'private.workbook_installment_snapshot(uuid,date,boolean)'::regprocedure);
begin
  if position('then ''overdue''' in v_src) > position('then ''partial''' in v_src) then
    raise exception 'balance_status still checks partial before overdue';
  end if;
end $$;
