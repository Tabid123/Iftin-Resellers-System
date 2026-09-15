-- Add connection_type_label column to data_packages_config table
ALTER TABLE public.data_packages_config
ADD COLUMN IF NOT EXISTS connection_type_label TEXT DEFAULT 'Mobile Internet';

-- Update existing records to have the default label
UPDATE public.data_packages_config
SET connection_type_label = 'Mobile Internet'
WHERE connection_type_label IS NULL;