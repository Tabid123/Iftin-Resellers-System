CREATE OR REPLACE FUNCTION public.get_tenant_by_slug(p_slug text)
 RETURNS TABLE(id uuid, slug text, name text, logo_url text, primary_color text, accent_color text, status text, plan_id uuid, trial_ends_at timestamp with time zone, current_period_end timestamp with time zone, support_phone text, is_demo boolean, suspension_reason text, suspended_at timestamp with time zone, suspension_kind text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT t.id, t.slug, t.name, t.logo_url, t.primary_color, t.accent_color,
         CASE
           WHEN t.status = 'trial'
            AND t.trial_ends_at IS NOT NULL
            AND t.trial_ends_at < now()
           THEN 'suspended'
           WHEN t.status = 'active'
            AND t.current_period_end IS NOT NULL
            AND t.current_period_end < now()
           THEN 'suspended'
           ELSE t.status
         END AS status,
         t.plan_id, t.trial_ends_at, t.current_period_end, t.support_phone, t.is_demo,
         t.suspension_reason,
         COALESCE(
           t.suspended_at,
           CASE
             WHEN t.status = 'trial' AND t.trial_ends_at IS NOT NULL AND t.trial_ends_at < now()
             THEN t.trial_ends_at
             WHEN t.status = 'active' AND t.current_period_end IS NOT NULL AND t.current_period_end < now()
             THEN t.current_period_end
           END
         ) AS suspended_at,
         CASE
           WHEN t.status = 'trial'
            AND t.trial_ends_at IS NOT NULL
            AND t.trial_ends_at < now()
           THEN 'trial_expired'
           WHEN t.status = 'active'
            AND t.current_period_end IS NOT NULL
            AND t.current_period_end < now()
           THEN 'expired'
           WHEN t.status IN ('suspended','cancelled')
            AND (t.suspension_reason IS NULL OR btrim(t.suspension_reason) = '')
            AND COALESCE(t.trial_ends_at, t.current_period_end) IS NOT NULL
            AND COALESCE(t.trial_ends_at, t.current_period_end) < now()
           THEN CASE WHEN t.trial_ends_at IS NOT NULL AND t.trial_ends_at < now()
                     THEN 'trial_expired' ELSE 'expired' END
           WHEN t.status IN ('suspended','cancelled') THEN 'manual'
           ELSE NULL
         END AS suspension_kind
  FROM public.tenants t
  WHERE t.slug = p_slug
  LIMIT 1
$function$;