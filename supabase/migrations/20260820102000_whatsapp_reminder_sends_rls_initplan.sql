-- Fix forward: the policy added in 20260820094500 reintroduced auth_rls_initplan.
--
-- `using (auth.role() = 'authenticated')` re-evaluates auth.role() once per
-- candidate row. `20260527090443` swept every table in this database into the
-- `(select auth.role())` form so the planner hoists it into an InitPlan and
-- evaluates it once per statement — and the new table landed on the wrong side
-- of that sweep. Migrations are append-only, so this corrects it rather than
-- editing the file that introduced it.

drop policy if exists "whatsapp_reminder_sends: staff read" on public.whatsapp_reminder_sends;

create policy "whatsapp_reminder_sends: staff read"
  on public.whatsapp_reminder_sends for select
  using ((select auth.role()) = 'authenticated');
