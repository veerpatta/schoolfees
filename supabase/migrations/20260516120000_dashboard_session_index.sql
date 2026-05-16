-- Supports session-scoped dashboard financial view queries
create index if not exists idx_students_active_session_dashboard
  on students (status, class_id)
  where status = 'active';
