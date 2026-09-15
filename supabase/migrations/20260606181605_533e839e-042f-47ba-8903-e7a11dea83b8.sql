
-- ============================================================
-- PHASE A: CLEAN SLATE
-- ============================================================
TRUNCATE TABLE
  public.orders, public.delivery_queue, public.delivery_instructions,
  public.android_devices, public.sim_balances, public.sms_logs,
  public.bulk_sms_campaigns, public.bulk_sms_queue,
  public.banners_config, public.featured_packages, public.notifications,
  public.app_settings, public.customer_discounts,
  public.auto_topup_numbers, public.auto_topup_packages,
  public.auto_topup_phone_mappings, public.auto_topup_delivery_rules,
  public.bank_transactions, public.bank_credentials, public.bank_sessions,
  public.payment_receipts, public.pending_online_payments,
  public.blocked_users, public.verified_phones, public.offline_registrations,
  public.fraud_alerts, public.audit_logs, public.device_alerts,
  public.error_messages, public.admin_permissions,
  public.providers_config, public.package_categories,
  public.data_packages_config, public.payment_providers_config,
  public.package_delivery_rules
RESTART IDENTITY CASCADE;

-- ============================================================
-- super_admin enum value (must commit before use later)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'super_admin' AND enumtypid = 'public.app_role'::regtype
  ) THEN
    ALTER TYPE public.app_role ADD VALUE 'super_admin';
  END IF;
END$$;
