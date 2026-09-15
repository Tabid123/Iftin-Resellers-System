
-- Membership-validated workspace resolution.
CREATE OR REPLACE FUNCTION public.authorized_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH mem AS (
    SELECT DISTINCT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()
  )
  SELECT CASE
    WHEN (SELECT count(*) FROM mem) = 0 THEN NULL
    WHEN public.current_request_tenant_id() IS NOT NULL
         AND EXISTS (SELECT 1 FROM mem WHERE tenant_id = public.current_request_tenant_id())
      THEN public.current_request_tenant_id()
    WHEN (SELECT count(*) FROM mem) = 1 THEN (SELECT tenant_id FROM mem)
    ELSE NULL
  END
$function$;

-- No arbitrary LIMIT 1 pick any more: ambiguous membership resolves to NULL.
CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.authorized_tenant_id()
$function$;

CREATE OR REPLACE FUNCTION public.effective_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN auth.uid() IS NOT NULL THEN
      COALESCE(
        public.authorized_tenant_id(),
        CASE
          WHEN EXISTS (SELECT 1 FROM public.tenant_members WHERE user_id = auth.uid())
            THEN NULL
          ELSE public.current_request_tenant_id()
        END
      )
    ELSE public.current_request_tenant_id()
  END
$function$;
