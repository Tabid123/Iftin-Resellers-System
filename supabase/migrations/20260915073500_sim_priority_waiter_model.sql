-- Focused SIM Priority / Waiter Model migration.
-- No auto-blocking or config-missing behavior is introduced here.

alter table public.android_devices
  add column if not exists sim1_priority integer not null default 1,
  add column if not exists sim2_priority integer not null default 1,
  add column if not exists sim1_enabled boolean not null default true,
  add column if not exists sim2_enabled boolean not null default true,
  add column if not exists sim1_provider text,
  add column if not exists sim2_provider text;

alter table public.android_devices drop constraint if exists android_devices_sim1_priority_range;
alter table public.android_devices add constraint android_devices_sim1_priority_range check (sim1_priority between 1 and 5);
alter table public.android_devices drop constraint if exists android_devices_sim2_priority_range;
alter table public.android_devices add constraint android_devices_sim2_priority_range check (sim2_priority between 1 and 5);

create or replace function public.tenant_sim_routes(p_tenant_id uuid)
returns table(device_id text, sim_slot integer, provider text, priority integer, available boolean)
language sql stable security definer set search_path='public'
as $$
  select s.device_id, s.sim_slot, s.provider, s.priority,
         (s.enabled and s.blocked_at is null and s.last_ping_at is not null
          and s.last_ping_at > now() - interval '3 minutes'
          and not exists (
            select 1 from public.delivery_queue q
            where q.tenant_id=p_tenant_id and q.android_device_id=s.device_id
              and q.sim_slot=s.sim_slot and q.status='processing')) as available
  from (
    select d.device_id, 1 sim_slot, lower(trim(coalesce(d.sim1_provider,''))) provider,
           d.sim1_priority priority, d.sim1_enabled enabled,
           d.delivery_blocked_at blocked_at, d.last_ping_at
    from public.android_devices d
    where d.tenant_id=p_tenant_id and d.archived_at is null and d.is_active=true
    union all
    select d.device_id, 2 sim_slot, lower(trim(coalesce(d.sim2_provider,''))) provider,
           d.sim2_priority priority, d.sim2_enabled enabled,
           d.delivery_blocked_at blocked_at, d.last_ping_at
    from public.android_devices d
    where d.tenant_id=p_tenant_id and d.archived_at is null and d.is_active=true
      and nullif(trim(coalesce(d.sim2_number,'')),'') is not null
  ) s
  where s.provider<>'' and s.provider<>'unknown';
$$;

-- claim_next_delivery in production already implements the Waiter Model:
-- exact provider match, free/online/enabled route filtering, lowest numeric
-- priority wins, same-priority routes may work concurrently, and sim_slot is
-- returned in the claimed delivery JSON. The production definition is kept
-- unchanged intentionally to avoid touching unrelated stale-processing/PIN logic.
