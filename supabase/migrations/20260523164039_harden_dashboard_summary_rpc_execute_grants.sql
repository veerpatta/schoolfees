alter function public.get_dashboard_summary(text, text)
set search_path = public, private, pg_temp;

revoke all on function public.get_dashboard_summary(text, text) from public;
revoke execute on function public.get_dashboard_summary(text, text) from anon;

grant execute on function public.get_dashboard_summary(text, text) to authenticated;
grant execute on function public.get_dashboard_summary(text, text) to service_role;
