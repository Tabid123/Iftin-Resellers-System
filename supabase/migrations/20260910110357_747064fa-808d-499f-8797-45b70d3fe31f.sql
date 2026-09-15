
-- 1) Lock down PII tables from anonymous callers
REVOKE SELECT, UPDATE, DELETE ON public.orders FROM anon;
GRANT INSERT ON public.orders TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;

REVOKE ALL ON public.verified_phones FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.verified_phones TO authenticated;
GRANT ALL ON public.verified_phones TO service_role;

REVOKE ALL ON public.payment_receipts FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_receipts TO authenticated;
GRANT ALL ON public.payment_receipts TO service_role;

-- 2) Catalog tables: anonymous storefront may READ its own tenant only, never write
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['providers_config','data_packages_config','package_categories',
                           'banners_config','featured_packages','error_messages',
                           'payment_providers_config']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', t);
    EXECUTE format($f$CREATE POLICY tenant_isolation ON public.%I FOR ALL TO authenticated
      USING ((tenant_id = effective_tenant_id()) OR is_super_admin())
      WITH CHECK ((tenant_id = effective_tenant_id()) OR is_super_admin())$f$, t);
    EXECUTE format('DROP POLICY IF EXISTS anon_read_tenant ON public.%I', t);
    EXECUTE format($f$CREATE POLICY anon_read_tenant ON public.%I FOR SELECT TO anon
      USING (tenant_id = current_request_tenant_id())$f$, t);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT ON public.%I TO anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

-- 3) Storefront phone verification without table access
CREATE OR REPLACE FUNCTION public.storefront_phone_is_verified(p_phone text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.verified_phones
    WHERE phone_number = p_phone
      AND tenant_id = public.current_request_tenant_id()
  )
$$;

CREATE OR REPLACE FUNCTION public.storefront_register_verified_phone(p_phone text, p_code text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant uuid := public.current_request_tenant_id();
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'tenant_required'; END IF;
  IF p_phone IS NULL OR btrim(p_phone) = '' THEN RAISE EXCEPTION 'phone_required'; END IF;

  UPDATE public.verified_phones
     SET last_login_at = now()
   WHERE phone_number = p_phone AND tenant_id = v_tenant;

  IF NOT FOUND THEN
    INSERT INTO public.verified_phones (phone_number, tenant_id, verification_code, verified_at, last_login_at)
    VALUES (p_phone, v_tenant, p_code, now(), now());
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.storefront_phone_is_verified(text) FROM public;
REVOKE ALL ON FUNCTION public.storefront_register_verified_phone(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.storefront_phone_is_verified(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.storefront_register_verified_phone(text, text) TO anon, authenticated;
