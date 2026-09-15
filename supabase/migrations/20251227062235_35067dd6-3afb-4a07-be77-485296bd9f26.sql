-- Add payment_source column to orders table to distinguish between WaafiPay API and SMS offline orders
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS payment_source text DEFAULT 'waafipay_api';

-- Add comment to explain the column
COMMENT ON COLUMN public.orders.payment_source IS 'Source of payment: waafipay_api (online API payments) or sms_offline (SMS-based offline payments)';