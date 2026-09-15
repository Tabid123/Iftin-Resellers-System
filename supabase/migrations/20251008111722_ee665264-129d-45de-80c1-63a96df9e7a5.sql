-- Add admin-only SELECT policy to providers_config for direct access
CREATE POLICY "Only admins can view providers"
ON public.providers_config
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Add admin-only SELECT policy to payment_providers_config for direct access  
CREATE POLICY "Only admins can view payment providers"
ON public.payment_providers_config
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create a security definer function to safely expose provider data
CREATE OR REPLACE FUNCTION public.get_active_providers()
RETURNS TABLE (
  id uuid,
  provider_name text,
  provider_logo text,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    id,
    provider_name,
    provider_logo,
    is_active,
    created_at,
    updated_at
  FROM public.providers_config
  WHERE is_active = true;
$$;

-- Create a security definer function to safely expose payment provider data
CREATE OR REPLACE FUNCTION public.get_active_payment_providers()
RETURNS TABLE (
  id uuid,
  provider_name text,
  provider_logo text,
  commission_rate numeric,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

-- Grant execute permissions to all users
GRANT EXECUTE ON FUNCTION public.get_active_providers() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_payment_providers() TO anon, authenticated;

-- Drop the views since we'll use functions instead
DROP VIEW IF EXISTS public.providers_public;
DROP VIEW IF EXISTS public.payment_providers_public;

-- Add helpful comments
COMMENT ON FUNCTION public.get_active_providers() IS 'Safely exposes active provider information without API credentials. Uses SECURITY DEFINER to bypass RLS while filtering sensitive columns.';
COMMENT ON FUNCTION public.get_active_payment_providers() IS 'Safely exposes active payment provider information without API credentials. Uses SECURITY DEFINER to bypass RLS while filtering sensitive columns.';