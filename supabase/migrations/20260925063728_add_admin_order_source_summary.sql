create or replace function public.get_admin_order_source_summary(
  p_sources text[],
  p_start timestamptz default null,
  p_provider_id uuid default null,
  p_status text default null,
  p_search text default null
)
returns jsonb
language sql
stable
security invoker
set search_path=public
as $$
with tenant as (select public.effective_tenant_id() id),
base as (
 select o.*,
        coalesce(nullif(o.cost_price,0),pkg.cost_price,0)::numeric as effective_cost,
        coalesce(prov.evoucher_rate,0)::numeric as rate
 from public.orders o
 join tenant t on t.id=o.tenant_id
 left join public.data_packages_config pkg on pkg.id=o.package_id and pkg.tenant_id=o.tenant_id
 left join public.providers_config prov on prov.id=o.provider_id and prov.tenant_id=o.tenant_id
 where (p_sources is null or o.payment_source=any(p_sources) or ('__NULL__'=any(p_sources) and o.payment_source is null))
   and (p_start is null or o.created_at>=p_start)
   and (p_provider_id is null or o.provider_id=p_provider_id)
   and (
      p_status is null or p_status='all'
      or (p_status='pending' and o.delivery_status in ('pending','queued','processing'))
      or (p_status='failed' and o.delivery_status='failed')
      or (p_status='delivered' and o.delivery_status='delivered')
   )
   and (
      coalesce(trim(p_search),'')=''
      or o.customer_phone ilike '%'||p_search||'%'
      or o.receiver_phone ilike '%'||p_search||'%'
      or o.package_name ilike '%'||p_search||'%'
   )
),
calc as (
 select *, case when 1+rate>0 then (selling_price*(1+rate)-effective_cost) else 0 end as profit
 from base
)
select jsonb_build_object(
 'total',count(*)::int,
 'delivered',count(*) filter(where delivery_status='delivered')::int,
 'pending',count(*) filter(where delivery_status in ('pending','queued','processing'))::int,
 'failed',count(*) filter(where delivery_status='failed')::int,
 'revenue',coalesce(sum(selling_price) filter(where delivery_status='delivered'),0),
 'cost',coalesce(sum(effective_cost) filter(where delivery_status='delivered'),0),
 'profit',coalesce(sum(profit) filter(where delivery_status='delivered'),0)
) from calc;
$$;

revoke all on function public.get_admin_order_source_summary(text[],timestamptz,uuid,text,text) from public, anon;
grant execute on function public.get_admin_order_source_summary(text[],timestamptz,uuid,text,text) to authenticated, service_role;
