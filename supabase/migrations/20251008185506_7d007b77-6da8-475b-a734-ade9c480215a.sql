-- Add prefix_code column to payment_providers_config table
ALTER TABLE public.payment_providers_config
ADD COLUMN IF NOT EXISTS prefix_code text;

-- Add comment to explain the column
COMMENT ON COLUMN public.payment_providers_config.prefix_code IS 'Prefix code for the payment provider (e.g., 61 for EVC, 62 for E-Dahab, 68 for Jeeb)';
