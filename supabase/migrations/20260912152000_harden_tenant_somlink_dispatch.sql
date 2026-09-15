-- Harden the Somlink delivery bridge before production deployment.
-- The delivery Edge Function remains verify_jwt=false because pg_net is the caller,
-- but every dispatch is authenticated with a server-only random secret stored in Vault.
-- Runtime URL is environment-specific and is deliberately NOT hard-coded in migrations.

create table if not exists private.somlink_runtime_config (
  singleton boolean primary key default true check (singleton),
  edge_base_url text,
  dispatch_secret_id uuid not null,
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table private.somlink_runtime_config enable row level security;
revoke all on table private.somlink_runtime_config from public, anon, authenticated;
revoke all on table private.tenant_somlink_integrations from public, anon, authenticated;

do $$
declare
  v_secret_id uuid;
begin
  if not exists (select 1 from private.somlink_runtime_config where singleton = true) then
    v_secret_id := vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      format('somlink:dispatch:%s', gen_random_uuid()),
      'Server-only secret used by pg_net to authenticate Somlink delivery dispatches'
    );

    insert into private.somlink_runtime_config
      (singleton, edge_base_url, dispatch_secret_id, enabled, updated_at)
    values
      (true, null, v_secret_id, false, now());
  end if;
end;
$$;

-- Keep Vault clean if a tenant is deleted or its integration is removed directly.
create or replace function private.cleanup_somlink_password_secret()
returns trigger
language plpgsql
security definer
set search_path = public, private, vault
as $$
begin
  if old.password_secret_id is not null then
    delete from vault.secrets where id = old.password_secret_id;
  end if;
  return old;
end;
$$;

drop trigger if exists trg_cleanup_somlink_password_secret on private.tenant_somlink_integrations;
create trigger trg_cleanup_somlink_password_secret
before delete on private.tenant_somlink_integrations
for each row execute function private.cleanup_somlink_password_secret();

create or replace function public.somlink_admin_runtime_status()
returns jsonb
language sql
stable
security definer
set search_path = public, private
as $$
  select coalesce(
    (
      select jsonb_build_object(
        'configured', true,
        'edge_base_url', r.edge_base_url,
        'enabled', r.enabled,
        'has_dispatch_secret', r.dispatch_secret_id is not null,
        'updated_at', r.updated_at
      )
      from private.somlink_runtime_config r
      where r.singleton = true
    ),
    jsonb_build_object(
      'configured', false,
      'edge_base_url', null,
      'enabled', false,
      'has_dispatch_secret', false,
      'updated_at', null
    )
  );
$$;

create or replace function public.somlink_admin_dispatch_secret()
returns text
language sql
stable
security definer
set search_path = public, private, vault
as $$
  select d.decrypted_secret
  from private.somlink_runtime_config r
  join vault.decrypted_secrets d on d.id = r.dispatch_secret_id
  where r.singleton = true
  limit 1;
$$;

