create or replace function public.get_combined_payment_analytics(
  p_start timestamptz,
  p_bucket text default 'day'
)
returns jsonb
language sql
stable
security invoker
set search_path=public
as $$
with tenant as (select public.effective_tenant_id() id),
rows as (
 select case when o.payment_source='ussd_online' then 'online'
             when o.payment_source='sms_offline' or o.payment_source is null then 'sms'
             else null end as source,
        o.created_at,o.selling_price::numeric as selling,o.delivery_status,
        coalesce(pkg.cost_price,0)::numeric as cost,
        coalesce(prov.evoucher_rate,0)::numeric as rate
 from public.orders o
 join tenant t on t.id=o.tenant_id
 left join public.data_packages_config pkg on pkg.id=o.package_id and pkg.tenant_id=o.tenant_id
 left join public.providers_config prov on prov.id=o.provider_id and prov.tenant_id=o.tenant_id
 where o.status <> 'pending_payment' and o.created_at >= p_start
), scoped as (select * from rows where source is not null),
stats as (
 select source,count(*)::int total_orders,coalesce(sum(selling),0) revenue,
        coalesce(sum(selling*(1+rate)-cost),0) profit,
        count(*) filter(where delivery_status='delivered')::int delivered,
        count(*) filter(where delivery_status='pending' or delivery_status is null)::int pending,
        count(*) filter(where delivery_status='failed')::int failed
 from scoped group by source
), breakdown as (
 select case when p_bucket='month' then date_trunc('month',created_at) else date_trunc('day',created_at) end bucket,
        count(*) filter(where source='online')::int online_orders,
        count(*) filter(where source='sms')::int sms_orders,
        coalesce(sum(selling) filter(where source='online'),0) online_revenue,
        coalesce(sum(selling) filter(where source='sms'),0) sms_revenue
 from scoped group by 1 order by 1
)
select jsonb_build_object(
 'online',coalesce((select jsonb_build_object('total_orders',total_orders,'revenue',revenue,'profit',profit,'delivered',delivered,'pending',pending,'failed',failed) from stats where source='online'),'{}'::jsonb),
 'sms',coalesce((select jsonb_build_object('total_orders',total_orders,'revenue',revenue,'profit',profit,'delivered',delivered,'pending',pending,'failed',failed) from stats where source='sms'),'{}'::jsonb),
 'breakdown',coalesce((select jsonb_agg(jsonb_build_object('bucket',bucket,'online_orders',online_orders,'sms_orders',sms_orders,'online_revenue',online_revenue,'sms_revenue',sms_revenue) order by bucket) from breakdown),'[]'::jsonb)
);
$$;
revoke all on function public.get_combined_payment_analytics(timestamptz,text) from public,anon;
grant execute on function public.get_combined_payment_analytics(timestamptz,text) to authenticated,service_role;
