-- Add text_value column to app_settings for non-boolean settings
ALTER TABLE public.app_settings 
ADD COLUMN IF NOT EXISTS text_value text;

-- Make setting_value nullable since we'll use either boolean or text
ALTER TABLE public.app_settings 
ALTER COLUMN setting_value DROP NOT NULL;

-- Insert setting for package source selection
INSERT INTO public.app_settings (setting_key, text_value, description)
VALUES ('popular_packages_source', 'featured', 'Source for popular packages: "featured" (manual selection) or "most_purchased" (automatic based on sales)')
ON CONFLICT (setting_key) DO NOTHING;