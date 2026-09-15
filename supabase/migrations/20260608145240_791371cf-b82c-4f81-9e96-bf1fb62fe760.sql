
CREATE OR REPLACE FUNCTION public.set_tenant_id_default()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := public.current_tenant_id();
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_tenant_id_default() FROM PUBLIC, anon;

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
    'providers_config','sim_balances','sms_logs','verified_phones'
  ];
BEGIN
  FOREACH t IN ARRAY op_tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_tenant_id_default ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER set_tenant_id_default BEFORE INSERT ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id_default()',
      t
    );
  END LOOP;
END $$;
