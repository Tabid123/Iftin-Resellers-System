ALTER TABLE public.delivery_instructions
  ALTER COLUMN order_id DROP NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'customer_discounts'
      AND column_name = 'phone_number'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'customer_discounts'
      AND column_name = 'customer_phone'
  ) THEN
    ALTER TABLE public.customer_discounts RENAME COLUMN phone_number TO customer_phone;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'customer_discounts'
      AND column_name = 'discount_percent'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'customer_discounts'
      AND column_name = 'discount_value'
  ) THEN
    ALTER TABLE public.customer_discounts RENAME COLUMN discount_percent TO discount_value;
  END IF;
END $$;

ALTER TABLE public.customer_discounts
  ADD COLUMN IF NOT EXISTS discount_type text DEFAULT 'percentage',
  ADD COLUMN IF NOT EXISTS applicable_to text DEFAULT 'all',
  ADD COLUMN IF NOT EXISTS provider_id uuid REFERENCES public.providers_config(id),
  ADD COLUMN IF NOT EXISTS package_id uuid REFERENCES public.data_packages_config(id),
  ADD COLUMN IF NOT EXISTS notes text;

ALTER TABLE public.data_packages_config
  ADD COLUMN IF NOT EXISTS profit_margin numeric;

ALTER TABLE public.data_packages_config
  ALTER COLUMN profit_margin SET DEFAULT 15;

ALTER TABLE public.verified_phones
  ADD COLUMN IF NOT EXISTS last_login_at timestamp with time zone;

ALTER TABLE public.verified_phones
  ALTER COLUMN last_login_at SET DEFAULT now();

CREATE OR REPLACE VIEW public.devices
WITH (security_invoker=on) AS
SELECT
  id,
  device_id,
  device_name,
  sim_number AS sim1_number,
  sim2_number,
  is_active,
  last_ping_at AS last_seen,
  created_at,
  updated_at
FROM public.android_devices;

GRANT SELECT ON TABLE public.devices TO anon, authenticated;

DROP POLICY IF EXISTS "Admins can delete offline registrations" ON public.offline_registrations;
CREATE POLICY "Admins can delete offline registrations"
  ON public.offline_registrations
  FOR DELETE
  TO authenticated
  USING (public.is_admin(auth.uid()));