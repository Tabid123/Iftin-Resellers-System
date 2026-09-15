CREATE OR REPLACE FUNCTION public.claim_next_delivery(p_device_id text, p_providers text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_device record;
  v_order record;
BEGIN
  SELECT id, tenant_id
    INTO v_device
  FROM public.android_devices
  WHERE device_id = p_device_id
    AND archived_at IS NULL
    AND is_active = true
    AND tenant_id IS NOT NULL
  ORDER BY last_ping_at DESC NULLS LAST, created_at DESC
  LIMIT 1;

  IF v_device.tenant_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Safety sweep for this tenant/device only: dispatched jobs must not be resent.
  UPDATE public.delivery_queue
  SET status = 'verification_required',
      error_message = COALESCE(error_message, '') ||
        ' | Auto-flagged: USSD dispatched but no final callback. Manual verification required.'
  WHERE tenant_id = v_device.tenant_id
    AND android_device_id = p_device_id
    AND status = 'processing'
    AND dispatched_at IS NOT NULL
    AND last_attempt_at < now() - interval '90 seconds';

  UPDATE public.orders o
  SET delivery_status = 'verification_required',
      delivery_notes = 'USSD sent but no provider callback. Verify whether bundle was delivered before any resend.'
  FROM public.delivery_queue dq
  WHERE dq.order_id = o.id
    AND dq.tenant_id = v_device.tenant_id
    AND o.tenant_id = v_device.tenant_id
    AND dq.status = 'verification_required'
    AND o.delivery_status IN ('pending', 'processing', 'timeout', 'failed');

  SELECT *
    INTO v_order
  FROM public.delivery_queue
  WHERE tenant_id = v_device.tenant_id
    AND status = 'pending'
    AND dispatched_at IS NULL
    AND provider_name = ANY(p_providers)
    AND (scheduled_at IS NULL OR scheduled_at <= now())
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_order.id IS NOT NULL THEN
    UPDATE public.delivery_queue
    SET status = 'processing',
        android_device_id = p_device_id,
        last_attempt_at = now()
    WHERE id = v_order.id
      AND tenant_id = v_device.tenant_id
    RETURNING * INTO v_order;

    RETURN row_to_json(v_order)::jsonb;
  END IF;

  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mark_delivery_dispatched(p_queue_id uuid, p_device_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_updated integer;
BEGIN
  IF p_device_id IS NULL OR length(trim(p_device_id)) = 0 THEN
    RETURN false;
  END IF;

  UPDATE public.delivery_queue dq
  SET dispatched_at = now(),
      dispatch_device_id = p_device_id
  WHERE dq.id = p_queue_id
    AND dq.dispatched_at IS NULL
    AND (dq.android_device_id IS NULL OR dq.android_device_id = p_device_id)
    AND EXISTS (
      SELECT 1
      FROM public.android_devices ad
      WHERE ad.device_id = p_device_id
        AND ad.archived_at IS NULL
        AND ad.is_active = true
        AND ad.tenant_id = dq.tenant_id
    );

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$function$;