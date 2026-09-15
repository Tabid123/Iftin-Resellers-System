-- Remove the public SELECT policy that exposes sensitive pricing data
DROP POLICY IF EXISTS "Anyone can view active packages" ON public.data_packages_config;

-- Add admin-only SELECT policy for direct table access
CREATE POLICY "Only admins can view packages"
ON public.data_packages_config
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create a secure function to expose only non-sensitive package data
CREATE OR REPLACE FUNCTION public.get_public_packages(provider_uuid uuid)
RETURNS TABLE (
  id uuid,
  package_name text,
  data_amount text,
  validity_days integer,
  selling_price numeric,
  is_active boolean,
  provider_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    id,
    package_name,
    data_amount,
    validity_days,
    selling_price,
    is_active,
    provider_id
  FROM public.data_packages_config
  WHERE provider_id = provider_uuid 
    AND is_active = true
  ORDER BY selling_price;
$$;

-- Grant execute permissions to all users
GRANT EXECUTE ON FUNCTION public.get_public_packages(uuid) TO anon, authenticated;

-- Add helpful comment
COMMENT ON FUNCTION public.get_public_packages(uuid) IS 'Safely exposes active package information without cost_price or profit_margin. Uses SECURITY DEFINER to bypass RLS while filtering sensitive columns.';