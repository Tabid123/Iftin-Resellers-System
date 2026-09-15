ALTER TABLE public.pending_online_payments ADD COLUMN IF NOT EXISTS discovery_index text;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ussd_price_catalog TO authenticated;
GRANT ALL ON public.ussd_price_catalog TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.discovery_unmatched_labels TO authenticated;
GRANT ALL ON public.discovery_unmatched_labels TO service_role;
GRANT SELECT, UPDATE ON public.ussd_package_discoveries TO authenticated;
GRANT ALL ON public.ussd_package_discoveries TO service_role;

ALTER TABLE public.ussd_price_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discovery_unmatched_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ussd_package_discoveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON public.ussd_price_catalog;
CREATE POLICY tenant_isolation ON public.ussd_price_catalog FOR ALL TO authenticated
  USING ((tenant_id = public.effective_tenant_id()) OR public.is_super_admin())
  WITH CHECK ((tenant_id = public.effective_tenant_id()) OR public.is_super_admin());

DROP POLICY IF EXISTS tenant_isolation ON public.discovery_unmatched_labels;
CREATE POLICY tenant_isolation ON public.discovery_unmatched_labels FOR ALL TO authenticated
  USING ((tenant_id = public.effective_tenant_id()) OR public.is_super_admin())
  WITH CHECK ((tenant_id = public.effective_tenant_id()) OR public.is_super_admin());

DROP POLICY IF EXISTS tenant_isolation_select ON public.ussd_package_discoveries;
CREATE POLICY tenant_isolation_select ON public.ussd_package_discoveries FOR SELECT TO authenticated
  USING ((tenant_id = public.effective_tenant_id()) OR public.is_super_admin());