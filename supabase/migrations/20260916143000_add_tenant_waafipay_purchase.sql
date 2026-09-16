-- Tenant-isolated WaafiPay Direct Purchase credentials and payment ledger.
-- API keys live in Supabase Vault and are never readable by anon/authenticated roles.

create table if not exists private.tenant_waafipay_integrations (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  merchant_uid text not null,
  api_user_id text not null,
  api_key_secret_id uuid not null,
  environment text not null default 'production'
    check (environment in ('sandbox', 'production')),
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table private.tenant_waafipay_integrations enable row level security;

create table if not exists public.waafipay_transactions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  client_reference text not null,
  reference_id text not null,
  request_id uuid not null,
  order_id uuid references public.orders(id) on delete set null,
  payer_phone text not null,
  receiver_phone text not null,
  package_id uuid not null references public.data_packages_config(id) on delete restrict,
  payment_provider_id uuid references public.payment_providers_config(id) on delete set null,
  amount numeric(12,2) not null check (amount > 0),
  currency text not null default 'USD',
  environment text not null check (environment in ('sandbox', 'production')),
  status text not null default 'processing'
    check (status in ('processing', 'approved', 'declined', 'failed', 'unknown')),
  waafi_state text,
  response_code text,
  response_message text,
  waafi_transaction_id text,
  issuer_transaction_id text,
  raw_response jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz,
  unique (tenant_id, client_reference),
  unique (tenant_id, reference_id)
);

create index if not exists idx_waafipay_transactions_tenant_created
  on public.waafipay_transactions (tenant_id, created_at desc);
create index if not exists idx_waafipay_transactions_order
  on public.waafipay_transactions (order_id)
  where order_id is not null;
create unique index if not exists idx_waafipay_transactions_provider_tx
  on public.waafipay_transactions (tenant_id, waafi_transaction_id)
  where waafi_transaction_id is not null;

alter table public.waafipay_transactions enable row level security;
revoke all on public.waafipay_transactions from public, anon, authenticated;
grant all on public.waafipay_transactions to service_role;

