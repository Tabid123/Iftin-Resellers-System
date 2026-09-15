-- Remove the insecure public read policy
DROP POLICY IF EXISTS "Anyone can view active providers" ON public.providers_config;

-- Create a secure view that only exposes safe columns
CREATE OR REPLACE VIEW public.providers_public AS
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
COMMENT ON VIEW public.providers_public IS 'Public view of providers that excludes sensitive API credentials. Only admins can access the full providers_config table.';