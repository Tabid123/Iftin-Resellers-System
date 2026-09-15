
-- 1. Atomic claim function for delivery_queue (prevents race condition)
CREATE OR REPLACE FUNCTION public.claim_next_delivery(
  p_device_id TEXT,
  p_providers TEXT[]
)
RETURNS SETOF delivery_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  UPDATE delivery_queue
  SET status = 'processing',
      android_device_id = p_device_id,
      last_attempt_at = NOW()
  WHERE id = (
    SELECT id FROM delivery_queue
    WHERE status = 'pending'
      AND provider_name = ANY(p_providers)
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$;

-- 2. Unique partial index to prevent duplicate delivery_queue entries for same order
-- Only applies to non-bundled (single delivery) entries with active statuses
-- Allows multiple entries when order_id is NULL (manual deliveries)
CREATE UNIQUE INDEX IF NOT EXISTS idx_delivery_queue_unique_active_order 
ON delivery_queue (order_id) 
WHERE order_id IS NOT NULL 
  AND status IN ('pending', 'processing');
