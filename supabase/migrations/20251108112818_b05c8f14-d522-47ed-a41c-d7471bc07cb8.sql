-- Drop the restrictive RLS policy for viewing providers
DROP POLICY IF EXISTS "Only admins can view providers" ON public.providers_config;

-- Create a new policy that allows anyone to view active providers
CREATE POLICY "Anyone can view active providers"
ON public.providers_config
FOR SELECT
USING (is_active = true);

-- Keep the admin-only management policy
-- (This already exists, no need to recreate)