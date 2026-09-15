-- Create package categories table
CREATE TABLE public.package_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category_name TEXT NOT NULL UNIQUE,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.package_categories ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Anyone can view active categories" 
ON public.package_categories 
FOR SELECT 
USING (is_active = true);

CREATE POLICY "Only admins can manage categories" 
ON public.package_categories 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create function to get active categories
CREATE OR REPLACE FUNCTION public.get_active_categories()
RETURNS TABLE(
  id UUID,
  category_name TEXT,
  display_order INTEGER,
  is_active BOOLEAN,
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    id,
    category_name,
    display_order,
    is_active,
    created_at,
    updated_at
  FROM public.package_categories
  WHERE is_active = true
  ORDER BY display_order, category_name;
$$;

-- Insert default categories
INSERT INTO public.package_categories (category_name, display_order) VALUES
  ('All', 0),
  ('Daily', 1),
  ('Weekly', 2),
  ('Monthly', 3),
  ('No Expire', 4);