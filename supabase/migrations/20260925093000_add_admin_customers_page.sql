create or replace function public.get_admin_customers_page(
  p_limit integer default 50,
  p_offset integer default 0,
  p_search text default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_tenant uuid := public.effective_tenant_id();
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_result jsonb;
begin
  if v_tenant is null then
    return jsonb_build_object('rows','[]'::jsonb,'total',0,'new_today',0,'bought_today',0,'inactive',0);
  end if;

  with source_rows as (
    select regexp_replace(v.phone_number, '\D', '', 'g') as phone, v.id as verified_id,
           v.created_at, v.last_login_at, true as verified
    from public.verified_phones v where v.tenant_id = v_tenant
    union all
    select regexp_replace(o.customer_phone, '\D', '', 'g'), null::uuid, min(o.created_at), null::timestamptz, false
    from public.orders o
    where o.tenant_id = v_tenant and coalesce(o.customer_phone,'') <> ''
    group by regexp_replace(o.customer_phone, '\D', '', 'g')
    union all
    select regexp_replace(r.sender_phone, '\D', '', 'g'), null::uuid, min(r.created_at), null::timestamptz, false
    from public.offline_registrations r
    where r.tenant_id = v_tenant and coalesce(r.sender_phone,'') <> ''
    group by regexp_replace(r.sender_phone, '\D', '', 'g')
  ),
  customers as (
    select right(phone,9) as phone_number,
           max(verified_id) filter (where verified_id is not null) as id,
           min(created_at) as created_at,
           max(last_login_at) as last_login_at,
           bool_or(verified) as verified
    from source_rows
    where length(right(phone,9)) = 9
    group by right(phone,9)
  ),
  order_stats as (
    select right(regexp_replace(customer_phone, '\D', '', 'g'),9) as phone_number,
           count(*)::int as order_count,
           coalesce(sum(selling_price),0)::numeric as total_spent,
           bool_or(created_at >= date_trunc('day', now() at time zone 'Africa/Mogadishu') at time zone 'Africa/Mogadishu') as bought_today
    from public.orders
    where tenant_id = v_tenant and coalesce(customer_phone,'') <> ''
    group by right(regexp_replace(customer_phone, '\D', '', 'g'),9)
  ),
  enriched as (
    select c.id,c.phone_number,c.created_at,c.last_login_at,c.verified,
           coalesce(os.order_count,0) as order_count,
           coalesce(os.total_spent,0) as total_spent,
           coalesce(os.bought_today,false) as bought_today
    from customers c left join order_stats os using (phone_number)
    where coalesce(trim(p_search),'') = ''
       or c.phone_number ilike '%' || regexp_replace(p_search, '\D', '', 'g') || '%'
  ),
  summary as (
    select count(*)::int as total,
           count(*) filter (where created_at >= date_trunc('day', now() at time zone 'Africa/Mogadishu') at time zone 'Africa/Mogadishu')::int as new_today,
           count(*) filter (where bought_today)::int as bought_today,
           count(*) filter (where order_count=0)::int as inactive
    from enriched
  ),
  page_rows as (
    select * from enriched
    order by created_at desc nulls last, phone_number desc
    offset v_offset limit v_limit
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(to_jsonb(p)) from page_rows p), '[]'::jsonb),
    'total', s.total, 'new_today', s.new_today, 'bought_today', s.bought_today, 'inactive', s.inactive
  )
  into v_result from summary s;

  return coalesce(v_result,jsonb_build_object('rows','[]'::jsonb,'total',0,'new_today',0,'bought_today',0,'inactive',0));
end;
$$;

revoke all on function public.get_admin_customers_page(integer, integer, text) from public;
grant execute on function public.get_admin_customers_page(integer, integer, text) to authenticated;
