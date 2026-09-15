
DROP POLICY IF EXISTS "user_roles super_admin manage" ON public.user_roles;
CREATE POLICY "user_roles super_admin manage" ON public.user_roles FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
