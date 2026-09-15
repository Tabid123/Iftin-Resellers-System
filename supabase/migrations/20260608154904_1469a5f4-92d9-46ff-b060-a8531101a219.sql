
-- 1. Helper: read x-tenant-id header → uuid (anon customer scoping)
CREATE OR REPLACE FUNCTION public.current_request_tenant_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  hdr text;
BEGIN
  BEGIN
    hdr := current_setting('request.headers', true)::json ->> 'x-tenant-id';
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;
  IF hdr IS NULL OR hdr = '' THEN RETURN NULL; END IF;
  RETURN hdr::uuid;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

-- 2. Effective tenant: member-tenant > header-tenant
CREATE OR REPLACE FUNCTION public.effective_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.current_tenant_id(), public.current_request_tenant_id())
$$;

-- 3. Strengthen the auto-default trigger to use effective_tenant_id
CREATE OR REPLACE FUNCTION public.set_tenant_id_default()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := public.effective_tenant_id();
  END IF;
  RETURN NEW;
END;
$$;

-- 4. Attach BEFORE INSERT trigger + replace RLS on every tenant-scoped table
DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    'admin_permissions','android_devices','app_settings','audit_logs',
    'auto_topup_delivery_rules','auto_topup_numbers','auto_topup_packages',
    'auto_topup_phone_mappings','bank_credentials','bank_sessions',
    'bank_transactions','banners_config','blocked_users','bulk_sms_campaigns',
    'bulk_sms_queue','customer_discounts','data_packages_config',
    'delivery_instructions','delivery_queue','device_alerts','error_messages',
    'featured_packages','fraud_alerts','notifications','offline_registrations',
    'orders','package_categories','package_delivery_rules',
    'payment_providers_config','payment_receipts','pending_online_payments',
    'providers_config','sim_balances','sms_logs','verified_phones'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    -- Trigger
    EXECUTE format('DROP TRIGGER IF EXISTS trg_set_tenant_id ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER trg_set_tenant_id BEFORE INSERT ON public.%I
       FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id_default()', t);

    -- Replace RLS with effective_tenant_id
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON public.%I
       FOR ALL
       USING (tenant_id = public.effective_tenant_id() OR public.is_super_admin())
       WITH CHECK (tenant_id = public.effective_tenant_id() OR public.is_super_admin())',
      t);

    -- Grant anon read/write so customer storefront works via header scoping
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

-- 5. Backfill: all existing data → demo tenant
DO $$
DECLARE
  demo_id uuid := '7ea35f1e-9ecd-470d-9282-86fef6941a74';
  t text;
  tenant_tables text[] := ARRAY[
    'admin_permissions','android_devices','app_settings','audit_logs',
    'auto_topup_delivery_rules','auto_topup_numbers','auto_topup_packages',
    'auto_topup_phone_mappings','bank_credentials','bank_sessions',
    'bank_transactions','banners_config','blocked_users','bulk_sms_campaigns',
    'bulk_sms_queue','customer_discounts','data_packages_config',
    'delivery_instructions','delivery_queue','device_alerts','error_messages',
    'featured_packages','fraud_alerts','notifications','offline_registrations',
    'orders','package_categories','package_delivery_rules',
    'payment_providers_config','payment_receipts','pending_online_payments',
    'providers_config','sim_balances','sms_logs','verified_phones'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    EXECUTE format('UPDATE public.%I SET tenant_id = %L WHERE tenant_id IS NULL', t, demo_id);
  END LOOP;
END $$;
