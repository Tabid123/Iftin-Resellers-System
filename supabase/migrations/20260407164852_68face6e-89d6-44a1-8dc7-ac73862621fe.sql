ALTER TABLE public.delivery_queue ADD COLUMN IF NOT EXISTS provider_response TEXT;
ALTER TABLE public.delivery_queue ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;