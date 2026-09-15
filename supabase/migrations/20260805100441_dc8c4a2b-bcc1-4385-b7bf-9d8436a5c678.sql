GRANT SELECT, INSERT, UPDATE ON public.offline_registrations TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.offline_registrations TO authenticated;
GRANT ALL ON public.offline_registrations TO service_role;

DROP POLICY IF EXISTS "anon_offline_registrations_select" ON public.offline_registrations;
CREATE POLICY "anon_offline_registrations_select"
  ON public.offline_registrations FOR SELECT TO anon
  USING (tenant_id = public.current_request_tenant_id());

DROP POLICY IF EXISTS "anon_offline_registrations_insert" ON public.offline_registrations;
CREATE POLICY "anon_offline_registrations_insert"
  ON public.offline_registrations FOR INSERT TO anon
  WITH CHECK (tenant_id = public.current_request_tenant_id());

DROP POLICY IF EXISTS "anon_offline_registrations_update" ON public.offline_registrations;
CREATE POLICY "anon_offline_registrations_update"
  ON public.offline_registrations FOR UPDATE TO anon
  USING (tenant_id = public.current_request_tenant_id())
  WITH CHECK (tenant_id = public.current_request_tenant_id());