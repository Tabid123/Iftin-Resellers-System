-- Drop the old function first
DROP FUNCTION IF EXISTS public.get_active_payment_providers();

-- Recreate with new columns
CREATE FUNCTION public.get_active_payment_providers()
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
SET search_path = 'public'
AS $$
  SELECT 
    id,
    provider_name,
    provider_logo,
    commission_rate,
    is_active,
    created_at,
    updated_at,
    prefix_code,
    ussd_code_template,
    payment_number
  FROM public.payment_providers_config
  WHERE is_active = true;
$$;