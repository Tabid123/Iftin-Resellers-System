-- Somlink may provision wallet account identifiers containing letters (e.g. FAANOOLEAPI).
-- Preserve exact identifier bytes except surrounding whitespace and keep existing
-- numeric wallet behavior. No tenant credentials or activation states are changed.
-- Super Admin authorization remains at the somlink-integration Edge Function.

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
  -- Wallet IDs may be a numeric phone or a provider-issued text account, such as FAANOOLEAPI.
  -- Do not strip letters: the value is used unchanged for API authentication and delivery.
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
  if length(v_wallet) < 3 or length(v_wallet) > 128
     or v_wallet ~ '[[:cntrl:]]'
     or (v_wallet ~ '^[+]?[0-9]+

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
         and (length(regexp_replace(v_wallet, '[^0-9]', '', 'g')) < 7
           or length(regexp_replace(v_wallet, '[^0-9]', '', 'g')) > 15)) then
    raise exception 'invalid_wallet_identifier';
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
