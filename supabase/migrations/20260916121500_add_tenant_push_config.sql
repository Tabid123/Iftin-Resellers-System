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
