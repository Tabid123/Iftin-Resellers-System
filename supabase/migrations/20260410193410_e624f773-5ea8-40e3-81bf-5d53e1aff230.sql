
CREATE TABLE public.auto_topup_delivery_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_package_id UUID NOT NULL REFERENCES public.auto_topup_packages(id) ON DELETE CASCADE,
  target_package_id UUID NOT NULL REFERENCES public.auto_topup_packages(id) ON DELETE CASCADE,
  delivery_count INTEGER NOT NULL DEFAULT 1,
  delay_minutes INTEGER NOT NULL DEFAULT 0,
  execution_order INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.auto_topup_delivery_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage auto topup delivery rules"
  ON public.auto_topup_delivery_rules FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Anyone can read auto topup delivery rules"
  ON public.auto_topup_delivery_rules FOR SELECT
  TO public
  USING (true);
