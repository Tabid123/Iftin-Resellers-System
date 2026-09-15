-- Create storage bucket for banner images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'banners',
  'banners',
  true,
  5242880, -- 5MB limit
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
);

-- Create RLS policies for banners bucket
-- Allow public to view files (bucket is public)
CREATE POLICY "Anyone can view banner images"
ON storage.objects FOR SELECT
USING (bucket_id = 'banners');

-- Only admins can upload files
CREATE POLICY "Only admins can upload banners"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'banners' 
  AND has_role(auth.uid(), 'admin'::app_role)
);

-- Only admins can update files
CREATE POLICY "Only admins can update banners"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'banners' 
  AND has_role(auth.uid(), 'admin'::app_role)
);

-- Only admins can delete files
CREATE POLICY "Only admins can delete banners"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'banners' 
  AND has_role(auth.uid(), 'admin'::app_role)
);