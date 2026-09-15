-- Drop the permissive policy
DROP POLICY IF EXISTS "Service role can manage verification codes" ON public.admin_verification_codes;

-- Create proper restrictive policies - only service role via edge functions can access
-- Since this table is only accessed by edge functions using service role key,
-- we deny all access to regular users
CREATE POLICY "Deny all user access to verification codes"
ON public.admin_verification_codes
FOR ALL
TO authenticated, anon
USING (false)
WITH CHECK (false);