create or replace function public.somlink_admin_configure_runtime(
  p_edge_base_url text,
  p_enabled boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_url text := regexp_replace(btrim(coalesce(p_edge_base_url, '')), '/+$', '');
begin
  if v_url <> '' and v_url !~ '^https://[A-Za-z0-9.-]+(:[0-9]+)?$' then
    raise exception 'invalid_edge_base_url';
  end if;

  if coalesce(p_enabled, false) and v_url = '' then
    raise exception 'edge_base_url_required';
  end if;

  update private.somlink_runtime_config
  set edge_base_url = nullif(v_url, ''),
      enabled = coalesce(p_enabled, false),
      updated_at = now()
  where singleton = true;

  return public.somlink_admin_runtime_status();
end;
$$;

revoke all on function public.somlink_admin_runtime_status() from public, anon, authenticated;
revoke all on function public.somlink_admin_dispatch_secret() from public, anon, authenticated;
revoke all on function public.somlink_admin_configure_runtime(text, boolean) from public, anon, authenticated;

grant execute on function public.somlink_admin_runtime_status() to service_role;
grant execute on function public.somlink_admin_dispatch_secret() to service_role;
grant execute on function public.somlink_admin_configure_runtime(text, boolean) to service_role;

-- The catalog is visible only when BOTH the tenant credentials and the environment
-- delivery runtime are ready. This prevents paid orders from entering a disabled bridge.
create or replace function public.somlink_tenant_ready()
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select
    exists (
      select 1
      from private.somlink_runtime_config r
      where r.singleton = true
        and r.enabled = true
        and nullif(btrim(r.edge_base_url), '') is not null
    )
    and exists (
      select 1
      from private.tenant_somlink_integrations s
      where s.tenant_id = public.current_request_tenant_id()
        and s.connection_status = 'connected'
        and s.is_active = true
    );
$$;

revoke all on function public.somlink_tenant_ready() from public;
grant execute on function public.somlink_tenant_ready() to anon, authenticated, service_role;

-- Demo tenants must never call the live Somlink API. Their existing demo delivery
-- simulator remains authoritative.
create or replace function private.prepare_somlink_delivery_queue()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_bundle_id integer;
begin
  if public.is_demo_tenant(new.tenant_id) then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if not (
      old.provider_name = 'somlink'
      and old.ussd_code like 'API:SOMLINK:%'
      and old.status = 'failed'
      and new.status in ('pending', 'scheduled')
    ) then
      return new;
    end if;
  end if;

  select p.somlink_bundle_id into v_bundle_id
  from public.orders o
  join public.data_packages_config p
    on p.id = o.package_id and p.tenant_id = o.tenant_id
  where o.id = new.order_id
    and o.tenant_id = new.tenant_id
    and p.somlink_bundle_id is not null
  limit 1;

  if v_bundle_id is null then
    return new;
  end if;

  new.provider_name := 'somlink';
  new.ussd_code := 'API:SOMLINK:' || v_bundle_id::text;
  new.package_code := v_bundle_id::text;
  new.status := 'processing';
  new.dispatched_at := null;
  new.dispatch_device_id := 'somlink-api';
  new.completed_at := null;
  new.error_message := null;
  new.provider_response := null;
  new.somlink_response := null;
  new.last_attempt_at := null;
  return new;
end;
$$;

create or replace function private.dispatch_somlink_delivery_queue()
returns trigger
language plpgsql
security definer
set search_path = public, private, vault, net
as $$
declare
  v_base_url text;
  v_secret text;
  v_enabled boolean := false;
begin
  if new.provider_name = 'somlink'
     and new.ussd_code like 'API:SOMLINK:%'
     and new.status = 'processing'
     and new.dispatched_at is null
     and not public.is_demo_tenant(new.tenant_id) then

    select r.edge_base_url, r.enabled, d.decrypted_secret
      into v_base_url, v_enabled, v_secret
    from private.somlink_runtime_config r
    join vault.decrypted_secrets d on d.id = r.dispatch_secret_id
    where r.singleton = true
    limit 1;

    if coalesce(v_enabled, false)
       and nullif(btrim(v_base_url), '') is not null
       and nullif(v_secret, '') is not null then
      perform net.http_post(
        url := regexp_replace(v_base_url, '/+$', '') || '/functions/v1/somlink-delivery',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-somlink-dispatch-secret', v_secret
        ),
        body := jsonb_build_object('queue_id', new.id),
        timeout_milliseconds := 10000
      );
    end if;
  end if;
  return null;
end;
$$;

-- Triggers already point at these function names from the base Somlink migration.
-- Recreate them defensively so a partial/staging migration also lands in the safe state.
drop trigger if exists trg_prepare_somlink_delivery_queue on public.delivery_queue;
create trigger trg_prepare_somlink_delivery_queue
before insert or update on public.delivery_queue
for each row execute function private.prepare_somlink_delivery_queue();

drop trigger if exists trg_dispatch_somlink_delivery_queue on public.delivery_queue;
create trigger trg_dispatch_somlink_delivery_queue
after insert or update on public.delivery_queue
for each row execute function private.dispatch_somlink_delivery_queue();
