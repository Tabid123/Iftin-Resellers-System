CREATE OR REPLACE FUNCTION public.claim_next_delivery(p_device_id text, p_providers text[] DEFAULT '{}'::text[])
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  delivery_row delivery_queue%ROWTYPE;
  result JSON;
BEGIN
  SELECT * INTO delivery_row
  FROM delivery_queue
  WHERE status = 'pending'
    AND (android_device_id IS NULL OR android_device_id = p_device_id)
    AND (array_length(p_providers, 1) IS NULL OR lower(provider_name) = ANY(p_providers))
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