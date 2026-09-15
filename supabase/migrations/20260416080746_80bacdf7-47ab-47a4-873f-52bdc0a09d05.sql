
CREATE TABLE public.auto_topup_phone_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number text NOT NULL,
  package_id uuid NOT NULL REFERENCES auto_topup_packages(id) ON DELETE CASCADE,
  topup_number_id uuid NOT NULL REFERENCES auto_topup_numbers(id) ON DELETE CASCADE,
  label text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(phone_number)
);

ALTER TABLE public.auto_topup_phone_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read phone mappings"
ON public.auto_topup_phone_mappings
FOR SELECT
USING (true);

CREATE POLICY "Admins can manage phone mappings"
ON public.auto_topup_phone_mappings
FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()));
