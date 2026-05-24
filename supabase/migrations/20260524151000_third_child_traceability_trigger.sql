-- P0-1 (Part B): Add a trigger that prevents new third_child policy
-- assignments from being written without either a family_group_id or
-- an explicit is_manual_override=true flag.
--
-- Background: a bulk data-revamp script recently wrote 8 active
-- third_child assignments while bypassing the
-- saveStudentConventionalDiscountAssignments path, leaving no
-- family_group_id and no manual-override flag. The office reviewed
-- those 8 assignments and confirmed they're financially correct, so
-- this trigger does NOT touch them (it only fires on insert/update).
-- It is purely a guardrail against future direct-insert mistakes.
--
-- Trigger semantics:
-- * Only enforced when is_active = true (inactive rows can be in any state).
-- * Only enforced when the assigned policy's code = 'third_child'.
-- * Pre-existing rows are grandfathered until they're touched (no scan).
-- * The legitimate auto-apply path sets family_group_id so it continues
--   to pass; manual override path sets is_manual_override = true.

create or replace function private.enforce_third_child_traceability()
returns trigger
language plpgsql
as $$
declare
  v_policy_code text;
begin
  if not new.is_active then
    return new;
  end if;

  select code
    into v_policy_code
  from public.conventional_discount_policies
  where id = new.policy_id;

  if v_policy_code is null or v_policy_code <> 'third_child' then
    return new;
  end if;

  if new.family_group_id is null and coalesce(new.is_manual_override, false) = false then
    raise exception
      'third_child policy assignment requires family_group_id (auto-apply path) or is_manual_override=true (with manual_override_reason)';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_third_child_traceability_trg
  on public.student_conventional_discount_assignments;

create trigger enforce_third_child_traceability_trg
  before insert or update on public.student_conventional_discount_assignments
  for each row execute function private.enforce_third_child_traceability();
