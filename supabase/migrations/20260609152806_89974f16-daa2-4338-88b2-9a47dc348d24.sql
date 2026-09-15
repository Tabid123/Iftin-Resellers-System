
-- Public read for asset buckets
CREATE POLICY "Public read asset buckets"
ON storage.objects FOR SELECT
USING (bucket_id IN ('provider-logos','banners','category-images'));

-- Authenticated tenant members or super admins can write
CREATE POLICY "Tenant admins can insert assets"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id IN ('provider-logos','banners','category-images')
  AND (
    public.is_super_admin()
    OR EXISTS (SELECT 1 FROM public.tenant_members WHERE user_id = auth.uid())
  )
);

CREATE POLICY "Tenant admins can update assets"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id IN ('provider-logos','banners','category-images')
  AND (
    public.is_super_admin()
    OR EXISTS (SELECT 1 FROM public.tenant_members WHERE user_id = auth.uid())
  )
)
WITH CHECK (
  bucket_id IN ('provider-logos','banners','category-images')
  AND (
    public.is_super_admin()
    OR EXISTS (SELECT 1 FROM public.tenant_members WHERE user_id = auth.uid())
  )
);

CREATE POLICY "Tenant admins can delete assets"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id IN ('provider-logos','banners','category-images')
  AND (
    public.is_super_admin()
    OR EXISTS (SELECT 1 FROM public.tenant_members WHERE user_id = auth.uid())
  )
);
