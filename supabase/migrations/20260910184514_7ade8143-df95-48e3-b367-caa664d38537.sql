-- Storefront visitors (anonymous) may read ONLY the active notifications of the
-- workspace they are currently browsing. Same tenant-scoping model as the rest
-- of the public storefront catalog.
DROP POLICY IF EXISTS "public read active notifications of current tenant" ON public.notifications;
CREATE POLICY "public read active notifications of current tenant"
ON public.notifications
FOR SELECT
TO anon
USING (is_active = true AND tenant_id = effective_tenant_id());

GRANT SELECT ON public.notifications TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;