-- 1. Create pending_online_payments table
CREATE TABLE public.pending_online_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_phone TEXT NOT NULL,
  receiver_phone TEXT NOT NULL,
  provider_id UUID REFERENCES public.providers_config(id),
  package_id UUID REFERENCES public.data_packages_config(id),
  payment_provider TEXT,
  expected_amount DECIMAL(10,2) NOT NULL,
  ussd_code TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '10 minutes')
);

-- Enable RLS
ALTER TABLE public.pending_online_payments ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Anyone can insert pending payments"
  ON public.pending_online_payments FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Only admins can view pending payments"
  ON public.pending_online_payments FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Only admins can manage pending payments"
  ON public.pending_online_payments FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 2. Update payment numbers
UPDATE public.payment_providers_config 
SET payment_number = '617195659'
WHERE provider_name ILIKE '%evc%';

UPDATE public.payment_providers_config
SET payment_number = '687496153'
WHERE provider_name ILIKE '%jeeb%';

-- 3. Delete old pending_payment orders (cleanup)
DELETE FROM public.orders 
WHERE status = 'pending_payment' 
AND created_at < NOW() - INTERVAL '1 hour';