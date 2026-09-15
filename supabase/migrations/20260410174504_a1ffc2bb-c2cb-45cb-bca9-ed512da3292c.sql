
CREATE TABLE public.auto_topup_packages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  topup_number_id UUID NOT NULL REFERENCES public.auto_topup_numbers(id) ON DELETE CASCADE,
  package_name TEXT NOT NULL,
  selling_price NUMERIC NOT NULL,
  data_amount TEXT NOT NULL DEFAULT '',
  ussd_code TEXT,
  provider_name TEXT NOT NULL DEFAULT 'hormuud',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.auto_topup_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read auto topup packages"
ON public.auto_topup_packages FOR SELECT
TO public USING (true);

CREATE POLICY "Admins can manage auto topup packages"
ON public.auto_topup_packages FOR ALL
TO authenticated USING (public.is_admin(auth.uid()));
