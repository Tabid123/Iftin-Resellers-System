-- Drop and recreate get_public_packages function to include category_id
DROP FUNCTION IF EXISTS public.get_public_packages(uuid);

CREATE FUNCTION public.get_public_packages(provider_uuid uuid)
RETURNS TABLE(
  id uuid,
  package_name text,
  data_amount text,
  validity_days integer,
  selling_price numeric,
  is_active boolean,
  provider_id uuid,
  category_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    id,
    package_name,
    data_amount,
    validity_days,
    selling_price,
    is_active,
    provider_id,
    category_id
  FROM public.data_packages_config
  WHERE provider_id = provider_uuid 
    AND is_active = true
  ORDER BY selling_price;
$$;