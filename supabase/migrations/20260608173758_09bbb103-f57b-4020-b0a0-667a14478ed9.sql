
-- 1) effective_tenant_id: anon may still use header (storefront needs it), but
-- this just makes intent explicit. Real fix is locking down tenants table reads.
CREATE OR REPLACE FUNCTION public.effective_tenant_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT CASE
    WHEN auth.uid() IS NOT NULL
      THEN COALESCE(public.current_tenant_id(), public.current_request_tenant_id())
    ELSE public.current_request_tenant_id()
  END
$$;

-- 2) tenants: stop anon enumeration of full table; allow branding lookup only
DROP POLICY IF EXISTS "tenants public read" ON public.tenants;

-- Revoke broad SELECT, grant only branding columns to anon
REVOKE SELECT ON public.tenants FROM anon;
GRANT SELECT (id, slug, name, logo_url, primary_color, accent_color, status) ON public.tenants TO anon;

-- Anon can look up any active/trial workspace for branding only.
-- Cancelled/suspended tenants are still readable so the suspended-page can render.
CREATE POLICY "tenants anon branding lookup"
  ON public.tenants FOR SELECT TO anon
  USING (true);
