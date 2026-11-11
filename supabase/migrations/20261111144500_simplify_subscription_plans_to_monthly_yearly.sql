-- Legacy Starter is the yearly commercial plan in use by 18 tenants.
-- Keep its UUID, existing member entitlements, expiry dates and historic subscriptions.
UPDATE public.subscription_plans
SET name='Yearly',price_monthly=0,display_order=2,is_active=true,updated_at=now()
WHERE id='c3187bb9-972d-438f-a0b9-d01890dab578'
  AND name IN ('Starter','Yearly');

-- Preserve these rows for audit/history while hiding them from new subscriptions.
UPDATE public.subscription_plans
SET is_active=false,updated_at=now()
WHERE name IN ('Business','Enterprise') AND is_active=true;

UPDATE public.subscription_plans
SET display_order=1,updated_at=now()
WHERE name='Monthly $15' AND display_order IS DISTINCT FROM 1;
