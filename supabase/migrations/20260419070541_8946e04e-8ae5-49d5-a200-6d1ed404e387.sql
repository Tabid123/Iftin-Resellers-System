-- 1) Fix malformed code_template rows: (receiver_phone} → {receiver_phone}
UPDATE public.delivery_instructions
SET code_template = REGEXP_REPLACE(code_template, '\(receiver_phone\}', '{receiver_phone}', 'g')
WHERE code_template LIKE '%(receiver_phone}%';

-- Also fix any other common placeholder typos defensively
UPDATE public.delivery_instructions
SET code_template = REGEXP_REPLACE(code_template, '\(cost_price\}', '{cost_price}', 'g')
WHERE code_template LIKE '%(cost_price}%';

UPDATE public.delivery_instructions
SET code_template = REGEXP_REPLACE(code_template, '\(sim_password\}', '{sim_password}', 'g')
WHERE code_template LIKE '%(sim_password}%';

-- 2) Add is_primary_hormuud_sim column
ALTER TABLE public.android_devices
ADD COLUMN IF NOT EXISTS is_primary_hormuud_sim boolean NOT NULL DEFAULT false;

-- Ensure only ONE device can be the primary Hormuud SIM at a time
CREATE UNIQUE INDEX IF NOT EXISTS android_devices_primary_hormuud_unique
ON public.android_devices ((1))
WHERE is_primary_hormuud_sim = true;

-- 3) Mark device 28bad35a-fd83-43c4-aaf2-adf555d850e9 as primary Hormuud SIM
UPDATE public.android_devices
SET is_primary_hormuud_sim = false
WHERE is_primary_hormuud_sim = true;

UPDATE public.android_devices
SET is_primary_hormuud_sim = true
WHERE id = '28bad35a-fd83-43c4-aaf2-adf555d850e9';

-- 4) Update claim_next_delivery to enforce Hormuud sticky routing
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
  is_primary_hormuud BOOLEAN;
BEGIN
  -- Auto-reset stale processing items (stuck > 2 minutes)
  UPDATE delivery_queue
  SET status = 'pending', android_device_id = NULL
  WHERE status = 'processing'
    AND last_attempt_at < now() - interval '2 minutes';

  -- Single-flight guard
  SELECT COUNT(*) INTO processing_count
  FROM delivery_queue
  WHERE android_device_id = p_device_id
    AND status = 'processing';

  IF processing_count > 0 THEN
    RETURN NULL;
  END IF;

  -- Check if THIS device is the primary Hormuud SIM
  SELECT COALESCE(is_primary_hormuud_sim, false) INTO is_primary_hormuud
  FROM android_devices
  WHERE device_id = p_device_id
  LIMIT 1;

  is_primary_hormuud := COALESCE(is_primary_hormuud, false);

  SELECT * INTO delivery_row
  FROM delivery_queue
  WHERE status = 'pending'
    AND (android_device_id IS NULL OR android_device_id = p_device_id)
    AND (array_length(p_providers, 1) IS NULL OR lower(provider_name) = ANY(p_providers))
    AND (scheduled_at IS NULL OR scheduled_at <= now())
    -- Hormuud sticky routing: only the primary device claims Hormuud orders
    AND (
      lower(provider_name) <> 'hormuud'
      OR is_primary_hormuud = true
    )
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

-- Also update the single-arg overload to be safe
CREATE OR REPLACE FUNCTION public.claim_next_delivery(p_device_id text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN public.claim_next_delivery(p_device_id, '{}'::text[]);
END;
$function$;