-- Create storage bucket for Android APKs
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'apk-builds',
  'apk-builds',
  true,
  52428800, -- 50MB limit
  ARRAY['application/vnd.android.package-archive', 'application/octet-stream']
);

-- Allow public to read APKs
CREATE POLICY "Public can download APKs"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'apk-builds');

-- Allow authenticated admins to upload APKs
CREATE POLICY "Admins can upload APKs"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'apk-builds' 
  AND (auth.jwt() ->> 'role')::text = 'service_role'
);

-- Allow authenticated admins to delete old APKs
CREATE POLICY "Admins can delete APKs"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'apk-builds'
  AND (auth.jwt() ->> 'role')::text = 'service_role'
);

-- Create table to track APK builds
CREATE TABLE IF NOT EXISTS public.apk_builds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version TEXT NOT NULL,
  build_number INTEGER NOT NULL,
  file_name TEXT NOT NULL,
  file_size BIGINT,
  storage_path TEXT NOT NULL,
  github_sha TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_latest BOOLEAN DEFAULT true
);

-- Enable RLS on apk_builds
ALTER TABLE public.apk_builds ENABLE ROW LEVEL SECURITY;

-- Allow public to read APK build info
CREATE POLICY "Public can view APK builds"
ON public.apk_builds FOR SELECT
TO public
USING (true);

-- Only service role can insert APK build records
CREATE POLICY "Service role can insert APK builds"
ON public.apk_builds FOR INSERT
TO authenticated
WITH CHECK ((auth.jwt() ->> 'role')::text = 'service_role');

-- Create index for faster latest version lookup
CREATE INDEX idx_apk_builds_latest ON public.apk_builds(created_at DESC) WHERE is_latest = true;

-- Function to mark only the newest build as latest
CREATE OR REPLACE FUNCTION public.update_latest_apk_build()
RETURNS TRIGGER AS $$
BEGIN
  -- Set all existing builds to not latest
  UPDATE public.apk_builds SET is_latest = false WHERE is_latest = true;
  -- Set the new build as latest
  NEW.is_latest = true;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger to automatically update latest flag
CREATE TRIGGER trigger_update_latest_apk
BEFORE INSERT ON public.apk_builds
FOR EACH ROW
EXECUTE FUNCTION public.update_latest_apk_build();