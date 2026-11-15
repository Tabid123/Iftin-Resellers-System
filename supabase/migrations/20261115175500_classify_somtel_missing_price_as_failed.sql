-- Treat explicit carrier price rejection as failed delivery for every tenant.
-- Preserve existing failure phrases; no USSD code, SIM, orders, or payment APIs changed.
CREATE OR REPLACE FUNCTION public.is_provider_delivery_failure(p_response text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT
    lower(coalesce(p_response, '')) LIKE '%kumaad guulaysan inaad wareejiso%'
    OR lower(coalesce(p_response, '')) LIKE '%lambarkani%ma shaqaynayo%'
    OR lower(coalesce(p_response, '')) LIKE '%hore ayuu u haystaa adeegga unlimited%'
    OR lower(coalesce(p_response, '')) LIKE '%kama diiwaangashanid adeeggan%'
    OR lower(coalesce(p_response, '')) LIKE '%kama diiwaangashanid adeegga%'
    OR lower(coalesce(p_response, '')) LIKE '%qiimaha aad gelisay ma jiro%'
    OR lower(coalesce(p_response, '')) LIKE '%unrecognized mobile number%';
$function$;

-- The existing delivery_queue BEFORE/AFTER triggers now mark the failed
-- queue record AND synchronize its linked order as failed. We only update
-- rows with an unequivocal explicit provider rejection, never submit USSD again.
UPDATE public.delivery_queue
SET status = 'failed',
    completed_at = NULL,
    error_message = coalesce(nullif(error_message, ''),
      'Provider rejected delivery: ' || left(provider_response, 500))
WHERE status = 'completed'
  AND lower(coalesce(provider_response, '')) LIKE '%qiimaha aad gelisay ma jiro%';
