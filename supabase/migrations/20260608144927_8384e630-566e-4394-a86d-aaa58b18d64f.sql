
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'super_admin';

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role::text = 'super_admin'
  )
$$;

DO $$
DECLARE
  t text;
  op_tables text[] := ARRAY[
    'admin_permissions','android_devices','app_settings','audit_logs',
    'auto_topup_delivery_rules','auto_topup_numbers','auto_topup_packages','auto_topup_phone_mappings',
    'bank_credentials','bank_sessions','bank_transactions','banners_config','blocked_users',
    'bulk_sms_campaigns','bulk_sms_queue','customer_discounts','data_packages_config',
    'delivery_instructions','delivery_queue','device_alerts','error_messages','featured_packages',
    'fraud_alerts','notifications','offline_registrations','orders','package_categories',
    'package_delivery_rules','payment_providers_config','payment_receipts','pending_online_payments',
    'providers_config','sim_balances','sms_logs','verified_phones',
    'tenant_subscriptions','tenant_members','tenants','subscription_plans'
  ];
BEGIN
  FOREACH t IN ARRAY op_tables LOOP
    EXECUTE format('TRUNCATE TABLE public.%I RESTART IDENTITY CASCADE', t);
  END LOOP;
END $$;

INSERT INTO public.subscription_plans (name, price_monthly, max_devices, max_orders_monthly, max_admins, features, is_active)
VALUES
  ('Starter',    20,  2,  1000,     2,  '{"sms":true,"auto_topup":false,"bulk_sms":false}'::jsonb, true),
  ('Business',   50,  5,  5000,     5,  '{"sms":true,"auto_topup":true,"bulk_sms":true}'::jsonb,  true),
  ('Enterprise', 150, 20, 99999999, 20, '{"sms":true,"auto_topup":true,"bulk_sms":true,"priority_support":true}'::jsonb, true);

DO $$
DECLARE
  t text;
  pol record;
  op_tables text[] := ARRAY[
    'admin_permissions','android_devices','app_settings','audit_logs',
    'auto_topup_delivery_rules','auto_topup_numbers','auto_topup_packages','auto_topup_phone_mappings',
    'bank_credentials','bank_sessions','bank_transactions','banners_config','blocked_users',
    'bulk_sms_campaigns','bulk_sms_queue','customer_discounts','data_packages_config',
    'delivery_instructions','delivery_queue','device_alerts','error_messages','featured_packages',
    'fraud_alerts','notifications','offline_registrations','orders','package_categories',
    'package_delivery_rules','payment_providers_config','payment_receipts','pending_online_payments',
    'providers_config','sim_balances','sms_logs','verified_phones'
  ];
BEGIN
  FOREACH t IN ARRAY op_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (tenant_id)', t || '_tenant_id_idx', t);

    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t);
    END LOOP;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    EXECUTE format(
      'CREATE POLICY "tenant_isolation" ON public.%I FOR ALL TO authenticated '
      'USING (tenant_id = public.current_tenant_id() OR public.is_super_admin()) '
      'WITH CHECK (tenant_id = public.current_tenant_id() OR public.is_super_admin())',
      t
    );

    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

DO $$
DECLARE pol record;
BEGIN
  FOR pol IN SELECT tablename, policyname FROM pg_policies
             WHERE schemaname='public'
               AND tablename IN ('tenants','subscription_plans','tenant_subscriptions','tenant_members')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
  END LOOP;
END $$;

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenants super_admin all" ON public.tenants FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY "tenants member read own" ON public.tenants FOR SELECT TO authenticated
  USING (id = public.current_tenant_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenants TO authenticated;
GRANT ALL ON public.tenants TO service_role;

ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plans read all" ON public.subscription_plans FOR SELECT TO authenticated USING (true);
CREATE POLICY "plans super_admin write" ON public.subscription_plans FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscription_plans TO authenticated;
GRANT ALL ON public.subscription_plans TO service_role;

ALTER TABLE public.tenant_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sub super_admin all" ON public.tenant_subscriptions FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY "sub member read own" ON public.tenant_subscriptions FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_subscriptions TO authenticated;
GRANT ALL ON public.tenant_subscriptions TO service_role;

ALTER TABLE public.tenant_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members super_admin all" ON public.tenant_members FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY "members read own tenant" ON public.tenant_members FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id() OR user_id = auth.uid());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_members TO authenticated;
GRANT ALL ON public.tenant_members TO service_role;
