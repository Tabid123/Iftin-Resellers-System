-- Drop and recreate get_active_categories function with category_image
DROP FUNCTION IF EXISTS public.get_active_categories(uuid);

CREATE OR REPLACE FUNCTION public.get_active_categories(provider_uuid uuid DEFAULT NULL::uuid)
RETURNS TABLE(
  id uuid,
  category_name text,
  display_order integer,
  is_active boolean,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  provider_id uuid,
  category_image text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT 
    id,
    category_name,
    display_order,
    is_active,
    created_at,
    updated_at,
    provider_id,
    category_image
  FROM public.package_categories
  WHERE is_active = true
    AND (provider_uuid IS NULL OR provider_id = provider_uuid)
  ORDER BY display_order, category_name;
$function$;