create or replace function public.waafipay_admin_status(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  r private.tenant_waafipay_integrations%rowtype;
begin
  select * into r
  from private.tenant_waafipay_integrations
  where tenant_id = p_tenant_id;

  if not found then
    return jsonb_build_object(
      'configured', false,
      'merchant_uid', null,
      'api_user_id', null,
      'environment', 'production',
      'is_active', false,
      'has_api_key', false
    );
  end if;

  return jsonb_build_object(
    'configured', true,
    'merchant_uid', r.merchant_uid,
    'api_user_id', r.api_user_id,
    'environment', r.environment,
    'is_active', r.is_active,
    'has_api_key', r.api_key_secret_id is not null,
    'updated_at', r.updated_at
  );
end;
$$;

create or replace function public.waafipay_admin_save(
  p_tenant_id uuid,
  p_merchant_uid text,
  p_api_user_id text,
  p_api_key text default null,
  p_environment text default 'production',
  p_is_active boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, vault
as $$
declare
  r private.tenant_waafipay_integrations%rowtype;
  v_merchant_uid text := btrim(coalesce(p_merchant_uid, ''));
  v_api_user_id text := btrim(coalesce(p_api_user_id, ''));
  v_environment text := lower(btrim(coalesce(p_environment, 'production')));
  v_api_key text := nullif(btrim(coalesce(p_api_key, '')), '');
  v_secret_id uuid;
begin
  if p_tenant_id is null or not exists (select 1 from public.tenants where id = p_tenant_id) then
    raise exception 'invalid_tenant';
  end if;
  if length(v_merchant_uid) < 3 or length(v_merchant_uid) > 50 then
    raise exception 'invalid_merchant_uid';
  end if;
  if length(v_api_user_id) < 3 or length(v_api_user_id) > 50 then
    raise exception 'invalid_api_user_id';
  end if;
  if v_environment not in ('sandbox', 'production') then
    raise exception 'invalid_environment';
  end if;

  select * into r
  from private.tenant_waafipay_integrations
  where tenant_id = p_tenant_id
  for update;

  if not found then
    if v_api_key is null or length(v_api_key) < 10 then
      raise exception 'api_key_required';
    end if;

    v_secret_id := vault.create_secret(
      v_api_key,
      format('waafipay:%s:api-key:%s', p_tenant_id, gen_random_uuid()),
      format('WaafiPay Direct Purchase API key for tenant %s', p_tenant_id)
    );

    insert into private.tenant_waafipay_integrations
      (tenant_id, merchant_uid, api_user_id, api_key_secret_id, environment, is_active, updated_at)
    values
      (p_tenant_id, v_merchant_uid, v_api_user_id, v_secret_id, v_environment, p_is_active, now());
  else
    v_secret_id := r.api_key_secret_id;
    if v_api_key is not null then
      if length(v_api_key) < 10 then raise exception 'invalid_api_key'; end if;
      perform vault.update_secret(
        v_secret_id,
        v_api_key,
        null,
        format('WaafiPay Direct Purchase API key for tenant %s', p_tenant_id)
      );
    end if;

    update private.tenant_waafipay_integrations
    set merchant_uid = v_merchant_uid,
        api_user_id = v_api_user_id,
        environment = v_environment,
        is_active = p_is_active,
        updated_at = now()
    where tenant_id = p_tenant_id;
  end if;

  -- Keep the storefront payment option in sync with the integration.
  -- The row belongs only to this tenant and is never copied with credentials.
  update public.payment_providers_config
  set is_active = p_is_active,
      updated_at = now()
  where tenant_id = p_tenant_id
    and lower(btrim(provider_name)) = 'waafipay';

  if not found and p_is_active then
    insert into public.payment_providers_config (
      tenant_id,
      provider_name,
      provider_logo,
      commission_rate,
      is_active,
      display_order,
      prefix_code,
      ussd_code_template,
      payment_number,
      updated_at
    )
    values (
      p_tenant_id,
      'WaafiPay',
      null,
      0,
      true,
      coalesce((
        select max(display_order) + 1
        from public.payment_providers_config
        where tenant_id = p_tenant_id
      ), 1),
      null,
      null,
      null,
      now()
    );
  end if;

  return public.waafipay_admin_status(p_tenant_id);
end;
$;

create or replace function public.waafipay_admin_credentials(p_tenant_id uuid)
returns jsonb
language sql
security definer
set search_path = public, private, vault
as $$
  select jsonb_build_object(
    'tenant_id', w.tenant_id,
    'merchant_uid', w.merchant_uid,
    'api_user_id', w.api_user_id,
    'api_key', d.decrypted_secret,
    'environment', w.environment,
    'is_active', w.is_active
  )
  from private.tenant_waafipay_integrations w
  join vault.decrypted_secrets d on d.id = w.api_key_secret_id
  where w.tenant_id = p_tenant_id;
$$;

create or replace function public.waafipay_admin_delete(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private, vault
as $$
declare
  v_secret_id uuid;
begin
  select api_key_secret_id into v_secret_id
  from private.tenant_waafipay_integrations
  where tenant_id = p_tenant_id;

  delete from private.tenant_waafipay_integrations where tenant_id = p_tenant_id;
  if v_secret_id is not null then
    delete from vault.secrets where id = v_secret_id;
  end if;

  update public.payment_providers_config
  set is_active = false,
      updated_at = now()
  where tenant_id = p_tenant_id
    and lower(btrim(provider_name)) = 'waafipay';

  return public.waafipay_admin_status(p_tenant_id);
end;
$$;

revoke all on function public.waafipay_admin_status(uuid) from public, anon, authenticated;
revoke all on function public.waafipay_admin_save(uuid, text, text, text, text, boolean) from public, anon, authenticated;
revoke all on function public.waafipay_admin_credentials(uuid) from public, anon, authenticated;
revoke all on function public.waafipay_admin_delete(uuid) from public, anon, authenticated;

grant execute on function public.waafipay_admin_status(uuid) to service_role;
grant execute on function public.waafipay_admin_save(uuid, text, text, text, text, boolean) to service_role;
grant execute on function public.waafipay_admin_credentials(uuid) to service_role;
grant execute on function public.waafipay_admin_delete(uuid) to service_role;
