ALTER TABLE public.verified_phones ADD COLUMN IF NOT EXISTS verification_code text;
ALTER TABLE public.sim_balances ADD COLUMN IF NOT EXISTS sim_id uuid;
ALTER TABLE public.sim_balances ADD COLUMN IF NOT EXISTS balance_source text NOT NULL DEFAULT 'manual';
ALTER TABLE public.device_alerts ADD COLUMN IF NOT EXISTS acknowledged_by uuid;