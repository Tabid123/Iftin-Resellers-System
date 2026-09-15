-- Add category_image field to package_categories table
ALTER TABLE package_categories 
ADD COLUMN category_image text;

COMMENT ON COLUMN package_categories.category_image IS 'URL or path to the category icon/image';