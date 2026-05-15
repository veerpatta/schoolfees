-- vpps-latest-2026-05-15-fullbook: session reconciliation
update public.academic_sessions set is_current = true, status = 'active', updated_at = now() where session_label = '2026-27';
update public.academic_sessions set is_current = false, updated_at = now() where session_label <> '2026-27' and is_current = true;
do $$ begin
  if not exists (select 1 from public.academic_sessions where session_label = 'TEST')
     and exists (select 1 from public.academic_sessions where session_label = 'TEST-2026-27') then
    update public.academic_sessions set session_label = 'TEST', is_current = false, updated_at = now() where session_label = 'TEST-2026-27';
    update public.classes set session_label = 'TEST' where session_label = 'TEST-2026-27';
  end if;
end $$;
do $$ begin
  if not exists (select 1 from public.academic_sessions where session_label = 'TEST')
     and exists (select 1 from public.academic_sessions where session_label = 'UAT-2026-27') then
    update public.academic_sessions set session_label = 'TEST', is_current = false, updated_at = now() where session_label = 'UAT-2026-27';
    update public.classes set session_label = 'TEST' where session_label = 'UAT-2026-27';
  end if;
end $$;
do $$ begin
  if not exists (select 1 from public.academic_sessions where session_label = 'TEST')
     and exists (select 1 from public.academic_sessions where session_label = 'DEMO-2026-27') then
    update public.academic_sessions set session_label = 'TEST', is_current = false, updated_at = now() where session_label = 'DEMO-2026-27';
    update public.classes set session_label = 'TEST' where session_label = 'DEMO-2026-27';
  end if;
end $$;
