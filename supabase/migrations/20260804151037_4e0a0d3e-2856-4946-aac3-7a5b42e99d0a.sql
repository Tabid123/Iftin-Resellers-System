GRANT SELECT, INSERT, UPDATE ON public.pending_online_payments TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pending_online_payments TO authenticated;
GRANT ALL ON public.pending_online_payments TO service_role;

DROP POLICY IF EXISTS anon_tenant_pending_payments ON public.pending_online_payments;
CREATE POLICY anon_tenant_pending_payments
ON public.pending_online_payments
FOR ALL
TO anon
USING (tenant_id = effective_tenant_id())
WITH CHECK (tenant_id = effective_tenant_id());