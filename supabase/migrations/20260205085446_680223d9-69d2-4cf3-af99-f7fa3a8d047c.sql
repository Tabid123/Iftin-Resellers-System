-- Add ussd_prefix column to payment_providers_config
ALTER TABLE payment_providers_config 
ADD COLUMN IF NOT EXISTS ussd_prefix TEXT;

-- Update EVC provider with new payment number and prefix
UPDATE payment_providers_config 
SET payment_number = '619535029',
    ussd_prefix = '*712*'
WHERE provider_name ILIKE '%evc%';

-- Update Jeeb provider with new payment number and prefix
UPDATE payment_providers_config
SET payment_number = '619535029',
    ussd_prefix = '*812*'
WHERE provider_name ILIKE '%jeeb%';