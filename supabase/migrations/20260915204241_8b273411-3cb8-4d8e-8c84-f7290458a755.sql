ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS suspension_reason text,
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz;

DROP FUNCTION IF EXISTS public.get_tenant_by_slug(text);

CREATE FUNCTION public.get_tenant_by_slug(p_slug text)
RETURNS TABLE(
  id uuid, slug text, name text, logo_url text, primary_color text,
  accent_color text, status text, plan_id uuid,
  trial_ends_at timestamptz, current_period_end timestamptz,
  support_phone text, is_demo boolean,
  suspension_reason text, suspended_at timestamptz, suspension_kind text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT t.id, t.slug, t.name, t.logo_url, t.primary_color, t.accent_color,
         CASE
           WHEN t.status IN ('trial', 'active')
            AND COALESCE(t.trial_ends_at, t.current_period_end) IS NOT NULL
            AND COALESCE(t.trial_ends_at, t.current_period_end) < now()
           THEN 'suspended'
           ELSE t.status
         END AS status,
         t.plan_id, t.trial_ends_at, t.current_period_end, t.support_phone, t.is_demo,
         t.suspension_reason,
         COALESCE(
           t.suspended_at,
           CASE
             WHEN COALESCE(t.trial_ends_at, t.current_period_end) < now()
             THEN COALESCE(t.trial_ends_at, t.current_period_end)
           END
         ) AS suspended_at,
         CASE
           WHEN t.status IN ('trial','active')
            AND COALESCE(t.trial_ends_at, t.current_period_end) IS NOT NULL
            AND COALESCE(t.trial_ends_at, t.current_period_end) < now()
           THEN CASE WHEN t.trial_ends_at IS NOT NULL AND t.trial_ends_at < now()
                       AND t.status = 'trial' THEN 'trial_expired'
                     ELSE 'expired' END
           WHEN t.status IN ('suspended','cancelled') THEN 'manual'
           ELSE NULL
         END AS suspension_kind
  FROM public.tenants t
  WHERE t.slug = p_slug
  LIMIT 1
$function$;