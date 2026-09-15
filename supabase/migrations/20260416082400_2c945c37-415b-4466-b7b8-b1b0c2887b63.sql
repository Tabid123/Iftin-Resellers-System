ALTER TABLE public.auto_topup_phone_mappings 
  ADD COLUMN IF NOT EXISTS category_name text;

ALTER TABLE public.auto_topup_phone_mappings 
  ALTER COLUMN package_id DROP NOT NULL;