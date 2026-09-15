-- Drop the existing function first
DROP FUNCTION IF EXISTS public.get_public_packages(uuid);

-- Change validity_days from integer to text to allow flexible input like "24 saac", "30 days", etc.
ALTER TABLE public.data_packages_config 
ALTER COLUMN validity_days TYPE text USING validity_days::text;

-- Recreate the function with updated return type
CREATE OR REPLACE FUNCTION public.get_public_packages(provider_uuid uuid)
 RETURNS TABLE(id uuid, package_name text, data_amount text, validity_days text, selling_price numeric, cost_price numeric, is_active boolean, provider_id uuid, category_id uuid, connection_type_label text, ussd_code text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT 
    id,
    package_name,
    data_amount,
    validity_days,
    selling_price,
    cost_price,
    is_active,
    provider_id,
    category_id,
    connection_type_label,
    ussd_code
  FROM public.data_packages_config
  WHERE provider_id = provider_uuid 
    AND is_active = true
  ORDER BY selling_price;
$function$;