-- RPC to increment bulk SMS campaign counters + auto-complete
CREATE OR REPLACE FUNCTION public.increment_bulk_sms_counter(p_campaign_id uuid, p_field text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_field = 'sent_count' THEN
    UPDATE bulk_sms_campaigns SET sent_count = sent_count + 1 WHERE id = p_campaign_id;
  ELSIF p_field = 'failed_count' THEN
    UPDATE bulk_sms_campaigns SET failed_count = failed_count + 1 WHERE id = p_campaign_id;
  END IF;
  
  -- Auto-complete campaign when all messages processed
  UPDATE bulk_sms_campaigns 
  SET status = 'completed' 
  WHERE id = p_campaign_id 
    AND (sent_count + failed_count) >= total_recipients
    AND status = 'sending';
END;
$$;

-- Allow anon (Android device) to read pending bulk SMS queue items
CREATE POLICY "Devices can read pending bulk sms queue"
ON public.bulk_sms_queue
FOR SELECT
TO anon
USING (status = 'pending');

-- Allow anon to update bulk SMS queue status
CREATE POLICY "Devices can update bulk sms queue status"
ON public.bulk_sms_queue
FOR UPDATE
TO anon
USING (status = 'pending');

-- Allow anon to read campaign messages
CREATE POLICY "Devices can read bulk sms campaigns"
ON public.bulk_sms_campaigns
FOR SELECT
TO anon
USING (true);

-- Allow anon to update campaign counters (via RPC SECURITY DEFINER, but also direct)
CREATE POLICY "Devices can update bulk sms campaigns"
ON public.bulk_sms_campaigns
FOR UPDATE
TO anon
USING (true);