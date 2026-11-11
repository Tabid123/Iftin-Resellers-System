-- $15/month commercial billing. Existing tenants keep their yearly cycle.
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS billing_cycle text NOT NULL DEFAULT 'yearly',
  ADD COLUMN IF NOT EXISTS monthly_price numeric(10,2);

DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.tenants'::regclass AND conname = 'tenants_billing_cycle_allowed') THEN
    ALTER TABLE public.tenants ADD CONSTRAINT tenants_billing_cycle_allowed
      CHECK (billing_cycle IN ('monthly', 'yearly'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.tenants'::regclass AND conname = 'tenants_monthly_price_positive') THEN
    ALTER TABLE public.tenants ADD CONSTRAINT tenants_monthly_price_positive
      CHECK (monthly_price IS NULL OR monthly_price >= 0);
  END IF;
END $migration$;

-- Keep existing Starter/Business/Enterprise plan prices and tenant assignments.
INSERT INTO public.subscription_plans
  (name, price_monthly, max_devices, max_orders_monthly, max_admins, features, is_active, display_order)
SELECT 'Monthly $15', 15, starter.max_devices, starter.max_orders_monthly, starter.max_admins,
       starter.features, true, coalesce(starter.display_order, 0) + 1
FROM public.subscription_plans starter
WHERE starter.name = 'Starter'
  AND NOT EXISTS (SELECT 1 FROM public.subscription_plans WHERE name = 'Monthly $15')
LIMIT 1;
