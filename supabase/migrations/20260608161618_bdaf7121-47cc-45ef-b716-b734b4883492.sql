CREATE OR REPLACE FUNCTION public.get_active_categories(p_provider_id uuid DEFAULT NULL)
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
SECURITY INVOKER
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
  WHERE COALESCE(c.is_active, true) = true
    AND (p_provider_id IS NULL OR c.provider_id = p_provider_id)
  ORDER BY c.display_order NULLS LAST, c.category_name;
$$;

CREATE OR REPLACE FUNCTION public.get_public_packages(p_provider_id uuid)
RETURNS TABLE(
  id uuid,
  package_name text,
  data_amount text,
  validity_days text,
  selling_price numeric,
  is_active boolean,
  category_id uuid,
  provider_id uuid,
  connection_type_label text,
  ussd_code text,
  display_order integer
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.package_name,
    p.data_amount,
    p.validity_days,
    p.selling_price,
    p.is_active,
    p.category_id,
    p.provider_id,
    p.connection_type_label,
    p.ussd_code,
    p.display_order
  FROM public.data_packages_config p
  WHERE COALESCE(p.is_active, true) = true
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
SECURITY INVOKER
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
  WHERE COALESCE(p.is_active, true) = true
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
SECURITY INVOKER
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
  JOIN public.data_packages_config dp ON fp.package_id = dp.id
  JOIN public.providers_config p ON dp.provider_id = p.id
  WHERE COALESCE(fp.is_active, true) = true
    AND COALESCE(dp.is_active, true) = true
    AND COALESCE(p.is_active, true) = true
  ORDER BY fp.display_order NULLS LAST, dp.package_name;
$$;

CREATE OR REPLACE FUNCTION public.get_most_purchased_packages()
RETURNS TABLE(
  package_id uuid,
  package_name text,
  data_amount text,
  selling_price numeric,
  provider_id uuid,
  provider_name text,
  provider_logo text,
  purchase_count bigint,
  connection_type_label text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    o.package_id,
    o.package_name,
    o.data_amount,
    o.selling_price,
    o.provider_id,
    p.provider_name,
    p.provider_logo,
    COUNT(o.id) AS purchase_count,
    dp.connection_type_label
  FROM public.orders o
  JOIN public.providers_config p ON o.provider_id = p.id
  LEFT JOIN public.data_packages_config dp ON o.package_id = dp.id
  WHERE o.status = 'completed'
  GROUP BY o.package_id, o.package_name, o.data_amount, o.selling_price, o.provider_id, p.provider_name, p.provider_logo, dp.connection_type_label
  ORDER BY purchase_count DESC
  LIMIT 5;
$$;

GRANT EXECUTE ON FUNCTION public.get_active_categories(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_packages(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_payment_providers() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_featured_packages() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_most_purchased_packages() TO anon, authenticated;