-- Somlink company is always visible; its catalog is API-gated.
update public.providers_config
set is_active = true, updated_at = now()
where lower(btrim(provider_name)) = 'somlink'
  and coalesce(is_active, false) = false;

create or replace function public.get_active_providers()
returns setof public.providers_config
language sql stable security definer
set search_path = public
as $$
  select p.*
  from public.providers_config p
  where p.tenant_id = public.current_request_tenant_id()
    and (
      lower(btrim(p.provider_name)) = 'somlink'
      or (
        coalesce(p.is_active, true) = true
        and (
          public.somlink_tenant_ready()
          or exists (
            select 1 from public.data_packages_config x
            where x.tenant_id=p.tenant_id and x.provider_id=p.id
              and coalesce(x.is_active,true)=true
              and x.somlink_bundle_id is null
          )
          or not exists (
            select 1 from public.data_packages_config x
            where x.tenant_id=p.tenant_id and x.provider_id=p.id
              and coalesce(x.is_active,true)=true
              and x.somlink_bundle_id is not null
          )
        )
      )
    )
  order by p.display_order nulls last, p.provider_name;
$$;

create or replace function public.get_active_categories(p_provider_id uuid default null)
returns table(
  id uuid, category_name text, display_order integer, is_active boolean,
  provider_id uuid, category_image text, created_at timestamptz, updated_at timestamptz
)
language sql stable security definer
set search_path = public
as $$
  select c.id,c.category_name,c.display_order,c.is_active,c.provider_id,
         c.category_image,c.created_at,c.updated_at
  from public.package_categories c
  join public.providers_config p
    on p.id=c.provider_id and p.tenant_id=c.tenant_id
  where c.tenant_id=public.current_request_tenant_id()
    and coalesce(c.is_active,true)=true
    and (p_provider_id is null or c.provider_id=p_provider_id)
    and (
      lower(btrim(p.provider_name)) <> 'somlink'
      or public.somlink_tenant_ready()
    )
  order by c.display_order nulls last, c.category_name;
$$;

create or replace function public.get_public_packages(p_provider_id uuid)
returns table(
  id uuid, package_name text, data_amount text, validity_days text,
  selling_price numeric, cost_price numeric, is_active boolean,
  category_id uuid, provider_id uuid, connection_type_label text,
  ussd_code text, display_order integer, hide_cost_price boolean
)
language sql stable security definer
set search_path = public
as $$
  select d.id,d.package_name,d.data_amount,d.validity_days,d.selling_price,
         d.cost_price,d.is_active,d.category_id,d.provider_id,
         d.connection_type_label,d.ussd_code,d.display_order,
         coalesce(d.hide_cost_price,false)
  from public.data_packages_config d
  join public.providers_config p
    on p.id=d.provider_id and p.tenant_id=d.tenant_id
  where d.tenant_id=public.current_request_tenant_id()
    and coalesce(d.is_active,true)=true
    and d.provider_id=p_provider_id
    and (
      lower(btrim(p.provider_name)) <> 'somlink'
      or public.somlink_tenant_ready()
    )
  order by d.display_order nulls last, d.selling_price, d.package_name;
$$;

create or replace function public.get_featured_packages()
returns table(
  package_id uuid, package_name text, data_amount text, selling_price numeric,
  provider_id uuid, provider_name text, provider_logo text,
  connection_type_label text, display_order integer
)
language sql stable security definer
set search_path = public
as $$
  select dp.id,dp.package_name,dp.data_amount,dp.selling_price,dp.provider_id,
         p.provider_name,p.provider_logo,dp.connection_type_label,fp.display_order
  from public.featured_packages fp
  join public.data_packages_config dp
    on fp.package_id=dp.id and dp.tenant_id=fp.tenant_id
  join public.providers_config p
    on dp.provider_id=p.id and p.tenant_id=fp.tenant_id
  where fp.tenant_id=public.current_request_tenant_id()
    and coalesce(fp.is_active,true)=true
    and coalesce(dp.is_active,true)=true
    and (lower(btrim(p.provider_name))='somlink' or coalesce(p.is_active,true)=true)
    and (
      lower(btrim(p.provider_name)) <> 'somlink'
      or public.somlink_tenant_ready()
    )
  order by fp.display_order nulls last, dp.package_name;
$$;
