-- Workspace-scoped write authorization for shared asset buckets.
-- Reads stay public (product design: storefront artwork).
-- New writes must live under "<tenant_id>/...". Legacy flat files remain
-- readable and untouched; only super admins may modify them.

DROP POLICY IF EXISTS "Tenant admins can insert assets" ON storage.objects;
DROP POLICY IF EXISTS "Tenant admins can update assets" ON storage.objects;
DROP POLICY IF EXISTS "Tenant admins can delete assets" ON storage.objects;

CREATE OR REPLACE FUNCTION public.is_own_workspace_object_path(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_members tm
    WHERE tm.user_id = auth.uid()
      AND split_part(p_name, '/', 1) = tm.tenant_id::text
  );
$$;

REVOKE ALL ON FUNCTION public.is_own_workspace_object_path(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_own_workspace_object_path(text) TO authenticated;

CREATE POLICY "Workspace admins insert own-folder assets"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = ANY (ARRAY['provider-logos','banners','category-images'])
  AND (public.is_super_admin() OR public.is_own_workspace_object_path(name))
);

CREATE POLICY "Workspace admins update own-folder assets"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = ANY (ARRAY['provider-logos','banners','category-images'])
  AND (public.is_super_admin() OR public.is_own_workspace_object_path(name))
)
WITH CHECK (
  bucket_id = ANY (ARRAY['provider-logos','banners','category-images'])
  AND (public.is_super_admin() OR public.is_own_workspace_object_path(name))
);

CREATE POLICY "Workspace admins delete own-folder assets"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = ANY (ARRAY['provider-logos','banners','category-images'])
  AND (public.is_super_admin() OR public.is_own_workspace_object_path(name))
);