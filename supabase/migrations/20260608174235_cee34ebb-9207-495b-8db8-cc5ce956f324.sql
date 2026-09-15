
-- 1) Tenants: branding lookup via security-definer RPC, drop anon SELECT entirely
DROP POLICY IF EXISTS "tenants anon branding lookup" ON public.tenants;
REVOKE ALL ON public.tenants FROM anon;

CREATE OR REPLACE FUNCTION public.get_tenant_by_slug(p_slug text)
RETURNS TABLE (
  id uuid, slug text, name text, logo_url text,
  primary_color text, accent_color text, status text,
  plan_id uuid, trial_ends_at timestamptz, current_period_end timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT id, slug, name, logo_url, primary_color, accent_color, status::text,
         plan_id, trial_ends_at, current_period_end
  FROM public.tenants
  WHERE slug = p_slug
  LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION public.get_tenant_by_slug(text) TO anon, authenticated;

-- 2) Lock app_settings & delivery_instructions to authenticated; expose via RPCs
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['app_settings','delivery_instructions'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON public.%I FOR ALL TO authenticated '
      'USING ((tenant_id = public.effective_tenant_id()) OR public.is_super_admin()) '
      'WITH CHECK ((tenant_id = public.effective_tenant_id()) OR public.is_super_admin())',
      t
    );
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.get_tenant_app_settings()
RETURNS SETOF public.app_settings
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT * FROM public.app_settings
  WHERE tenant_id = public.current_request_tenant_id()
$$;
GRANT EXECUTE ON FUNCTION public.get_tenant_app_settings() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_tenant_delivery_instructions()
RETURNS SETOF public.delivery_instructions
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT * FROM public.delivery_instructions
  WHERE tenant_id = public.current_request_tenant_id()
$$;
GRANT EXECUTE ON FUNCTION public.get_tenant_delivery_instructions() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_tenant_banners()
RETURNS SETOF public.banners_config
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT * FROM public.banners_config
  WHERE tenant_id = public.current_request_tenant_id()
    AND COALESCE(is_active, true) = true
  ORDER BY display_order NULLS LAST
$$;
GRANT EXECUTE ON FUNCTION public.get_tenant_banners() TO anon, authenticated;
