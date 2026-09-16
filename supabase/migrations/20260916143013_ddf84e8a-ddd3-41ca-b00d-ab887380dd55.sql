ALTER TABLE public.payment_providers_config
  ADD COLUMN IF NOT EXISTS is_waafipay boolean NOT NULL DEFAULT false;

UPDATE public.payment_providers_config
  SET is_waafipay = true
  WHERE lower(trim(provider_name)) = 'waafipay';

DROP FUNCTION IF EXISTS public.get_active_payment_providers();

CREATE OR REPLACE FUNCTION public.get_active_payment_providers()
 RETURNS TABLE(id uuid, provider_name text, provider_logo text, commission_rate numeric, is_active boolean, created_at timestamp with time zone, updated_at timestamp with time zone, prefix_code text, ussd_code_template text, payment_number text, is_waafipay boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    p.id,
    p.provider_name,
    p.provider_logo,
    p.commission_rate,
    p.is_active,
    p.created_at,
    p.updated_at,
    p.prefix_code,
    p.ussd_code_template,
    p.payment_number,
    COALESCE(p.is_waafipay, false)
  FROM public.payment_providers_config p
  WHERE p.tenant_id = public.current_request_tenant_id()
    AND COALESCE(p.is_active, true) = true
  ORDER BY p.provider_name;
$function$;