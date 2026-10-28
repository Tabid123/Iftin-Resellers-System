-- A processing lease belongs to a claim, not the age of the pending order.
alter table public.delivery_queue
  add column if not exists processing_started_at timestamptz;

update public.delivery_queue
set processing_started_at = coalesce(last_attempt_at, dispatched_at, created_at)
where status = 'processing' and processing_started_at is null;

create index if not exists delivery_queue_processing_lease_idx
  on public.delivery_queue (processing_started_at, tenant_id)
  where status = 'processing';
create index if not exists delivery_queue_open_order_idx
  on public.delivery_queue (tenant_id, order_id)
  where status in ('pending', 'scheduled', 'processing', 'verification_required', 'awaiting_sms');

create or replace function private.track_delivery_processing_lease()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_order public.orders%rowtype;
begin
  -- Final orders must never leave executable work behind, including late callbacks.
  if new.order_id is not null then
    select * into v_order from public.orders
    where id = new.order_id and tenant_id = new.tenant_id;
    if v_order.status = 'cancelled' or v_order.delivery_status = 'cancelled' then
      new.status := 'cancelled';
    elsif v_order.delivery_status = 'delivered'
      and new.status in ('pending', 'scheduled', 'processing', 'verification_required', 'awaiting_sms') then
      new.status := 'cancelled';
      new.error_message := 'Closed: order already delivered. No automatic resend.';
    end if;
  end if;

  if new.status = 'processing' then
    if tg_op = 'INSERT' then
      new.processing_started_at := clock_timestamp();
    elsif old.status is distinct from 'processing' then
      new.processing_started_at := clock_timestamp();
    else
      -- Heartbeats/dispatch markers/callback timestamps cannot extend this lease.
      new.processing_started_at := old.processing_started_at;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.track_delivery_processing_lease() from public, anon, authenticated;
create trigger zzzz_track_delivery_processing_lease
before insert or update on public.delivery_queue
for each row execute function private.track_delivery_processing_lease();

create or replace function private.close_final_order_deliveries()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'cancelled' or new.delivery_status in ('delivered', 'cancelled') then
    update public.delivery_queue
    set status = 'cancelled',
        error_message = case when new.delivery_status = 'delivered'
          then 'Closed: order already delivered. No automatic resend.'
          else 'Closed: order cancelled. No automatic resend.' end
    where tenant_id = new.tenant_id and order_id = new.id
      and status in ('pending', 'scheduled', 'processing', 'verification_required', 'awaiting_sms');
  end if;
  return new;
end;
$$;
revoke all on function private.close_final_order_deliveries() from public, anon, authenticated;
create trigger zzzz_close_final_order_deliveries
after update of status, delivery_status on public.orders
for each row execute function private.close_final_order_deliveries();

