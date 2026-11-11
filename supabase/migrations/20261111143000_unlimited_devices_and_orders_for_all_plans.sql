-- A NULL quota means unlimited. Keep plan prices, admin limits, and billing cycles unchanged.
ALTER TABLE public.subscription_plans
  ALTER COLUMN max_devices DROP NOT NULL,
  ALTER COLUMN max_devices DROP DEFAULT,
  ALTER COLUMN max_orders_monthly DROP NOT NULL,
  ALTER COLUMN max_orders_monthly DROP DEFAULT;

UPDATE public.subscription_plans
SET max_devices = NULL,
    max_orders_monthly = NULL,
    updated_at = now()
WHERE max_devices IS NOT NULL OR max_orders_monthly IS NOT NULL;
