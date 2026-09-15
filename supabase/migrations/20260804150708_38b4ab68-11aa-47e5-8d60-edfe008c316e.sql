ALTER TABLE public.pending_online_payments DROP CONSTRAINT IF EXISTS pending_online_payments_provider_id_fkey;
ALTER TABLE public.pending_online_payments DROP CONSTRAINT IF EXISTS pending_online_payments_package_id_fkey;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_provider_id_fkey;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_package_id_fkey;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_payment_provider_id_fkey;