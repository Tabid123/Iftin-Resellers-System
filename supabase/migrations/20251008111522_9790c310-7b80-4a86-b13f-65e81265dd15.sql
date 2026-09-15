-- Fix the update_updated_at_column function search_path
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;

-- Create RLS policy for providers_public view to allow public access
-- Note: Views need their underlying table to be accessible or explicit policies
ALTER VIEW public.providers_public SET (security_barrier = true);

-- Create a secure view for payment providers that excludes credentials
CREATE OR REPLACE VIEW public.payment_providers_public
WITH (security_invoker = true, security_barrier = true)
AS
SELECT 
  id,
  provider_name,
  provider_logo,
  commission_rate,
  is_active,
  created_at,
  updated_at
FROM public.payment_providers_config
WHERE is_active = true;

-- Allow public access to safe payment provider info
GRANT SELECT ON public.payment_providers_public TO anon, authenticated;

-- Remove public read policy from payment_providers_config
DROP POLICY IF EXISTS "Anyone can view active payment providers" ON public.payment_providers_config;

-- Add comment
COMMENT ON VIEW public.payment_providers_public IS 'Public view of payment providers that excludes sensitive API credentials. Only admins can access the full payment_providers_config table.';