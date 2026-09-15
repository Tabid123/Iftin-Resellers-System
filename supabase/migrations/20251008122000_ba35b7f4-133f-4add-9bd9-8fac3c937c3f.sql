-- Drop the existing function first
DROP FUNCTION IF EXISTS public.get_public_packages(uuid);

-- Recreate get_public_packages function with connection_type_label
CREATE OR REPLACE FUNCTION public.get_public_packages(provider_uuid uuid)
 RETURNS TABLE(id uuid, package_name text, data_amount text, validity_days integer, selling_price numeric, is_active boolean, provider_id uuid, category_id uuid, connection_type_label text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT 
    id,
    package_name,
    data_amount,
    validity_days,
    selling_price,
    is_active,
    provider_id,
    category_id,
    connection_type_label
  FROM public.data_packages_config
  WHERE provider_id = provider_uuid 
    AND is_active = true
  ORDER BY selling_price;
$$;