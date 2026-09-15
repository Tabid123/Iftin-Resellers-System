-- Drop and recreate function to match database format (9 digits without country code)
DROP FUNCTION IF EXISTS public.get_customer_most_purchased_packages(text);

CREATE OR REPLACE FUNCTION public.get_customer_most_purchased_packages(customer_phone_number text)
RETURNS TABLE(
  package_id uuid,
  package_name text,
  data_amount text,
  selling_price numeric,
  provider_id uuid,
  provider_name text,
  provider_logo text,
  purchase_count bigint,
  connection_type_label text,
  last_purchased_at timestamp with time zone
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT 
    o.package_id,
    o.package_name,
    o.data_amount,
    o.selling_price,
    o.provider_id,
    p.provider_name,
    p.provider_logo,
    COUNT(o.id) as purchase_count,
    dp.connection_type_label,
    MAX(o.created_at) as last_purchased_at
  FROM public.orders o
  JOIN public.providers_config p ON o.provider_id = p.id
  LEFT JOIN public.data_packages_config dp ON o.package_id = dp.id
  WHERE o.status = 'completed'
    AND o.customer_phone = customer_phone_number
  GROUP BY 
    o.package_id, 
    o.package_name, 
    o.data_amount, 
    o.selling_price, 
    o.provider_id, 
    p.provider_name, 
    p.provider_logo, 
    dp.connection_type_label
  ORDER BY last_purchased_at DESC, purchase_count DESC
  LIMIT 5;
$function$;