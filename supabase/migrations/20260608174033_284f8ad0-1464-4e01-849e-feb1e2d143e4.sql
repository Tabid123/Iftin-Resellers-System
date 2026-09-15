
-- Restrict tenant_isolation to authenticated only on SENSITIVE tables.
-- Storefront-facing tables keep the existing public (anon+auth) policy so the
-- unauthenticated app can still read tenant-scoped catalog data via x-tenant-id.
DO $$
DECLARE
  t text;
  sensitive text[] := ARRAY[
    'admin_permissions','android_devices','audit_logs',
    'auto_topup_delivery_rules','auto_topup_numbers','auto_topup_packages','auto_topup_phone_mappings',
    'bank_credentials','bank_sessions','bank_transactions',
    'blocked_users','bulk_sms_campaigns','bulk_sms_queue','customer_discounts',
    'delivery_queue','device_alerts','fraud_alerts','notifications',
    'offline_registrations','package_delivery_rules','pending_online_payments',
    'sim_balances','sms_logs'
  ];
BEGIN
  FOREACH t IN ARRAY sensitive LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON public.%I FOR ALL TO authenticated '
      'USING ((tenant_id = public.effective_tenant_id()) OR public.is_super_admin()) '
      'WITH CHECK ((tenant_id = public.effective_tenant_id()) OR public.is_super_admin())',
      t
    );
    -- Make sure anon cannot reach these tables through the Data API at all
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
  END LOOP;
END $$;
