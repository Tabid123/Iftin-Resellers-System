-- Drop the old constraint that only covers (provider_id, category_id)
ALTER TABLE delivery_instructions 
DROP CONSTRAINT IF EXISTS delivery_instructions_provider_category_unique;

-- Add new constraint that includes package_id to allow package-specific instructions
ALTER TABLE delivery_instructions 
ADD CONSTRAINT delivery_instructions_provider_category_package_unique 
UNIQUE NULLS NOT DISTINCT (provider_id, category_id, package_id);