-- Allow duplicate category names across different providers
-- Drop unique constraint on category_name if it exists
DO $$ 
BEGIN
    -- Try to drop the constraint if it exists
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'package_categories_category_name_key'
    ) THEN
        ALTER TABLE package_categories DROP CONSTRAINT package_categories_category_name_key;
    END IF;
END $$;

-- Add a comment to document that duplicate names are allowed across providers
COMMENT ON COLUMN package_categories.category_name IS 'Category name - duplicates allowed across different providers';