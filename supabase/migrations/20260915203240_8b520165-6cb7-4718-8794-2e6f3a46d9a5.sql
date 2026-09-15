CREATE OR REPLACE FUNCTION public.get_tenant_by_slug(p_slug text)
 RETURNS TABLE(id uuid, slug text, name text, logo_url text, primary_color text, accent_color text, status text, plan_id uuid, trial_ends_at timestamp with time zone, current_period_end timestamp with time zone, support_phone text, is_demo boolean)
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
         t.plan_id, t.trial_ends_at, t.current_period_end, t.support_phone, t.is_demo
  FROM public.tenants t
  WHERE t.slug = p_slug
  LIMIT 1
$function$;