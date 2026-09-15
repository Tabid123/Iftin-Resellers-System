-- Add category_id to delivery_instructions to support different codes per category
ALTER TABLE public.delivery_instructions
ADD COLUMN category_id UUID REFERENCES public.package_categories(id) ON DELETE SET NULL;

-- Update the unique constraint to allow multiple instructions per provider (one per category)
ALTER TABLE public.delivery_instructions
DROP CONSTRAINT IF EXISTS delivery_instructions_provider_id_key;

-- Add new unique constraint for provider + category combination
ALTER TABLE public.delivery_instructions
ADD CONSTRAINT delivery_instructions_provider_category_unique 
UNIQUE (provider_id, category_id);

-- Add a constraint to ensure either category_id is set OR it's null (for default/general instructions)
-- This allows one general instruction per provider (category_id = NULL) 
-- plus specific instructions per category