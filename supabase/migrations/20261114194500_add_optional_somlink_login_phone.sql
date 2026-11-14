-- Somlink login API documents a phone parameter; wallet identifier for
-- delivery may instead be an alphanumeric provider account such as FAANOOLEAPI.
-- Optional login phone is separate; existing numeric and active integrations
-- continue using wallet_phone when login_phone is null.
-- All RPCs remain restricted to the service_role; Edge Function checks Super Admin.
alter table private.tenant_somlink_integrations
  add column if not exists login_phone text;

CREATE OR REPLACE FUNCTION public.somlink_admin_status(p_tenant_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
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
      'login_phone', null,
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
    'login_phone', r.login_phone,
    'is_active', r.is_active,
    'connection_status', r.connection_status,
    'last_tested_at', r.last_tested_at,
    'last_error', r.last_error,
    'has_password', r.password_secret_id is not null
  );
end;
$function$;


CREATE OR REPLACE FUNCTION public.somlink_admin_credentials(p_tenant_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'vault'
AS $function$
  select jsonb_build_object(
    'tenant_id', s.tenant_id,
    'wallet_phone', s.wallet_phone,
    'login_phone', s.login_phone,
    'password', d.decrypted_secret,
    'is_active', s.is_active,
    'connection_status', s.connection_status
  )
  from private.tenant_somlink_integrations s
  join vault.decrypted_secrets d on d.id = s.password_secret_id
  where s.tenant_id = p_tenant_id;
$function$;


create or replace function public.somlink_admin_save_with_login(
  p_tenant_id uuid,
  p_wallet_phone text,
  p_login_phone text,
  p_password text default null,
  p_is_active boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, vault
as $$
declare
  old_login text;
  new_login text := nullif(btrim(coalesce(p_login_phone, '')), '');
  changed boolean;
begin
  if new_login is not null
    and new_login !~ '^[+]?[0-9]{7,15}$' then
    raise exception 'invalid_somlink_login_phone';
  end if;

  -- We maintain the existing wallet/password Vault write behavior.
  select s.login_phone into old_login
    from private.tenant_somlink_integrations s
    where s.tenant_id = p_tenant_id;

  perform public.somlink_admin_save(
    p_tenant_id,
    p_wallet_phone,
    p_password,
    p_is_active
  );

  changed := old_login is distinct from new_login;
  update private.tenant_somlink_integrations
  set login_phone = new_login,
      connection_status = case when changed then 'untested' else connection_status end,
      is_active = case when changed then false else is_active end,
      last_error = case when changed then null else last_error end,
      updated_at = case when changed then now() else updated_at end
  where tenant_id = p_tenant_id;

  return public.somlink_admin_status(p_tenant_id);
end;
$$;

revoke all on function public.somlink_admin_save_with_login(uuid,text,text,text,boolean)
  from PUBLIC, anon, authenticated;
grant execute on function public.somlink_admin_save_with_login(uuid,text,text,text,boolean)
  to service_role;
