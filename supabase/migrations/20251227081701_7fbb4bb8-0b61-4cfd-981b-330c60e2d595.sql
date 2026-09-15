-- Add columns to track SMS escalation
ALTER TABLE public.device_alerts 
ADD COLUMN IF NOT EXISTS sms_count integer DEFAULT 1,
ADD COLUMN IF NOT EXISTS last_sms_at timestamp with time zone DEFAULT now();