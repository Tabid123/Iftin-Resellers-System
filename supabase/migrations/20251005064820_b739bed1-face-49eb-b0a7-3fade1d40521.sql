-- Update RLS policies to allow anonymous users to view active data

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Anyone can view active providers" ON public.providers_config;
DROP POLICY IF EXISTS "Anyone can view active packages" ON public.data_packages_config;
DROP POLICY IF EXISTS "Anyone can view active payment providers" ON public.payment_providers_config;

-- Create new policies that explicitly allow anonymous users
CREATE POLICY "Anyone can view active providers" 
ON public.providers_config 
FOR SELECT 
TO public, anon, authenticated
USING (is_active = true);

CREATE POLICY "Anyone can view active packages" 
ON public.data_packages_config 
FOR SELECT 
TO public, anon, authenticated
USING (is_active = true);

CREATE POLICY "Anyone can view active payment providers" 
ON public.payment_providers_config 
FOR SELECT 
TO public, anon, authenticated
USING (is_active = true);