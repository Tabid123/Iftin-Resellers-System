-- Aggregate dashboard cards and per-device period stats without downloading order history.

create or replace function public.get_admin_dashboard_summary(
  p_start timestamptz,
  p_end timestamptz default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
with ctx as (
  select public.effective_tenant_id() as tenant_id
),
bundle_profit as (
  select r.tenant_id, r.source_package_id,
         sum((coalesce(tp.selling_price,0) - coalesce(tp.cost_price,0)) * greatest(coalesce(r.delivery_count,1),1))::numeric as profit
  from public.package_delivery_rules r
  join public.data_packages_config tp
    on tp.id=r.target_package_id and tp.tenant_id=r.tenant_id
  where r.is_active=true
  group by r.tenant_id, r.source_package_id
),
base as (
  select o.*,
         case when coalesce(o.cost_price,0)>0 then o.cost_price else coalesce(pkg.cost_price,0) end as effective_cost,
         coalesce(prov.evoucher_rate,0) as evoucher_rate,
         bp.profit as bundle_profit,
         (
           coalesce(pkg.is_discovery_root,false)
           or coalesce(pkg.ussd_code,'') ~ '^\*(870|866|101|212)(\*|#)'
           or exists (
             select 1 from public.delivery_instructions di
             where di.tenant_id=o.tenant_id
               and coalesce(di.code_template,'') ~ '^\*(870|866|101|212)(\*|#)'
               and (
                 (di.package_id is not null and di.package_id=pkg.id)
                 or (di.package_id is null and di.category_id is not null and di.category_id=pkg.category_id)
                 or (di.package_id is null and di.category_id is null and di.provider_id is not null and di.provider_id=pkg.provider_id)
               )
           )
         ) as direct_flow
  from public.orders o
  join ctx on ctx.tenant_id=o.tenant_id
  left join public.data_packages_config pkg on pkg.id=o.package_id and pkg.tenant_id=o.tenant_id
  left join public.providers_config prov on prov.id=o.provider_id and prov.tenant_id=o.tenant_id
  left join bundle_profit bp on bp.tenant_id=o.tenant_id and bp.source_package_id=o.package_id
  where o.created_at>=p_start
    and (p_end is null or o.created_at<p_end)
)
select jsonb_build_object(
  'order_count', count(*)::int,
  'delivered', count(*) filter (where delivery_status='delivered')::int,
  'failed', count(*) filter (where delivery_status in ('failed','timeout'))::int,
  'pending', count(*) filter (where delivery_status in ('pending','processing'))::int,
  'sales', coalesce(sum(selling_price) filter (where delivery_status='delivered'),0),
  'cost', coalesce(sum(effective_cost) filter (where delivery_status='delivered'),0),
  'profit', coalesce(sum(
    case
      when delivery_status <> 'delivered' then 0
      when bundle_profit is not null then bundle_profit
      when direct_flow then coalesce(selling_price,0)-coalesce(effective_cost,0)
      when (1+coalesce(evoucher_rate,0))>0
        then (coalesce(selling_price,0)*(1+coalesce(evoucher_rate,0))-coalesce(effective_cost,0))/(1+coalesce(evoucher_rate,0))
      else 0
    end
  ),0)
)
from base;
$$;

revoke all on function public.get_admin_dashboard_summary(timestamptz,timestamptz) from public;
grant execute on function public.get_admin_dashboard_summary(timestamptz,timestamptz) to authenticated;

create or replace function public.get_admin_device_period_stats(
  p_start timestamptz,
  p_end timestamptz default null
)
returns table(
  device_id text,
  delivered integer,
  failed integer,
  orders integer,
  revenue numeric,
  cost numeric,
  profit numeric
)
language sql
stable
security invoker
set search_path = public
as $$
with ctx as (
  select public.effective_tenant_id() as tenant_id
),
bundle_profit as (
  select r.tenant_id, r.source_package_id,
         sum((coalesce(tp.selling_price,0) - coalesce(tp.cost_price,0)) * greatest(coalesce(r.delivery_count,1),1))::numeric as profit
  from public.package_delivery_rules r
  join public.data_packages_config tp on tp.id=r.target_package_id and tp.tenant_id=r.tenant_id
  where r.is_active=true
  group by r.tenant_id,r.source_package_id
),
base as (
  select dq.android_device_id,
         dq.status as queue_status,
         o.delivery_status,
         o.selling_price,
         case when coalesce(o.cost_price,0)>0 then o.cost_price else coalesce(pkg.cost_price,0) end as effective_cost,
         coalesce(prov.evoucher_rate,0) as evoucher_rate,
         bp.profit as bundle_profit,
         (
           coalesce(pkg.is_discovery_root,false)
           or coalesce(pkg.ussd_code,'') ~ '^\*(870|866|101|212)(\*|#)'
           or exists (
             select 1 from public.delivery_instructions di
             where di.tenant_id=o.tenant_id
               and coalesce(di.code_template,'') ~ '^\*(870|866|101|212)(\*|#)'
               and (
                 (di.package_id is not null and di.package_id=pkg.id)
                 or (di.package_id is null and di.category_id is not null and di.category_id=pkg.category_id)
                 or (di.package_id is null and di.category_id is null and di.provider_id is not null and di.provider_id=pkg.provider_id)
               )
           )
         ) as direct_flow
  from public.delivery_queue dq
  join ctx on ctx.tenant_id=dq.tenant_id
  join public.orders o on o.id=dq.order_id and o.tenant_id=dq.tenant_id
  left join public.data_packages_config pkg on pkg.id=o.package_id and pkg.tenant_id=o.tenant_id
  left join public.providers_config prov on prov.id=o.provider_id and prov.tenant_id=o.tenant_id
  left join bundle_profit bp on bp.tenant_id=o.tenant_id and bp.source_package_id=o.package_id
  where dq.created_at>=p_start
    and (p_end is null or dq.created_at<p_end)
    and dq.android_device_id is not null
)
select android_device_id,
       count(*) filter (where queue_status in ('completed','delivered'))::int,
       count(*) filter (where queue_status='failed')::int,
       count(*)::int,
       coalesce(sum(selling_price) filter (where delivery_status='delivered'),0),
       coalesce(sum(effective_cost) filter (where delivery_status='delivered'),0),
       coalesce(sum(
         case
           when delivery_status <> 'delivered' then 0
           when bundle_profit is not null then bundle_profit
           when direct_flow then coalesce(selling_price,0)-coalesce(effective_cost,0)
           when (1+coalesce(evoucher_rate,0))>0
             then (coalesce(selling_price,0)*(1+coalesce(evoucher_rate,0))-coalesce(effective_cost,0))/(1+coalesce(evoucher_rate,0))
           else 0
         end
       ),0)
from base
group by android_device_id;
$$;

revoke all on function public.get_admin_device_period_stats(timestamptz,timestamptz) from public;
grant execute on function public.get_admin_device_period_stats(timestamptz,timestamptz) to authenticated;
