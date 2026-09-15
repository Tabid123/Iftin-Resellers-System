CREATE OR REPLACE FUNCTION public.get_tenant_owner_emails()
RETURNS TABLE (tenant_id uuid, owner_email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT ON (tm.tenant_id) tm.tenant_id, u.email::text
  FROM public.tenant_members tm
  JOIN auth.users u ON u.id = tm.user_id
  WHERE public.has_role(auth.uid(), 'super_admin')
  ORDER BY tm.tenant_id, (tm.role = 'owner') DESC, tm.created_at ASC
$$;

REVOKE ALL ON FUNCTION public.get_tenant_owner_emails() FROM public;
GRANT EXECUTE ON FUNCTION public.get_tenant_owner_emails() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_tenant_owner_emails() TO service_role;