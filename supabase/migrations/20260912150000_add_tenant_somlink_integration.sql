-- Tenant-isolated Somlink API credentials + direct API delivery bridge.
-- Credentials are never cloned by the master template. Only bundle ids/catalog data are cloned.
-- Explicit uuid casts below avoid PostgreSQL inferring untyped NULLs as text
-- in INSERT...SELECT expressions targeting uuid columns.

create extension if not exists pg_net with schema extensions;

create table if not exists private.tenant_somlink_integrations (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  wallet_phone text not null,
  password_secret_id uuid not null,
  is_active boolean not null default false,
  connection_status text not null default 'untested'
    check (connection_status in ('untested', 'connected', 'failed')),
  last_tested_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table private.tenant_somlink_integrations enable row level security;

create or replace function public.somlink_tenant_ready()
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select exists (
    select 1
    from private.tenant_somlink_integrations s
    where s.tenant_id = public.current_request_tenant_id()
      and s.connection_status = 'connected'
      and s.is_active = true
  );
$$;

revoke all on function public.somlink_tenant_ready() from public;
grant execute on function public.somlink_tenant_ready() to anon, authenticated, service_role;

create or replace function public.somlink_admin_status(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  r private.tenant_somlink_integrations%rowtype;
begin
  select * into r
  from private.tenant_somlink_integrations
  where tenant_id = p_tenant_id;

  if not found then
    return jsonb_build_object(
      'configured', false,
      'wallet_phone', null,
      'is_active', false,
      'connection_status', 'untested',
      'last_tested_at', null,
      'last_error', null,
      'has_password', false
    );
  end if;

  return jsonb_build_object(
    'configured', true,
    'wallet_phone', r.wallet_phone,
    'is_active', r.is_active,
    'connection_status', r.connection_status,
    'last_tested_at', r.last_tested_at,
    'last_error', r.last_error,
    'has_password', r.password_secret_id is not null
  );
end;
$$;

create or replace function public.somlink_admin_save(
  p_tenant_id uuid,
  p_wallet_phone text,
  p_password text default null,
  p_is_active boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, vault
as $$
declare
  r private.tenant_somlink_integrations%rowtype;
  v_wallet text := regexp_replace(coalesce(p_wallet_phone, ''), '[^0-9+]', '', 'g');
  v_secret_id uuid;
  v_password_changed boolean := coalesce(length(p_password), 0) > 0;
  v_changed boolean := false;
  v_status text := 'untested';
  v_active boolean := false;
begin
  if p_tenant_id is null or not exists (select 1 from public.tenants where id = p_tenant_id) then
    raise exception 'invalid_tenant';
  end if;
  if length(v_wallet) < 7 then
    raise exception 'invalid_wallet_phone';
  end if;

  select * into r
  from private.tenant_somlink_integrations
  where tenant_id = p_tenant_id
  for update;

  if not found then
    if not v_password_changed then
      raise exception 'password_required';
    end if;

    v_secret_id := vault.create_secret(
      p_password,
      format('somlink:%s:password:%s', p_tenant_id, gen_random_uuid()),
      format('Somlink API password for tenant %s', p_tenant_id)
    );

    insert into private.tenant_somlink_integrations
      (tenant_id, wallet_phone, password_secret_id, is_active, connection_status, updated_at)
    values
      (p_tenant_id, v_wallet, v_secret_id, false, 'untested', now());
  else
    v_secret_id := r.password_secret_id;
    v_changed := r.wallet_phone is distinct from v_wallet or v_password_changed;

    if v_password_changed then
      perform vault.update_secret(
        v_secret_id,
        p_password,
        null,
        format('Somlink API password for tenant %s', p_tenant_id)
      );
    end if;

    if v_changed then
      v_status := 'untested';
      v_active := false;
    else
      v_status := r.connection_status;
      v_active := coalesce(p_is_active, false) and r.connection_status = 'connected';
    end if;

    update private.tenant_somlink_integrations
    set wallet_phone = v_wallet,
        is_active = v_active,
        connection_status = v_status,
        last_error = case when v_changed then null else last_error end,
        updated_at = now()
    where tenant_id = p_tenant_id;
  end if;

  return public.somlink_admin_status(p_tenant_id);
end;
$$;

create or replace function public.somlink_admin_credentials(p_tenant_id uuid)
returns jsonb
language sql
security definer
set search_path = public, private, vault
as $$
  select jsonb_build_object(
    'tenant_id', s.tenant_id,
    'wallet_phone', s.wallet_phone,
    'password', d.decrypted_secret,
    'is_active', s.is_active,
    'connection_status', s.connection_status
  )
  from private.tenant_somlink_integrations s
  join vault.decrypted_secrets d on d.id = s.password_secret_id
  where s.tenant_id = p_tenant_id;
$$;

create or replace function public.somlink_admin_set_connection(
  p_tenant_id uuid,
  p_status text,
  p_error text default null,
  p_is_active boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if p_status not in ('untested', 'connected', 'failed') then
    raise exception 'invalid_status';
  end if;

  update private.tenant_somlink_integrations
  set connection_status = p_status,
      is_active = case
        when p_status <> 'connected' then false
        when p_is_active is null then is_active
        else p_is_active
      end,
      last_tested_at = now(),
      last_error = nullif(left(coalesce(p_error, ''), 500), ''),
      updated_at = now()
  where tenant_id = p_tenant_id;

  return public.somlink_admin_status(p_tenant_id);
end;
$$;

create or replace function public.somlink_admin_delete(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private, vault
as $$
declare
  v_secret_id uuid;
begin
  select password_secret_id into v_secret_id
  from private.tenant_somlink_integrations
  where tenant_id = p_tenant_id;

  delete from private.tenant_somlink_integrations where tenant_id = p_tenant_id;
  if v_secret_id is not null then
    delete from vault.secrets where id = v_secret_id;
  end if;

  return public.somlink_admin_status(p_tenant_id);
end;
$$;

revoke all on function public.somlink_admin_status(uuid) from public, anon, authenticated;
revoke all on function public.somlink_admin_save(uuid, text, text, boolean) from public, anon, authenticated;
revoke all on function public.somlink_admin_credentials(uuid) from public, anon, authenticated;
revoke all on function public.somlink_admin_set_connection(uuid, text, text, boolean) from public, anon, authenticated;
revoke all on function public.somlink_admin_delete(uuid) from public, anon, authenticated;

grant execute on function public.somlink_admin_status(uuid) to service_role;
grant execute on function public.somlink_admin_save(uuid, text, text, boolean) to service_role;
grant execute on function public.somlink_admin_credentials(uuid) to service_role;
grant execute on function public.somlink_admin_set_connection(uuid, text, text, boolean) to service_role;
grant execute on function public.somlink_admin_delete(uuid) to service_role;

create or replace function public.get_public_packages(p_provider_id uuid)
returns table(
  id uuid,
  package_name text,
  data_amount text,
  validity_days text,
  selling_price numeric,
  cost_price numeric,
  is_active boolean,
  category_id uuid,
  provider_id uuid,
  connection_type_label text,
  ussd_code text,
  display_order integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id, p.package_name, p.data_amount, p.validity_days, p.selling_price,
    p.cost_price, p.is_active, p.category_id, p.provider_id,
    p.connection_type_label, p.ussd_code, p.display_order
  from public.data_packages_config p
  where p.tenant_id = public.current_request_tenant_id()
    and coalesce(p.is_active, true) = true
    and p.provider_id = p_provider_id
    and (p.somlink_bundle_id is null or public.somlink_tenant_ready())
  order by p.display_order nulls last, p.selling_price, p.package_name;
$$;

create or replace function public.get_active_categories(p_provider_id uuid default null)
returns table(
  id uuid,
  category_name text,
  display_order integer,
  is_active boolean,
  provider_id uuid,
  category_image text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.category_name, c.display_order, c.is_active, c.provider_id,
         c.category_image, c.created_at, c.updated_at
  from public.package_categories c
  where c.tenant_id = public.current_request_tenant_id()
    and coalesce(c.is_active, true) = true
    and (p_provider_id is null or c.provider_id = p_provider_id)
    and (
      public.somlink_tenant_ready()
      or exists (
        select 1 from public.data_packages_config p
        where p.tenant_id = c.tenant_id
          and p.category_id = c.id
          and coalesce(p.is_active, true) = true
          and p.somlink_bundle_id is null
      )
      or not exists (
        select 1 from public.data_packages_config p
        where p.tenant_id = c.tenant_id
          and p.category_id = c.id
          and coalesce(p.is_active, true) = true
          and p.somlink_bundle_id is not null
      )
    )
  order by c.display_order nulls last, c.category_name;
$$;

create or replace function public.get_active_providers()
returns setof public.providers_config
language sql
stable
security definer
set search_path = public
as $$
  select p.*
  from public.providers_config p
  where p.tenant_id = public.current_request_tenant_id()
    and coalesce(p.is_active, true) = true
    and (
      public.somlink_tenant_ready()
      or exists (
        select 1 from public.data_packages_config x
        where x.tenant_id = p.tenant_id
          and x.provider_id = p.id
          and coalesce(x.is_active, true) = true
          and x.somlink_bundle_id is null
      )
      or not exists (
        select 1 from public.data_packages_config x
        where x.tenant_id = p.tenant_id
          and x.provider_id = p.id
          and coalesce(x.is_active, true) = true
          and x.somlink_bundle_id is not null
      )
    )
  order by p.display_order nulls last, p.provider_name;
$$;

with template as (
  select id from private.master_templates where template_key = 'xog-dhameystiran-iftin'
), somlink as (
  select p.source_id
  from private.master_template_providers p
  join template t on t.id = p.template_id
  where lower(btrim(p.provider_name)) = 'somlink'
  limit 1
)
insert into private.master_template_delivery
  (template_id, source_id, source_provider_id, source_category_id, source_package_id,
   instruction_type, ussd_code, provider_name, execution_order, code_template,
   sim_password, notes, instruction_template)
select t.id,
       md5('xog-dhameystiran-iftin:delivery:somlink-api-bridge')::uuid,
       s.source_id, null::uuid, null::uuid,
       'ussd', null, 'Somlink', 1, '*000*{receiver_phone}#',
       '', 'Somlink API bridge; intercepted by delivery_queue trigger.', ''
from template t cross join somlink s
on conflict (template_id, source_id) do update set
  source_provider_id = excluded.source_provider_id,
  code_template = excluded.code_template,
  notes = excluded.notes;

insert into public.delivery_instructions
  (tenant_id, instruction_type, provider_name, execution_order, provider_id,
   category_id, package_id, code_template, sim_password, notes, instruction_template)
select distinct p.tenant_id, 'ussd', p.provider_name, 1, p.id,
       null::uuid, null::uuid, '*000*{receiver_phone}#', '',
       'Somlink API bridge; intercepted by delivery_queue trigger.', ''
from public.providers_config p
where exists (
  select 1 from public.data_packages_config d
  where d.tenant_id = p.tenant_id
    and d.provider_id = p.id
    and d.somlink_bundle_id is not null
)
and not exists (
  select 1 from public.delivery_instructions di
  where di.tenant_id = p.tenant_id
    and di.provider_id = p.id
    and di.category_id is null
    and di.package_id is null
);

create or replace function private.prepare_somlink_delivery_queue()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_bundle_id integer;
begin
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
set search_path = public, private, net
as $$
begin
  if new.provider_name = 'somlink'
     and new.ussd_code like 'API:SOMLINK:%'
     and new.status = 'processing'
     and new.dispatched_at is null then
    perform net.http_post(
      url := 'https://bpkddmxpyeyxvjyebull.supabase.co/functions/v1/somlink-delivery',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object('queue_id', new.id),
      timeout_milliseconds := 10000
    );
  end if;
  return null;
end;
$$;

drop trigger if exists trg_prepare_somlink_delivery_queue on public.delivery_queue;
create trigger trg_prepare_somlink_delivery_queue
before insert or update on public.delivery_queue
for each row execute function private.prepare_somlink_delivery_queue();

drop trigger if exists trg_dispatch_somlink_delivery_queue on public.delivery_queue;
create trigger trg_dispatch_somlink_delivery_queue
after insert or update on public.delivery_queue
for each row execute function private.dispatch_somlink_delivery_queue();