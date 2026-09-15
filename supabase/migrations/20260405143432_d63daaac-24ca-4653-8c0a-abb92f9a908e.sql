
CREATE TABLE public.auto_topup_numbers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  phone_number text NOT NULL UNIQUE,
  label text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.auto_topup_numbers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can manage auto topup numbers"
ON public.auto_topup_numbers FOR ALL
TO public
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins can view auto topup numbers"
ON public.auto_topup_numbers FOR SELECT
TO public
USING (public.has_role(auth.uid(), 'admin'::app_role));
