drop function if exists public.get_admin_customers_page(integer,integer,text);

revoke all on function public.get_admin_transactions_summary(timestamptz,timestamptz,uuid) from public,anon;
grant execute on function public.get_admin_transactions_summary(timestamptz,timestamptz,uuid) to authenticated,service_role;

revoke all on function public.get_admin_dashboard_counts(timestamptz,timestamptz) from public,anon;
grant execute on function public.get_admin_dashboard_counts(timestamptz,timestamptz) to authenticated,service_role;

revoke all on function public.get_admin_customers_page(integer,integer,text,text) from public,anon;
grant execute on function public.get_admin_customers_page(integer,integer,text,text) to authenticated,service_role;
