-- The single change to the core fee engine needed for EMI late fees.
--
-- A missed EMI is charged by inserting a REAL installment that carries nothing
-- but a flat late fee — the same trick `student_carry_forward_balances` already
-- uses to make a previous-year balance collectable. Being a real installment is
-- the whole point: `payments.installment_id` is NOT NULL, so a charge that is
-- not on an installment cannot be paid, refunded, receipted or exported.
--
-- But the engine refuses a late fee on a zero-base row. Two separate guards
-- catch it:
--
--     when rolled.base_charge <= 0 then 0
--     when rolled.settled_by_due_amount >= rolled.base_charge then 0   -- 0 >= 0
--
-- Both are right for ordinary fees: no fee charged means no fee to be late on.
-- Rather than loosen them for all 2,425 rows, mark the exception explicitly and
-- branch on the flag. The flag is false everywhere today, so every existing
-- row takes a byte-identical path.
alter table public.installments
  add column if not exists is_emi_late_fee boolean not null default false;

comment on column public.installments.is_emi_late_fee is
  'True only for the synthetic zero-base installments that carry a missed-EMI '
  'late fee. Set by sync_repayment_plan_late_fees; never by fee generation. '
  'Carves this row out of the engine''s "no late fee on a zero-base row" rule.';

-- Patched rather than restated: the snapshot is ~140 lines and is the hottest
-- read in the app. Two anchored substitutions, each of which fails loudly if
-- the text it expects has moved.
do $$
declare
  v_src text;
  v_new text;
  v_anchor_cols constant text :=
    '      i.late_fee_flat_amount, s.transport_route_id,';
  v_anchor_case constant text :=
    '        when coalesce(rolled.late_fee_flat_amount, 0) <= 0 then 0';
begin
  select pg_get_functiondef('private.workbook_installment_snapshot(uuid,date,boolean)'::regprocedure)
    into v_src;

  if position('is_emi_late_fee' in v_src) > 0 then
    return;  -- replay is a no-op
  end if;

  -- 1. Carry the flag through `session_installments`; `rolled` re-exports it
  --    with `session_installments.*`.
  if position(v_anchor_cols in v_src) = 0 then
    raise exception 'snapshot: column anchor not found';
  end if;

  v_new := replace(
    v_src,
    v_anchor_cols,
    '      i.late_fee_flat_amount, coalesce(i.is_emi_late_fee, false) as is_emi_late_fee,'
    || E'\n      s.transport_route_id,'
  );

  -- 2. Branch AFTER the waived and zero-flat-amount guards (an EMI late fee is
  --    still waivable, and a flag with no flat amount charges nothing) and
  --    BEFORE the two base-charge guards, which are exactly what it must skip.
  if position(v_anchor_case in v_new) = 0 then
    raise exception 'snapshot: late-fee case anchor not found';
  end if;

  v_new := replace(
    v_new,
    v_anchor_case,
    v_anchor_case
    || E'\n        when rolled.is_emi_late_fee then'
    || E'\n          case when current_date > rolled.due_date'
    || E'\n               then rolled.late_fee_flat_amount else 0 end'
  );

  execute v_new;
end $$;

-- Prove the patch landed, rather than trusting two string replaces.
do $$
declare
  v_src text := pg_get_functiondef(
    'private.workbook_installment_snapshot(uuid,date,boolean)'::regprocedure);
begin
  if position('as is_emi_late_fee' in v_src) = 0
     or position('when rolled.is_emi_late_fee then' in v_src) = 0
  then
    raise exception 'snapshot patch did not apply';
  end if;

  -- The carve-out must sit between the flat-amount guard and the base-charge
  -- guard. Above the first, it would charge a waived row; below the second, it
  -- would never be reached.
  if position('when rolled.is_emi_late_fee then' in v_src)
       < position('when coalesce(rolled.late_fee_flat_amount, 0) <= 0' in v_src)
     or position('when rolled.is_emi_late_fee then' in v_src)
       > position('when rolled.base_charge <= 0 then 0' in v_src)
  then
    raise exception 'snapshot patch landed in the wrong branch order';
  end if;
end $$;
