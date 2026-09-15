DROP INDEX IF EXISTS public.idx_delivery_queue_order_ussd_active;

CREATE UNIQUE INDEX idx_delivery_queue_order_ussd_active
ON public.delivery_queue (order_id, ussd_code, COALESCE(scheduled_at, created_at))
WHERE order_id IS NOT NULL
  AND status IN ('pending', 'processing', 'scheduled');