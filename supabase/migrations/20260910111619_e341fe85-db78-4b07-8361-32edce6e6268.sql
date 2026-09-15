
-- Defense in depth: remove all anonymous grants on sensitive/admin tables
REVOKE ALL ON public.iftin_partner_credentials FROM anon;
REVOKE ALL ON public.partner_invoices FROM anon;
REVOKE ALL ON public.partner_orders_ledger FROM anon;
REVOKE ALL ON public.tenant_members FROM anon;
REVOKE ALL ON public.tenant_subscriptions FROM anon;
REVOKE ALL ON public.user_roles FROM anon;
REVOKE ALL ON public.subscription_plans FROM anon;
REVOKE ALL ON public.platform_apps FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.reseller_overrides FROM anon;

-- Offline registrations: anonymous callers may no longer read or edit rows
DROP POLICY IF EXISTS anon_offline_registrations_select ON public.offline_registrations;
DROP POLICY IF EXISTS anon_offline_registrations_update ON public.offline_registrations;
REVOKE SELECT, UPDATE, DELETE ON public.offline_registrations FROM anon;
GRANT INSERT ON public.offline_registrations TO anon;

CREATE OR REPLACE FUNCTION public.storefront_save_offline_registration(
  p_sender text, p_receiver text, p_provider_id uuid DEFAULT NULL, p_provider_name text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant uuid := public.effective_tenant_id(); v_id uuid;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'tenant_required'; END IF;
  IF p_sender IS NULL OR p_receiver IS NULL THEN RAISE EXCEPTION 'phones_required'; END IF;

  SELECT id INTO v_id FROM public.offline_registrations
   WHERE tenant_id = v_tenant AND sender_phone = p_sender LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO public.offline_registrations (tenant_id, sender_phone, receiver_phone, provider_id, provider_name, is_active)
    VALUES (v_tenant, p_sender, p_receiver, p_provider_id, p_provider_name, true);
  ELSE
    UPDATE public.offline_registrations
       SET receiver_phone = p_receiver,
           provider_id = COALESCE(p_provider_id, provider_id),
           provider_name = COALESCE(p_provider_name, provider_name),
           is_active = true,
           updated_at = now()
     WHERE id = v_id;
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.storefront_save_offline_registration(text, text, uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.storefront_save_offline_registration(text, text, uuid, text) TO anon, authenticated;

-- Pending online payments: anonymous checkout may create and look up, never modify/delete
DROP POLICY IF EXISTS anon_tenant_pending_payments ON public.pending_online_payments;
CREATE POLICY anon_pending_payments_insert ON public.pending_online_payments FOR INSERT TO anon
  WITH CHECK (tenant_id = effective_tenant_id());
CREATE POLICY anon_pending_payments_select ON public.pending_online_payments FOR SELECT TO anon
  USING (tenant_id = effective_tenant_id());
REVOKE UPDATE, DELETE ON public.pending_online_payments FROM anon;
