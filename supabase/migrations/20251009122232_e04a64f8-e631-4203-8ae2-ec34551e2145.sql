-- Create featured packages table for admin-managed popular packages
CREATE TABLE IF NOT EXISTS public.featured_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES public.data_packages_config(id) ON DELETE CASCADE,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(package_id)
);

-- Enable RLS
ALTER TABLE public.featured_packages ENABLE ROW LEVEL SECURITY;

-- Policy: Everyone can view active featured packages
CREATE POLICY "Anyone can view active featured packages"
ON public.featured_packages
FOR SELECT
USING (is_active = true);

-- Policy: Only admins can manage featured packages
CREATE POLICY "Only admins can manage featured packages"
ON public.featured_packages
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Function to get featured packages with all details
CREATE OR REPLACE FUNCTION public.get_featured_packages()
RETURNS TABLE(
  package_id uuid,
  package_name text,
  data_amount text,
  selling_price numeric,
  provider_id uuid,
  provider_name text,
  provider_logo text,
  connection_type_label text,
  display_order integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT 
    dp.id as package_id,
    dp.package_name,
    dp.data_amount,
    dp.selling_price,
    dp.provider_id,
    p.provider_name,
    p.provider_logo,
    dp.connection_type_label,
    fp.display_order
  FROM public.featured_packages fp
  JOIN public.data_packages_config dp ON fp.package_id = dp.id
  JOIN public.providers_config p ON dp.provider_id = p.id
  WHERE fp.is_active = true AND dp.is_active = true
  ORDER BY fp.display_order ASC, dp.package_name ASC;
$function$;