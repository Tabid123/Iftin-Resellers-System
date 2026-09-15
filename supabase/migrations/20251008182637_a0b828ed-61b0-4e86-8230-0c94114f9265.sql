-- Add USSD code template and payment number columns to payment_providers_config
ALTER TABLE payment_providers_config 
ADD COLUMN ussd_code_template TEXT,
ADD COLUMN payment_number TEXT;

-- Add comment explaining the template format
COMMENT ON COLUMN payment_providers_config.ussd_code_template IS 'USSD code template with placeholders: {payment_number} and {amount}. Example: *712*{payment_number}*{amount}#';

-- Update existing providers with their USSD templates
-- These will need to be configured by admin based on actual payment provider codes