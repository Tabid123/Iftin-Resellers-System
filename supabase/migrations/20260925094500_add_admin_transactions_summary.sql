create or replace function public.get_admin_transactions_summary(
  p_start timestamptz default null,
  p_end timestamptz default null,
  p_provider_id uuid default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
with tenant as (
  select public.effective_tenant_id() as id
),
bundle_profit as (
  select r.source_package_id,
         sum((coalesce(tp.selling_price,0) - coalesce(tp.cost_price,0)) * greatest(coalesce(r.delivery_count,1),1))::numeric as profit
  from public.package_delivery_rules r
  join public.data_packages_config tp
    on tp.id = r.target_package_id and tp.tenant_id = r.tenant_id
  join tenant t on t.id = r.tenant_id
  where r.is_active = true
  group by r.source_package_id
),
rows as (
  select
    o.id,
    o.selling_price::numeric as selling,
    coalesce(nullif(o.cost_price,0), pkg.cost_price,0)::numeric as cost,
    coalesce(prov.evoucher_rate,0)::numeric as rate,
    bp.profit as bundle_profit,
    (
      coalesce(pkg.is_discovery_root,false)
      or coalesce(pkg.ussd_code,'') ~ '^\*(870|866|101|212)(\*|#)'
      or exists (
        select 1 from public.delivery_instructions di
        where di.tenant_id=o.tenant_id
          and coalesce(di.code_template,'') ~ '^\*(870|866|101|212)(\*|#)'
          and (
            (di.package_id is not null and di.package_id=o.package_id)
            or (di.package_id is null and di.category_id is not null and di.category_id=pkg.category_id)
            or (di.package_id is null and di.category_id is null and di.provider_id is not null and di.provider_id=o.provider_id)
          )
      )
    ) as direct_flow
  from public.orders o
  join tenant t on t.id=o.tenant_id
  left join public.data_packages_config pkg on pkg.id=o.package_id and pkg.tenant_id=o.tenant_id
  left join public.providers_config prov on prov.id=o.provider_id and prov.tenant_id=o.tenant_id
  left join bundle_profit bp on bp.source_package_id=o.package_id
  where (p_start is null or o.created_at >= p_start)
    and (p_end is null or o.created_at < p_end)
    and (p_provider_id is null or o.provider_id=p_provider_id)
    and (o.delivery_status='delivered' or (o.delivery_status is null and o.status='completed'))
),
calc as (
  select *,
    case
      when bundle_profit is not null then bundle_profit
      when direct_flow then selling-cost
      when 1+rate > 0 then ((selling*(1+rate))-cost)/(1+rate)
      else 0
    end as usd_profit,
    case
      when bundle_profit is not null then bundle_profit
      when direct_flow then selling-cost
      else (selling*(1+rate))-cost
    end as ev_profit
  from rows
)
select jsonb_build_object(
  'delivered_count', count(*)::int,
  'revenue', coalesce(sum(selling),0),
  'cost', coalesce(sum(cost),0),
  'profit_usd', coalesce(sum(usd_profit),0),
  'profit_evoucher', coalesce(sum(ev_profit),0)
)
from calc;
$$;

revoke all on function public.get_admin_transactions_summary(timestamptz,timestamptz,uuid) from public;
grant execute on function public.get_admin_transactions_summary(timestamptz,timestamptz,uuid) to authenticated;
