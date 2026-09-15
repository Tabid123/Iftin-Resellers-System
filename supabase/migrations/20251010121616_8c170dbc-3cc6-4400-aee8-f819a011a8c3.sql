-- Add provider_id to package_categories table
ALTER TABLE public.package_categories 
ADD COLUMN provider_id uuid REFERENCES public.providers_config(id) ON DELETE CASCADE;

-- Create index for better query performance
CREATE INDEX idx_package_categories_provider_id ON public.package_categories(provider_id);

-- Update the RLS policy to consider provider
DROP POLICY IF EXISTS "Anyone can view active categories" ON public.package_categories;

CREATE POLICY "Anyone can view active categories" 
ON public.package_categories 
FOR SELECT 
USING (is_active = true);

-- Update the get_active_categories function to optionally filter by provider
CREATE OR REPLACE FUNCTION public.get_active_categories(provider_uuid uuid DEFAULT NULL)
RETURNS TABLE(
  id uuid,
  category_name text,
  display_order integer,
  is_active boolean,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  provider_id uuid
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    id,
    category_name,
    display_order,
    is_active,
    created_at,
    updated_at,
    provider_id
  FROM public.package_categories
  WHERE is_active = true
    AND (provider_uuid IS NULL OR provider_id = provider_uuid)
  ORDER BY display_order, category_name;
$$;