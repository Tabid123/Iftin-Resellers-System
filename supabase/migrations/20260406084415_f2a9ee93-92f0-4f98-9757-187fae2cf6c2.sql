
-- Add missing columns to error_messages
ALTER TABLE error_messages ADD COLUMN IF NOT EXISTS error_type text;
ALTER TABLE error_messages ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE error_messages ADD COLUMN IF NOT EXISTS message text;
ALTER TABLE error_messages ADD COLUMN IF NOT EXISTS icon_type text DEFAULT 'emoji';
ALTER TABLE error_messages ADD COLUMN IF NOT EXISTS icon_value text DEFAULT '⚠️';
ALTER TABLE error_messages ADD COLUMN IF NOT EXISTS is_animated boolean DEFAULT false;

-- Create error-icons storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('error-icons', 'error-icons', true);

CREATE POLICY "Error icons are publicly accessible" ON storage.objects FOR SELECT USING (bucket_id = 'error-icons');
CREATE POLICY "Admins can upload error icons" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'error-icons');
CREATE POLICY "Admins can update error icons" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'error-icons');
CREATE POLICY "Admins can delete error icons" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'error-icons');
