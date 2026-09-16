create table if not exists public.tenant_push_config (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  onesignal_app_id text not null,
  rest_api_key_secret_id uuid,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_push_config_app_id_format check (
    onesignal_app_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  )
);

alter table public.tenant_push_config enable row level security;

revoke all on public.tenant_push_config from anon, authenticated;
grant all on public.tenant_push_config to service_role;

comment on table public.tenant_push_config is
  'Server-only per-tenant native push routing. REST credentials are referenced by Vault secret id and never exposed to storefront clients.';
comment on column public.tenant_push_config.onesignal_app_id is
  'Public OneSignal App ID baked into this tenant APK at build time.';
comment on column public.tenant_push_config.rest_api_key_secret_id is
  'Optional Supabase Vault secret id containing the OneSignal REST API key.';

create or replace function public.get_tenant_push_credentials(p_tenant_id uuid)
returns table (
  onesignal_app_id text,
  rest_api_key text,
  enabled boolean
)
language sql
security definer
set search_path = public, vault
as $$
  select
    c.onesignal_app_id,
    s.decrypted_secret as rest_api_key,
    c.enabled
  from public.tenant_push_config c
  left join vault.decrypted_secrets s on s.id = c.rest_api_key_secret_id
  where c.tenant_id = p_tenant_id
  limit 1;
$$;

revoke all on function public.get_tenant_push_credentials(uuid) from public, anon, authenticated;
grant execute on function public.get_tenant_push_credentials(uuid) to service_role;

create or replace function public.set_tenant_push_config(
  p_tenant_id uuid,
  p_onesignal_app_id text,
  p_rest_api_key text,
  p_enabled boolean default true
)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_secret_id uuid;
  v_secret_name text;
begin
  if p_tenant_id is null or not exists (select 1 from public.tenants where id = p_tenant_id) then
    raise exception 'tenant_not_found';
  end if;

  if p_onesignal_app_id is null or p_onesignal_app_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'invalid_onesignal_app_id';
  end if;

  if coalesce(length(trim(p_rest_api_key)), 0) < 8 then
    raise exception 'invalid_rest_api_key';
  end if;

  select rest_api_key_secret_id into v_secret_id
  from public.tenant_push_config
  where tenant_id = p_tenant_id;

  v_secret_name := 'tenant_onesignal_rest_' || p_tenant_id::text;

  if v_secret_id is null then
    v_secret_id := vault.create_secret(
      p_rest_api_key,
      v_secret_name,
      'OneSignal REST API key for tenant ' || p_tenant_id::text,
      null
    );
  else
    perform vault.update_secret(
      v_secret_id,
      p_rest_api_key,
      v_secret_name,
      'OneSignal REST API key for tenant ' || p_tenant_id::text,
      null
    );
  end if;

  insert into public.tenant_push_config (
    tenant_id, onesignal_app_id, rest_api_key_secret_id, enabled, updated_at
  ) values (
    p_tenant_id, lower(p_onesignal_app_id), v_secret_id, coalesce(p_enabled, true), now()
  )
  on conflict (tenant_id) do update set
    onesignal_app_id = excluded.onesignal_app_id,
    rest_api_key_secret_id = excluded.rest_api_key_secret_id,
    enabled = excluded.enabled,
    updated_at = now();
end;
$$;

revoke all on function public.set_tenant_push_config(uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.set_tenant_push_config(uuid, text, text, boolean) to service_role;
