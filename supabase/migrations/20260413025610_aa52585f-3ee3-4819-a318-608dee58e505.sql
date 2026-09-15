
-- 1. Unique index to prevent duplicate delivery_queue entries
CREATE UNIQUE INDEX IF NOT EXISTS idx_delivery_queue_order_ussd_active 
ON public.delivery_queue (order_id, ussd_code) 
WHERE status IN ('pending', 'processing', 'completed');

-- 2. Replace claim_next_delivery (single arg version) with single-flight guard
CREATE OR REPLACE FUNCTION public.claim_next_delivery(p_device_id text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  delivery_row delivery_queue%ROWTYPE;
  result JSON;
  processing_count INTEGER;
BEGIN
  -- Auto-reset stale processing items (stuck > 2 minutes)
  UPDATE delivery_queue
  SET status = 'pending', android_device_id = NULL
  WHERE status = 'processing'
    AND last_attempt_at < now() - interval '2 minutes';

  -- Single-flight guard: check if device already has a processing delivery
  SELECT COUNT(*) INTO processing_count
  FROM delivery_queue
  WHERE android_device_id = p_device_id
    AND status = 'processing';

  IF processing_count > 0 THEN
    RETURN NULL;
  END IF;

  SELECT * INTO delivery_row
  FROM delivery_queue
  WHERE status = 'pending'
    AND (android_device_id IS NULL OR android_device_id = p_device_id)
    AND (scheduled_at IS NULL OR scheduled_at <= now())
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  UPDATE delivery_queue
  SET status = 'processing',
      android_device_id = p_device_id,
      last_attempt_at = now(),
      attempts = COALESCE(attempts, 0) + 1
  WHERE id = delivery_row.id;

  SELECT row_to_json(d) INTO result
  FROM (
    SELECT dq.*, o.package_name, o.data_amount, o.customer_phone
    FROM delivery_queue dq
    LEFT JOIN orders o ON dq.order_id = o.id
    WHERE dq.id = delivery_row.id
  ) d;

  RETURN result;
END;
$function$;

-- 3. Replace claim_next_delivery (with providers arg) with single-flight guard
CREATE OR REPLACE FUNCTION public.claim_next_delivery(p_device_id text, p_providers text[] DEFAULT '{}'::text[])
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  delivery_row delivery_queue%ROWTYPE;
  result JSON;
  processing_count INTEGER;
BEGIN
  -- Auto-reset stale processing items (stuck > 2 minutes)
  UPDATE delivery_queue
  SET status = 'pending', android_device_id = NULL
  WHERE status = 'processing'
    AND last_attempt_at < now() - interval '2 minutes';

  -- Single-flight guard: check if device already has a processing delivery
  SELECT COUNT(*) INTO processing_count
  FROM delivery_queue
  WHERE android_device_id = p_device_id
    AND status = 'processing';

  IF processing_count > 0 THEN
    RETURN NULL;
  END IF;

  SELECT * INTO delivery_row
  FROM delivery_queue
  WHERE status = 'pending'
    AND (android_device_id IS NULL OR android_device_id = p_device_id)
    AND (array_length(p_providers, 1) IS NULL OR lower(provider_name) = ANY(p_providers))
    AND (scheduled_at IS NULL OR scheduled_at <= now())
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  UPDATE delivery_queue
  SET status = 'processing',
      android_device_id = p_device_id,
      last_attempt_at = now(),
      attempts = COALESCE(attempts, 0) + 1
  WHERE id = delivery_row.id;

  SELECT row_to_json(d) INTO result
  FROM (
    SELECT dq.*, o.package_name, o.data_amount, o.customer_phone
    FROM delivery_queue dq
    LEFT JOIN orders o ON dq.order_id = o.id
    WHERE dq.id = delivery_row.id
  ) d;

  RETURN result;
END;
$function$;
