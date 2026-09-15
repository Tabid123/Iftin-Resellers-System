-- Ensure tenant-scoped catalog tables are reachable through the Supabase Data API.
-- RLS policies still enforce tenant isolation via x-tenant-id / authenticated membership.
GRANT SELECT ON public.providers_config TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.providers_config TO authenticated;
GRANT ALL ON public.providers_config TO service_role;

GRANT SELECT ON public.package_categories TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.package_categories TO authenticated;
GRANT ALL ON public.package_categories TO service_role;

GRANT SELECT ON public.data_packages_config TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.data_packages_config TO authenticated;
GRANT ALL ON public.data_packages_config TO service_role;

GRANT SELECT ON public.banners_config TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.banners_config TO authenticated;
GRANT ALL ON public.banners_config TO service_role;

GRANT SELECT ON public.payment_providers_config TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_providers_config TO authenticated;
GRANT ALL ON public.payment_providers_config TO service_role;

GRANT SELECT ON public.delivery_instructions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_instructions TO authenticated;
GRANT ALL ON public.delivery_instructions TO service_role;

GRANT SELECT ON public.app_settings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;

GRANT SELECT ON public.featured_packages TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.featured_packages TO authenticated;
GRANT ALL ON public.featured_packages TO service_role;

GRANT SELECT ON public.error_messages TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.error_messages TO authenticated;
GRANT ALL ON public.error_messages TO service_role;

-- Keep public storefront RPCs tenant-safe even when they bypass table RLS.
CREATE OR REPLACE FUNCTION public.get_active_providers()
RETURNS SETOF public.providers_config
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.*
  FROM public.providers_config p
  WHERE p.tenant_id = public.current_request_tenant_id()
    AND COALESCE(p.is_active, true) = true
  ORDER BY p.display_order NULLS LAST, p.provider_name;
$$;

CREATE OR REPLACE FUNCTION public.get_active_categories(p_provider_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(
  id uuid,
  category_name text,
  display_order integer,
  is_active boolean,
  provider_id uuid,
  category_image text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id,
    c.category_name,
    c.display_order,
    c.is_active,
    c.provider_id,
    c.category_image,
    c.created_at,
    c.updated_at
  FROM public.package_categories c
  WHERE c.tenant_id = public.current_request_tenant_id()
    AND COALESCE(c.is_active, true) = true
    AND (p_provider_id IS NULL OR c.provider_id = p_provider_id)
  ORDER BY c.display_order NULLS LAST, c.category_name;
$$;

DROP FUNCTION IF EXISTS public.get_public_packages(uuid);
CREATE FUNCTION public.get_public_packages(p_provider_id uuid)
RETURNS TABLE(
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
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.package_name,
    p.data_amount,
    p.validity_days,
    p.selling_price,
    p.cost_price,
    p.is_active,
    p.category_id,
    p.provider_id,
    p.connection_type_label,
    p.ussd_code,
    p.display_order
  FROM public.data_packages_config p
  WHERE p.tenant_id = public.current_request_tenant_id()
    AND COALESCE(p.is_active, true) = true
    AND p.provider_id = p_provider_id
  ORDER BY p.display_order NULLS LAST, p.selling_price, p.package_name;
$$;

CREATE OR REPLACE FUNCTION public.get_active_payment_providers()
RETURNS TABLE(
  id uuid,
  provider_name text,
  provider_logo text,
  commission_rate numeric,
  is_active boolean,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  prefix_code text,
  ussd_code_template text,
  payment_number text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.provider_name,
    p.provider_logo,
    p.commission_rate,
    p.is_active,
    p.created_at,
    p.updated_at,
    p.prefix_code,
    p.ussd_code_template,
    p.payment_number
  FROM public.payment_providers_config p
  WHERE p.tenant_id = public.current_request_tenant_id()
    AND COALESCE(p.is_active, true) = true
  ORDER BY p.provider_name;
$$;

CREATE OR REPLACE FUNCTION public.get_featured_packages()
RETURNS TABLE(
  package_id uuid,
  package_name text,
  data_amount text,
  selling_price numeric,
  provider_id uuid,
  provider_name text,
  provider_logo text,
  connection_type_label text,
  display_order integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    dp.id AS package_id,
    dp.package_name,
    dp.data_amount,
    dp.selling_price,
    dp.provider_id,
    p.provider_name,
    p.provider_logo,
    dp.connection_type_label,
    fp.display_order
  FROM public.featured_packages fp
  JOIN public.data_packages_config dp ON fp.package_id = dp.id AND dp.tenant_id = fp.tenant_id
  JOIN public.providers_config p ON dp.provider_id = p.id AND p.tenant_id = fp.tenant_id
  WHERE fp.tenant_id = public.current_request_tenant_id()
    AND COALESCE(fp.is_active, true) = true
    AND COALESCE(dp.is_active, true) = true
    AND COALESCE(p.is_active, true) = true
  ORDER BY fp.display_order NULLS LAST, dp.package_name;
$$;

GRANT EXECUTE ON FUNCTION public.get_active_providers() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_categories(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_packages(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_payment_providers() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_featured_packages() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_most_purchased_packages() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_tenant_by_slug(text) TO anon, authenticated;