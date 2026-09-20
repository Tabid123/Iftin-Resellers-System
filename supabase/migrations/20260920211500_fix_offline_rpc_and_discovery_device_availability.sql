-- Remove ambiguous legacy Offline Reg RPC and make Maamuus discovery queue device-aware.

drop function if exists public.storefront_save_offline_registration(text,text,uuid,text);

create or replace function public.request_package_discovery(
  p_tenant_id uuid,
  p_root_package_id uuid,
  p_phone text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text;
  v_row public.ussd_package_discoveries%rowtype;
  v_id uuid;
  v_provider_name text;
  v_has_device boolean := false;
begin
  v_phone := regexp_replace(coalesce(p_phone,''), '\D', '', 'g');
  if length(v_phone) = 12 and left(v_phone,3) = '252' then
    v_phone := substring(v_phone from 4);
  end if;
  if length(v_phone) = 10 and left(v_phone,1) = '0' then
    v_phone := substring(v_phone from 2);
  end if;

  if length(v_phone) <> 9 then
    return jsonb_build_object('success', false, 'message', 'Fadlan gali lambarka oo dhan (9 lambar)');
  end if;

  select lower(prov.provider_name)
    into v_provider_name
  from public.data_packages_config pkg
  join public.providers_config prov
    on prov.id = pkg.provider_id
   and prov.tenant_id = pkg.tenant_id
  where pkg.id = p_root_package_id
    and pkg.tenant_id = p_tenant_id
    and pkg.is_active = true
    and pkg.is_discovery_root = true
  limit 1;

  if v_provider_name is null then
    return jsonb_build_object('success', false, 'message', 'Xulasho discovery ah lama helin');
  end if;

  select exists (
    select 1
    from public.android_devices d
    where d.tenant_id = p_tenant_id
      and d.is_active = true
      and d.archived_at is null
      and coalesce(d.last_ping_at, d.created_at) >= now() - interval '90 seconds'
      and (
        (coalesce(d.sim1_enabled, true) and lower(coalesce(d.sim1_provider,'')) = v_provider_name)
        or
        (coalesce(d.sim2_enabled, true) and lower(coalesce(d.sim2_provider,'')) = v_provider_name)
      )
  ) into v_has_device;

  if not v_has_device then
    return jsonb_build_object(
      'success', false,
      'code', 'no_device_available',
      'message', 'Qalabka delivery-ga hadda offline ayuu yahay. Fadlan hubi APK-ga kadib mar kale isku day.'
    );
  end if;

  select * into v_row
  from public.ussd_package_discoveries
  where tenant_id = p_tenant_id
    and root_package_id = p_root_package_id
    and phone_number = v_phone
    and status in ('pending','processing')
    and queued_at > now() - interval '5 minutes'
  order by queued_at desc
  limit 1;

  if found then
    return jsonb_build_object('success', true, 'id', v_row.id, 'status', v_row.status, 'cached', false);
  end if;

  insert into public.ussd_package_discoveries(tenant_id, root_package_id, phone_number)
  values (p_tenant_id, p_root_package_id, v_phone)
  returning id into v_id;

  return jsonb_build_object('success', true, 'id', v_id, 'status', 'pending', 'cached', false);
end;
$$;
