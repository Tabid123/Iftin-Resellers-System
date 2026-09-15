-- Add display_order to providers_config
ALTER TABLE public.providers_config
ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 0;

-- Create index for ordering
CREATE INDEX IF NOT EXISTS idx_providers_display_order 
ON public.providers_config(display_order);

-- Drop and recreate get_active_providers function with display_order
DROP FUNCTION IF EXISTS public.get_active_providers();

CREATE OR REPLACE FUNCTION public.get_active_providers()
 RETURNS TABLE(id uuid, provider_name text, provider_logo text, is_active boolean, created_at timestamp with time zone, updated_at timestamp with time zone, promotional_text text, display_order integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT 
    id,
    provider_name,
    provider_logo,
    is_active,
    created_at,
    updated_at,
    promotional_text,
    display_order
  FROM public.providers_config
  WHERE is_active = true
  ORDER BY display_order ASC, provider_name ASC;
$function$;