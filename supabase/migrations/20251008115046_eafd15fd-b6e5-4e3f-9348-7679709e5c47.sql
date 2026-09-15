-- Add category_id column to data_packages_config table
ALTER TABLE public.data_packages_config
ADD COLUMN category_id UUID REFERENCES public.package_categories(id) ON DELETE SET NULL;

-- Create index for better query performance
CREATE INDEX idx_data_packages_category ON public.data_packages_config(category_id);