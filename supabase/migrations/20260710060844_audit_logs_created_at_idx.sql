-- The Activity feed reads audit_logs ordered by created_at with a limit.
-- Existing indexes all lead with another column (table_name / changed_by /
-- record), so the plain "latest activity" query sorted ~22k rows every load
-- (1.8s mean in production together with the per-row RLS cost fixed in
-- 20260710060000_rls_initplan_wrap). Give the ORDER BY a direct index.
create index if not exists idx_audit_logs_created_at
  on public.audit_logs (created_at desc);
