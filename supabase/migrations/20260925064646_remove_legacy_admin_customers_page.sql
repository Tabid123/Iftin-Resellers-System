-- Keep only the authenticated, filter-aware customer pagination RPC.
drop function if exists public.get_admin_customers_page(integer,integer,text);

revoke all on function public.get_admin_customers_page(integer,integer,text,text) from public, anon;
grant execute on function public.get_admin_customers_page(integer,integer,text,text) to authenticated, service_role;
