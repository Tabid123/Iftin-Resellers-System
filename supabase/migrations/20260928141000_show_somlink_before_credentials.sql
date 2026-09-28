-- Somlink must be visible in every tenant as soon as the master template is applied.
-- Credentials remain optional for visibility and are managed only by super_admin
-- through the somlink-integration edge function.

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
  order by p.display_order nulls last, p.provider_name;
$$;
