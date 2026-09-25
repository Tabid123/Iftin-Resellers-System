create or replace function public.get_admin_dashboard_counts(
  p_start timestamptz,
  p_end timestamptz default null
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
period_orders as (
  select o.status, o.delivery_status
  from public.orders o
  join tenant t on t.id=o.tenant_id
  where o.created_at >= p_start
    and (p_end is null or o.created_at < p_end)
),
device_counts as (
  select count(*) filter (
    where d.is_active=true
      and d.archived_at is null
      and d.last_ping_at >= now() - interval '5 minutes'
  )::int as online
  from public.android_devices d
  join tenant t on t.id=d.tenant_id
)
select jsonb_build_object(
  'order_count', (select count(*)::int from period_orders),
  'failed', (select count(*)::int from period_orders where delivery_status in ('failed','timeout')),
  'pending', (select count(*)::int from period_orders where delivery_status in ('pending','processing')),
  'delivered', (select count(*)::int from period_orders where delivery_status='delivered'),
  'devices_online', coalesce((select online from device_counts),0)
);
$$;
revoke all on function public.get_admin_dashboard_counts(timestamptz,timestamptz) from public;
grant execute on function public.get_admin_dashboard_counts(timestamptz,timestamptz) to authenticated;
