-- Create storage bucket for provider and payment provider logos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'logos',
  'logos',
  true,
  2097152, -- 2MB limit for logos
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/svg+xml']
);

-- Create RLS policies for logos bucket
-- Allow public to view files (bucket is public)
CREATE POLICY "Anyone can view logos"
ON storage.objects FOR SELECT
USING (bucket_id = 'logos');

-- Only admins can upload files
CREATE POLICY "Only admins can upload logos"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'logos' 
  AND has_role(auth.uid(), 'admin'::app_role)
);

-- Only admins can update files
CREATE POLICY "Only admins can update logos"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'logos' 
  AND has_role(auth.uid(), 'admin'::app_role)
);

-- Only admins can delete files
CREATE POLICY "Only admins can delete logos"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'logos' 
  AND has_role(auth.uid(), 'admin'::app_role)
);