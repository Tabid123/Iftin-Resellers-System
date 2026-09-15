-- Create banners configuration table
CREATE TABLE public.banners_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  banner_image TEXT NOT NULL,
  alt_text TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.banners_config ENABLE ROW LEVEL SECURITY;

-- Allow everyone to view active banners
CREATE POLICY "Anyone can view active banners" 
ON public.banners_config 
FOR SELECT 
TO public, anon, authenticated
USING (is_active = true);

-- Only admins can manage banners
CREATE POLICY "Only admins can manage banners" 
ON public.banners_config 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create trigger for updated_at
CREATE TRIGGER update_banners_updated_at
BEFORE UPDATE ON public.banners_config
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default banners
INSERT INTO public.banners_config (banner_image, alt_text, display_order, is_active) VALUES
('https://tsjqvhddjfuecwxpcuil.supabase.co/storage/v1/object/public/banners/iftin-banner-3.png', 'IFTIN Internet - Kaalay oo hel internet xaware sare leh! +252 61 7 1956559', 1, true),
('https://tsjqvhddjfuecwxpcuil.supabase.co/storage/v1/object/public/banners/iftin-banner-4.png', 'IFTIN Internet Call Center 6171956659 - Howlwadeeno diyaar ku ah waqti walba', 2, true);