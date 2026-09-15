-- Add provider column to sms_otp_queue for provider-based OTP routing
ALTER TABLE public.sms_otp_queue ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT 'hormuud';

-- Add index for faster queries by provider
CREATE INDEX IF NOT EXISTS idx_sms_otp_queue_provider ON public.sms_otp_queue(provider);

-- Add comment explaining the column
COMMENT ON COLUMN public.sms_otp_queue.provider IS 'Telecom provider for the phone number (hormuud, somtel, somnet, amtel, somlink)';