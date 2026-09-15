-- Add evoucher_rate column to providers_config
ALTER TABLE providers_config 
ADD COLUMN evoucher_rate NUMERIC DEFAULT 0;

-- Set Hormuud rate (15.8%)
UPDATE providers_config 
SET evoucher_rate = 0.158 
WHERE provider_name ILIKE '%hormuud%';