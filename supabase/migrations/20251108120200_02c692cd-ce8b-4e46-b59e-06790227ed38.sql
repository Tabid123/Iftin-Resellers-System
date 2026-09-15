-- Create app settings table for controlling UI features
CREATE TABLE IF NOT EXISTS public.app_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  setting_key text NOT NULL UNIQUE,
  setting_value boolean NOT NULL DEFAULT true,
  description text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Anyone can view app settings"
  ON public.app_settings
  FOR SELECT
  USING (true);

CREATE POLICY "Only admins can manage app settings"
  ON public.app_settings
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Insert default setting for featured packages
INSERT INTO public.app_settings (setting_key, setting_value, description)
VALUES ('show_featured_packages', true, 'Show featured packages section on provider selection page')
ON CONFLICT (setting_key) DO NOTHING;

-- Create function to get app setting
CREATE OR REPLACE FUNCTION public.get_app_setting(key text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT setting_value
  FROM public.app_settings
  WHERE setting_key = key
  LIMIT 1;
$$;

-- Trigger for updated_at
CREATE TRIGGER update_app_settings_updated_at
  BEFORE UPDATE ON public.app_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();