-- Internal maintenance: never requeue an ambiguous delivery, even without a
-- dispatch marker (the marker itself may have been lost in transit).
create or replace function private.expire_delivery_processing(p_tenant_id uuid default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_order public.orders%rowtype;
  v_candidate record;
  v_row record;
  v_expired integer := 0;
  v_closed integer := 0;
  v_order_expired boolean;
begin
  -- Lock parent before child; skip concurrent callbacks/admin actions.
  for v_candidate in
    select distinct q.order_id, q.tenant_id
    from public.delivery_queue q
    join public.orders o on o.id = q.order_id and o.tenant_id = q.tenant_id
    where (p_tenant_id is null or q.tenant_id = p_tenant_id)
      and (
        (q.status in ('pending', 'scheduled', 'processing', 'verification_required', 'awaiting_sms')
          and (o.delivery_status in ('delivered', 'cancelled') or o.status = 'cancelled'))
        or (q.status = 'processing' and q.processing_started_at <= clock_timestamp() - interval '90 seconds'
          and q.ussd_code not like 'API:%')
      )
  loop
    select * into v_order from public.orders
    where id = v_candidate.order_id and tenant_id = v_candidate.tenant_id
    for update skip locked;
    if not found then continue; end if;
    v_order_expired := false;
    for v_row in
      select q.* from public.delivery_queue q
      where q.order_id = v_order.id and q.tenant_id = v_order.tenant_id
        and q.status in ('pending', 'scheduled', 'processing', 'verification_required', 'awaiting_sms')
      for update skip locked
    loop
      if v_order.delivery_status in ('delivered', 'cancelled') or v_order.status = 'cancelled' then
        update public.delivery_queue set status = 'cancelled',
          error_message = 'Closed: parent order is final. No automatic resend.'
        where id = v_row.id and tenant_id = v_order.tenant_id;
        v_closed := v_closed + 1;
      elsif v_row.status = 'processing'
        and v_row.processing_started_at <= clock_timestamp() - interval '90 seconds'
        and v_row.ussd_code not like 'API:%' then
        update public.delivery_queue set status = 'verification_required',
          error_message = 'Processing exceeded 90s. SIM released; verify carrier result before any resend.'
        where id = v_row.id and tenant_id = v_order.tenant_id and status = 'processing';
        v_expired := v_expired + 1;
        v_order_expired := true;
      end if;
    end loop;
    if v_order_expired then
      update public.orders set delivery_status = 'verification_required',
        delivery_notes = 'Processing exceeded 90s. SIM released; verify carrier result before any resend.'
      where id = v_order.id and tenant_id = v_order.tenant_id
        and delivery_status not in ('delivered', 'cancelled') and status <> 'cancelled';
    end if;
  end loop;

  -- Manual deliveries may have no parent order.
  for v_row in
    select q.id from public.delivery_queue q
    where q.order_id is null and q.status = 'processing'
      and (p_tenant_id is null or q.tenant_id = p_tenant_id)
      and q.processing_started_at <= clock_timestamp() - interval '90 seconds'
      and q.ussd_code not like 'API:%'
    for update skip locked
  loop
    update public.delivery_queue set status = 'verification_required',
      error_message = 'Processing exceeded 90s. SIM released; verify carrier result before any resend.'
    where id = v_row.id and status = 'processing';
    v_expired := v_expired + 1;
  end loop;
  return jsonb_build_object('expired', v_expired, 'closed', v_closed);
end;
$$;
revoke all on function private.expire_delivery_processing(uuid) from public, anon, authenticated;
grant usage on schema private to service_role;
grant execute on function private.expire_delivery_processing(uuid) to service_role;

-- Only server code may request maintenance; never expose cross-tenant mutation.
create or replace function public.expire_delivery_processing(p_tenant_id uuid)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.expire_delivery_processing(p_tenant_id);
$$;
revoke all on function public.expire_delivery_processing(uuid) from public, anon, authenticated;
grant execute on function public.expire_delivery_processing(uuid) to service_role;

CREATE OR REPLACE FUNCTION public.claim_next_delivery(p_device_id text, p_providers text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_device record;
  v_order record;
  v_slot integer;
  v_my_priority integer;
  v_better boolean;
  v_pin text;
  v_result jsonb;
begin
  -- Device itself must be active, unblocked and online in the last 3 minutes.
  select id, tenant_id
    into v_device
  from public.android_devices
  where device_id = p_device_id
    and archived_at is null
    and is_active = true
    and tenant_id is not null
    and delivery_blocked_at is null
    and last_ping_at is not null
    and last_ping_at > now() - interval '3 minutes'
  order by last_ping_at desc nulls last, created_at desc
  limit 1;

  if v_device.tenant_id is null then
    return null;
  end if;

  -- Maintenance runs before checking availability, including missing dispatch markers.
  perform private.expire_delivery_processing(v_device.tenant_id);
  -- Serialize claims from concurrent polls on the same physical device.
  if not pg_try_advisory_xact_lock(hashtextextended('delivery-device:' || p_device_id, 0)) then
    return null;
  end if;

  loop
    v_order := null;

    -- Strict provider matching: this device may only see a pending order when it
    -- currently has an AVAILABLE SIM explicitly assigned to that exact provider.
    select dq.*
      into v_order
    from public.delivery_queue dq
    where dq.tenant_id = v_device.tenant_id
      and dq.status = 'pending'
      and dq.dispatched_at is null
      and not exists (
        select 1 from public.orders o
        where o.id = dq.order_id and o.tenant_id = dq.tenant_id
          and (o.delivery_status in ('delivered', 'cancelled') or o.status = 'cancelled')
      )
      and lower(trim(dq.provider_name)) = any (
        select lower(trim(x)) from unnest(p_providers) as x
      )
      and (dq.scheduled_at is null or dq.scheduled_at <= now())
      and exists (
        select 1
        from public.tenant_sim_routes(v_device.tenant_id) r
        where r.device_id = p_device_id
          and r.available
          and r.provider = lower(trim(dq.provider_name))
      )
    order by dq.created_at asc
    limit 1
    for update skip locked;

    if v_order.id is null then
      return null;
    end if;

    v_slot := null;
    v_my_priority := null;
    v_better := false;

    -- Pick this device's best free SIM for the exact provider.
    select r.sim_slot, r.priority
      into v_slot, v_my_priority
    from public.tenant_sim_routes(v_device.tenant_id) r
    where r.device_id = p_device_id
      and r.available
      and r.provider = lower(trim(v_order.provider_name))
    order by r.priority asc, r.sim_slot asc
    limit 1;

    if v_slot is null then
      return null;
    end if;

    -- Waiter Model: a higher-number priority SIM must wait while ANY lower-number
    -- priority SIM for the same tenant/provider is free. Same-priority SIMs may
    -- work concurrently.
    select exists (
      select 1
      from public.tenant_sim_routes(v_device.tenant_id) r
      where r.available
        and r.provider = lower(trim(v_order.provider_name))
        and r.priority < v_my_priority
    ) into v_better;

    if v_better then
      return null;
    end if;

    update public.delivery_queue
    set status = 'processing',
        android_device_id = p_device_id,
        sim_slot = v_slot,
        last_attempt_at = now()
    where id = v_order.id
      and tenant_id = v_device.tenant_id
      and status = 'pending'
    returning * into v_order;

    if v_order.id is null then
      continue;
    end if;

    v_pin := nullif(v_order.sim_password, '');

    if v_pin is null then
      select nullif(di.sim_password, '')
        into v_pin
      from public.orders o
      join public.delivery_instructions di
        on di.tenant_id = o.tenant_id
       and di.provider_id = o.provider_id
      left join public.data_packages_config pk
        on pk.id = o.package_id
      where o.id = v_order.order_id
        and o.tenant_id = v_device.tenant_id
        and di.sim_password is not null
        and di.sim_password <> ''
        and (
          di.package_id = o.package_id
          or (di.package_id is null and di.category_id = pk.category_id)
          or (di.package_id is null and di.category_id is null)
        )
      order by (di.package_id = o.package_id) desc,
               (di.category_id is not null) desc
      limit 1;
    end if;

    v_result := row_to_json(v_order)::jsonb;
    v_result := v_result || jsonb_build_object('pin_code', coalesce(v_pin, ''));
    return v_result;
  end loop;
end;
$function$;



create extension if not exists pg_cron;
select cron.schedule('expire-delivery-processing-90s', '10 seconds',
  'select private.expire_delivery_processing();');
-- Keep the 10-second watchdog's run history bounded.
select cron.schedule('cleanup-delivery-watchdog-history', '17 2 * * *',
  $job$delete from cron.job_run_details
    where jobid = (select jobid from cron.job where jobname = 'expire-delivery-processing-90s')
      and end_time < now() - interval '2 days';$job$);

-- Reconcile existing blocked/finished rows for every tenant immediately.
select private.expire_delivery_processing();
