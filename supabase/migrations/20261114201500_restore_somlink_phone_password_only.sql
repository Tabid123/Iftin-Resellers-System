-- Restore the original Somlink authentication contract: wallet phone + password.
-- Revert the optional login_phone and alphanumeric identifier schema additions.
-- Existing tenant rows, passwords in Vault and activation states remain intact.

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
  v_wallet text := btrim(coalesce(p_wallet_phone, ''));
  v_secret_id uuid;
  v_password_changed boolean := coalesce(length(p_password), 0) > 0;
  v_changed boolean := false;
  v_status text := 'untested';
  v_active boolean := false;
begin
  if p_tenant_id is null or not exists (select 1 from public.tenants where id = p_tenant_id) then
    raise exception 'invalid_tenant';
  end if;
  -- Restore phone-only Somlink login and reject names before storing credentials.
  if v_wallet !~ '^[+]?[0-9]{7,15}

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
$$; then
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

-- The new RPC is no longer invoked; remove its privileged entry point.
drop function if exists public.somlink_admin_save_with_login(uuid,text,text,text,boolean);

-- No tenant supplied a separate login_phone. Removing this unused column
-- does not delete any saved wallet_phone, password_secret_id, or status.
alter table private.tenant_somlink_integrations drop column if exists login_phone;
