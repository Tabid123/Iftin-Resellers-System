-- Allow authenticated admins to upload files to the 'banners' bucket
CREATE POLICY "admins_can_insert_banners_objects"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'banners' AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

-- Allow authenticated admins to update files in the 'banners' bucket
CREATE POLICY "admins_can_update_banners_objects"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'banners' AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

-- Allow authenticated admins to delete files in the 'banners' bucket
CREATE POLICY "admins_can_delete_banners_objects"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'banners' AND public.has_role(auth.uid(), 'admin'::public.app_role)
);