-- Auto-reclassify failed/timeout deliveries when a matching deduction SMS arrives
-- Runs whenever a new row is inserted into sms_logs (outgoing deduction message).
-- Looks back 5 minutes for any failed/timeout delivery_queue rows from the same
-- device whose receiver_phone matches the digits in the SMS body, and flips them
-- to completed + updates the linked order to delivered.

CREATE OR REPLACE FUNCTION public.reclassify_timeout_on_deduction_sms()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  body_lower TEXT;
  body_digits TEXT;
  is_deduction BOOLEAN;
  v_queue_row RECORD;
  receiver_last9 TEXT;
BEGIN
  body_lower := lower(COALESCE(NEW.sms_body, ''));
  is_deduction :=
    body_lower LIKE '%ugu shubtay%' OR
    body_lower LIKE '%haraagaagu waa%' OR
    body_lower LIKE '%u wareejisay%' OR
    body_lower LIKE '%ku guulaysatay%';

  IF NOT is_deduction THEN
    RETURN NEW;
  END IF;

  body_digits := regexp_replace(COALESCE(NEW.sms_body, ''), '\D', '', 'g');

  -- Find recent failed/timeout deliveries from this device with matching receiver phone
  FOR v_queue_row IN
    SELECT dq.id, dq.order_id, dq.receiver_phone, dq.error_message, dq.status
    FROM public.delivery_queue dq
    WHERE dq.android_device_id = NEW.device_id
      AND dq.status IN ('failed', 'timeout')
      AND dq.last_attempt_at >= now() - interval '5 minutes'
      AND (
        dq.error_message ILIKE '%no ussd response%'
        OR dq.error_message ILIKE '%timeout%'
        OR dq.error_message IS NULL
      )
  LOOP
    -- Match by last 9 digits of receiver phone present in body
    receiver_last9 := right(regexp_replace(COALESCE(v_queue_row.receiver_phone, ''), '\D', '', 'g'), 9);

    IF length(receiver_last9) = 9 AND position(receiver_last9 in body_digits) > 0 THEN
      -- Flip queue row to completed
      UPDATE public.delivery_queue
      SET status = 'completed',
          completed_at = now(),
          provider_response = left(NEW.sms_body, 500),
          error_message = NULL
      WHERE id = v_queue_row.id;

      -- Flip linked order to delivered
      UPDATE public.orders
      SET delivery_status = 'delivered',
          delivered_at = now(),
          delivery_notes = 'Auto-confirmed by deduction SMS — late USSD callback. ' || left(NEW.sms_body, 200)
      WHERE id = v_queue_row.order_id
        AND delivery_status IN ('failed', 'timeout', 'pending');
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sms_logs_reclassify_timeout ON public.sms_logs;

CREATE TRIGGER sms_logs_reclassify_timeout
AFTER INSERT ON public.sms_logs
FOR EACH ROW
EXECUTE FUNCTION public.reclassify_timeout_on_deduction_sms();