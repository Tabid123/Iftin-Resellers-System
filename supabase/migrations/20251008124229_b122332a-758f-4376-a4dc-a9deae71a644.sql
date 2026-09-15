-- Drop the existing function first
DROP FUNCTION IF EXISTS public.get_active_providers();

-- Add promotional_text column to providers_config
ALTER TABLE public.providers_config
ADD COLUMN IF NOT EXISTS promotional_text text DEFAULT 'Iftin ka iibso Internet adigoona qof wicin, waqti kasta, xitaa offline!';

-- Recreate get_active_providers function with promotional_text
CREATE OR REPLACE FUNCTION public.get_active_providers()
RETURNS TABLE(
  id uuid,
  provider_name text,
  provider_logo text,
  is_active boolean,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  promotional_text text
)
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
    promotional_text
  FROM public.providers_config
  WHERE is_active = true;
$function$;