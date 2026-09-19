-- Tenant-native Offline Registration package binding.
-- Adds an exact package snapshot to each registration while keeping legacy
-- rows compatible when package_id is null.

alter table public.offline_registrations
  add column if not exists package_id uuid null,
  add column if not exists package_name text null;

create index if not exists idx_offline_registrations_tenant_package
  on public.offline_registrations (tenant_id, package_id)
  where package_id is not null;

create or replace function public.storefront_save_offline_registration(
  p_sender text,
  p_receiver text,
  p_provider_id uuid default null,
  p_provider_name text default null,
  p_package_id uuid default null,
  p_package_name text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_tenant uuid := public.effective_tenant_id();
  v_id uuid;
  v_pkg_name text;
begin
  if v_tenant is null then raise exception 'tenant_required'; end if;
  if p_sender is null or p_receiver is null then raise exception 'phones_required'; end if;

  if p_package_id is not null then
    select package_name
      into v_pkg_name
    from public.data_packages_config
    where id = p_package_id
      and tenant_id = v_tenant
      and is_active = true
    limit 1;

    if v_pkg_name is null then
      raise exception 'package_not_found';
    end if;
  else
    v_pkg_name := nullif(p_package_name, '');
  end if;

  select id into v_id
  from public.offline_registrations
  where tenant_id = v_tenant
    and sender_phone = p_sender
  limit 1;

  if v_id is null then
    insert into public.offline_registrations (
      tenant_id,
      sender_phone,
      receiver_phone,
      provider_id,
      provider_name,
      package_id,
      package_name,
      is_active
    )
    values (
      v_tenant,
      p_sender,
      p_receiver,
      p_provider_id::text,
      p_provider_name,
      p_package_id,
      coalesce(v_pkg_name, p_package_name),
      true
    );
  else
    update public.offline_registrations
       set receiver_phone = p_receiver,
           provider_id = coalesce(p_provider_id::text, provider_id),
           provider_name = coalesce(p_provider_name, provider_name),
           package_id = coalesce(p_package_id, package_id),
           package_name = coalesce(v_pkg_name, p_package_name, package_name),
           is_active = true,
           updated_at = now()
     where id = v_id;
  end if;
end
$function$;
