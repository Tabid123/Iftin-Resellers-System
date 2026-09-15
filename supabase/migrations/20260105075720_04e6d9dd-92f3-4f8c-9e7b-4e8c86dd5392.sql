-- Add invoice_url column to orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS invoice_url TEXT;

-- Create invoices storage bucket for public access
INSERT INTO storage.buckets (id, name, public)
VALUES ('invoices', 'invoices', true)
ON CONFLICT (id) DO NOTHING;

-- Allow anyone to view invoices (public bucket)
CREATE POLICY "Anyone can view invoices"
ON storage.objects FOR SELECT
USING (bucket_id = 'invoices');

-- Allow authenticated users to upload invoices (for the app)
CREATE POLICY "Anyone can upload invoices"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'invoices');

-- Allow updates to invoices
CREATE POLICY "Anyone can update invoices"
ON storage.objects FOR UPDATE
USING (bucket_id = 'invoices');