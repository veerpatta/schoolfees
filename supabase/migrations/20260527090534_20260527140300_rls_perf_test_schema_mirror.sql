-- Mirror of the multiple_permissive_policies fix from migration 140100,
-- applied to the test.student_conventional_discount_assignments table.
-- The test schema sits alongside public.* as a clean-room copy used for
-- TEST-2026-27. The advisor still flags it independently from public.

drop policy if exists "authenticated can write student conventional discounts" on test.student_conventional_discount_assignments;
create policy "authenticated can insert student conventional discounts"
  on test.student_conventional_discount_assignments for insert
  to authenticated
  with check (public.has_permission('students:write'));
create policy "authenticated can update student conventional discounts"
  on test.student_conventional_discount_assignments for update
  to authenticated
  using (public.has_permission('students:write'))
  with check (public.has_permission('students:write'));
create policy "authenticated can delete student conventional discounts"
  on test.student_conventional_discount_assignments for delete
  to authenticated
  using (public.has_permission('students:write'));
