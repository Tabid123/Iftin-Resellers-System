ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS support_phone text;

DROP FUNCTION IF EXISTS public.get_tenant_by_slug(text);
CREATE OR REPLACE FUNCTION public.get_tenant_by_slug(p_slug text)
RETURNS TABLE(id uuid, slug text, name text, logo_url text, primary_color text, accent_color text, status text, plan_id uuid, trial_ends_at timestamptz, current_period_end timestamptz, support_phone text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id, t.slug, t.name, t.logo_url, t.primary_color, t.accent_color, t.status, t.plan_id, t.trial_ends_at, t.current_period_end, t.support_phone
  FROM public.tenants t
  WHERE t.slug = p_slug
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.get_tenant_by_slug(text) TO anon, authenticated, service_role;