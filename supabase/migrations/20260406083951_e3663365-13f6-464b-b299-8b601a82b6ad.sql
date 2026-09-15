
-- Create banners storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('banners', 'banners', true);

-- Allow anyone to read banners
CREATE POLICY "Banners are publicly accessible" ON storage.objects FOR SELECT USING (bucket_id = 'banners');

-- Allow authenticated admins to upload banners
CREATE POLICY "Admins can upload banners" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'banners');

-- Allow authenticated admins to update banners
CREATE POLICY "Admins can update banners" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'banners');

-- Allow authenticated admins to delete banners
CREATE POLICY "Admins can delete banners" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'banners');
