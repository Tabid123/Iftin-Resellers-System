-- Create OTP SMS queue table for Android device SMS sending
CREATE TABLE public.sms_otp_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number TEXT NOT NULL,
  otp_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  device_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  error_message TEXT
);

-- Create index for efficient polling
CREATE INDEX idx_sms_otp_queue_status ON public.sms_otp_queue(status) WHERE status = 'pending';
CREATE INDEX idx_sms_otp_queue_created_at ON public.sms_otp_queue(created_at DESC);

-- Enable RLS
ALTER TABLE public.sms_otp_queue ENABLE ROW LEVEL SECURITY;

-- Only service role can manage OTP queue (no user access)
CREATE POLICY "Service role can manage OTP queue"
ON public.sms_otp_queue
FOR ALL
USING (true)
WITH CHECK (true);

-- Add comment
COMMENT ON TABLE public.sms_otp_queue IS 'Queue for OTP SMS messages to be sent by Android devices';