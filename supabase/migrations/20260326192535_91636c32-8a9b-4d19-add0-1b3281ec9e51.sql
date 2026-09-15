ALTER TABLE public.pending_online_payments 
ADD COLUMN IF NOT EXISTS payment_phone text;

-- Extend default expiry from 10 min to 30 min
ALTER TABLE public.pending_online_payments 
ALTER COLUMN expires_at SET DEFAULT (now() + interval '30 minutes');