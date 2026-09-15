ALTER TABLE public.bulk_sms_queue
ADD COLUMN IF NOT EXISTS device_id text,
ADD COLUMN IF NOT EXISTS sim_slot integer;

UPDATE public.bulk_sms_queue AS q
SET
  device_id = c.device_id,
  sim_slot = c.sim_slot
FROM public.bulk_sms_campaigns AS c
WHERE q.campaign_id = c.id
  AND (q.device_id IS NULL OR q.sim_slot IS NULL);

CREATE INDEX IF NOT EXISTS idx_bulk_sms_queue_device_status_created_at
ON public.bulk_sms_queue (device_id, status, created_at);

CREATE OR REPLACE FUNCTION public.increment_bulk_sms_counter(p_campaign_id uuid, p_field text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_field NOT IN ('sent_count', 'failed_count') THEN
    RAISE EXCEPTION 'Invalid counter field: %', p_field;
  END IF;

  IF p_field = 'sent_count' THEN
    UPDATE public.bulk_sms_campaigns
    SET
      sent_count = COALESCE(sent_count, 0) + 1,
      status = CASE
        WHEN COALESCE(sent_count, 0) + 1 + COALESCE(failed_count, 0) >= COALESCE(total_recipients, 0)
          THEN 'completed'
        ELSE COALESCE(status, 'sending')
      END
    WHERE id = p_campaign_id;
  ELSE
    UPDATE public.bulk_sms_campaigns
    SET
      failed_count = COALESCE(failed_count, 0) + 1,
      status = CASE
        WHEN COALESCE(sent_count, 0) + COALESCE(failed_count, 0) + 1 >= COALESCE(total_recipients, 0)
          THEN 'completed'
        ELSE COALESCE(status, 'sending')
      END
    WHERE id = p_campaign_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_bulk_sms_counter(uuid, text) TO anon, authenticated, service_role;