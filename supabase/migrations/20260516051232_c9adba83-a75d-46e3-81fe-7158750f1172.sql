
-- Add dispatch tracking columns to delivery_queue
ALTER TABLE public.delivery_queue
  ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dispatch_device_id TEXT;

CREATE INDEX IF NOT EXISTS idx_delivery_queue_order_status
  ON public.delivery_queue(order_id, status);

CREATE INDEX IF NOT EXISTS idx_delivery_queue_status_dispatched
  ON public.delivery_queue(status, dispatched_at);

-- Update claim_next_delivery to NEVER re-claim a row that was already dispatched.
-- Also auto-promote stale processing rows with dispatched_at into 'verification_required'
-- instead of letting them be retried by a fresh claim.
CREATE OR REPLACE FUNCTION public.claim_next_delivery(p_device_id text, p_providers text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order record;
BEGIN
  -- Safety sweep: any 'processing' row that was already dispatched but stalled >90s
  -- moves to 'verification_required' (NOT back to pending) so it's never resent.
  UPDATE delivery_queue
  SET status = 'verification_required',
      error_message = COALESCE(error_message, '') ||
        ' | Auto-flagged: USSD dispatched but no final callback. Manual verification required.'
  WHERE status = 'processing'
    AND dispatched_at IS NOT NULL
    AND last_attempt_at < now() - interval '90 seconds';

  -- Mirror to orders for visibility
  UPDATE orders o
  SET delivery_status = 'verification_required',
      delivery_notes = 'USSD sent but no provider callback. Verify whether bundle was delivered before any resend.'
  FROM delivery_queue dq
  WHERE dq.order_id = o.id
    AND dq.status = 'verification_required'
    AND o.delivery_status IN ('pending', 'processing', 'timeout', 'failed');

  -- Only claim rows that have NEVER been dispatched yet.
  SELECT *
  FROM delivery_queue
  WHERE status = 'pending'
    AND dispatched_at IS NULL
    AND provider_name = ANY(p_providers)
    AND (scheduled_at IS NULL OR scheduled_at <= now())
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED
  INTO v_order;

  IF v_order.id IS NOT NULL THEN
    UPDATE delivery_queue
    SET status = 'processing',
        android_device_id = p_device_id,
        last_attempt_at = now()
    WHERE id = v_order.id;

    RETURN row_to_json(v_order)::jsonb;
  END IF;

  RETURN NULL;
END;
$function$;

-- RPC for Android (and edge fn) to mark USSD dispatched atomically.
-- Idempotent: only sets dispatched_at if currently NULL.
CREATE OR REPLACE FUNCTION public.mark_delivery_dispatched(p_queue_id uuid, p_device_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_updated integer;
BEGIN
  UPDATE delivery_queue
  SET dispatched_at = now(),
      dispatch_device_id = p_device_id
  WHERE id = p_queue_id
    AND dispatched_at IS NULL;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$function$;
