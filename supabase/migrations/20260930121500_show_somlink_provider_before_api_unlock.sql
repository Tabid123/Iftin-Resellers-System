-- Keep Somlink visible as a provider before a tenant configures its own API.
-- Somlink categories/packages remain gated by somlink_tenant_ready() in
-- get_active_categories() and get_public_packages().

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
      lower(btrim(p.provider_name)) = 'somlink'
      or public.somlink_tenant_ready()
      or exists (
        select 1
        from public.data_packages_config x
        where x.tenant_id = p.tenant_id
          and x.provider_id = p.id
          and coalesce(x.is_active, true) = true
          and x.somlink_bundle_id is null
      )
      or not exists (
        select 1
        from public.data_packages_config x
        where x.tenant_id = p.tenant_id
          and x.provider_id = p.id
          and coalesce(x.is_active, true) = true
          and x.somlink_bundle_id is not null
      )
    )
  order by p.display_order nulls last, p.provider_name;
$$;
