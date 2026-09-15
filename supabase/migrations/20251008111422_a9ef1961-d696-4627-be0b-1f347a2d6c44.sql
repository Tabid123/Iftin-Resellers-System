-- Recreate the view with SECURITY INVOKER to fix the security warning
DROP VIEW IF EXISTS public.providers_public;

CREATE OR REPLACE VIEW public.providers_public 
WITH (security_invoker = true)
AS
SELECT 
  id,
  provider_name,
  provider_logo,
  is_active,
  created_at,
  updated_at
FROM public.providers_config
WHERE is_active = true;

-- Allow anyone to read from the secure view
GRANT SELECT ON public.providers_public TO anon, authenticated;

-- Add comment explaining the security measure
COMMENT ON VIEW public.providers_public IS 'Public view of providers that excludes sensitive API credentials. Uses security invoker mode. Only admins can access the full providers_config table.';