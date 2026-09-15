
-- Enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'super_admin', 'moderator');

-- 1. providers_config
CREATE TABLE public.providers_config (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_name text NOT NULL,
  provider_logo text,
  is_active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  evoucher_rate numeric NOT NULL DEFAULT 0,
  promotional_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.providers_config TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.providers_config TO authenticated;
GRANT ALL ON public.providers_config TO service_role;
ALTER TABLE public.providers_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "providers_config public read" ON public.providers_config FOR SELECT USING (true);
CREATE POLICY "providers_config auth write" ON public.providers_config FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 2. package_categories
CREATE TABLE public.package_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category_name text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  provider_id uuid REFERENCES public.providers_config(id),
  category_image text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.package_categories TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.package_categories TO authenticated;
GRANT ALL ON public.package_categories TO service_role;
ALTER TABLE public.package_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "package_categories public read" ON public.package_categories FOR SELECT USING (true);
CREATE POLICY "package_categories auth write" ON public.package_categories FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 3. data_packages_config
CREATE TABLE public.data_packages_config (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  package_name text NOT NULL,
  data_amount text NOT NULL,
  validity_days text NOT NULL DEFAULT '30',
  selling_price numeric NOT NULL,
  cost_price numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  category_id uuid REFERENCES public.package_categories(id),
  provider_id uuid NOT NULL REFERENCES public.providers_config(id),
  connection_type_label text NOT NULL DEFAULT 'Data',
  ussd_code text,
  display_order integer NOT NULL DEFAULT 0,
  profit_margin numeric DEFAULT 15,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.data_packages_config TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.data_packages_config TO authenticated;
GRANT ALL ON public.data_packages_config TO service_role;
ALTER TABLE public.data_packages_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "data_packages_config public read" ON public.data_packages_config FOR SELECT USING (true);
CREATE POLICY "data_packages_config auth write" ON public.data_packages_config FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 4. featured_packages
CREATE TABLE public.featured_packages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  package_id uuid NOT NULL REFERENCES public.data_packages_config(id),
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.featured_packages TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.featured_packages TO authenticated;
GRANT ALL ON public.featured_packages TO service_role;
ALTER TABLE public.featured_packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "featured_packages public read" ON public.featured_packages FOR SELECT USING (true);
CREATE POLICY "featured_packages auth write" ON public.featured_packages FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 5. payment_providers_config
CREATE TABLE public.payment_providers_config (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_name text NOT NULL,
  provider_logo text,
  commission_rate numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  prefix_code text,
  ussd_code_template text,
  payment_number text,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.payment_providers_config TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_providers_config TO authenticated;
GRANT ALL ON public.payment_providers_config TO service_role;
ALTER TABLE public.payment_providers_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payment_providers_config public read" ON public.payment_providers_config FOR SELECT USING (true);
CREATE POLICY "payment_providers_config auth write" ON public.payment_providers_config FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 6. orders
CREATE TABLE public.orders (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_phone text NOT NULL,
  sender_phone text,
  receiver_phone text NOT NULL,
  package_id uuid REFERENCES public.data_packages_config(id),
  provider_id uuid REFERENCES public.providers_config(id),
  payment_provider_id uuid REFERENCES public.payment_providers_config(id),
  package_name text NOT NULL,
  data_amount text,
  selling_price numeric NOT NULL,
  cost_price numeric NOT NULL DEFAULT 0,
  payment_number text,
  payment_source text,
  status text NOT NULL DEFAULT 'pending_payment',
  delivery_status text DEFAULT 'pending',
  delivery_notes text,
  delivered_at timestamptz,
  is_manual boolean DEFAULT false,
  invoice_url text,
  tx_id text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.orders TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orders public read" ON public.orders FOR SELECT USING (true);
CREATE POLICY "orders public insert" ON public.orders FOR INSERT WITH CHECK (true);
CREATE POLICY "orders auth update" ON public.orders FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "orders auth delete" ON public.orders FOR DELETE TO authenticated USING (true);

-- 7. delivery_queue
CREATE TABLE public.delivery_queue (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES public.orders(id),
  provider_name text NOT NULL,
  receiver_phone text NOT NULL,
  ussd_code text NOT NULL,
  package_code text,
  status text DEFAULT 'pending',
  attempts integer DEFAULT 0,
  error_message text,
  android_device_id text,
  sim_slot integer,
  last_attempt_at timestamptz,
  completed_at timestamptz,
  provider_response text,
  scheduled_at timestamptz,
  dispatched_at timestamptz,
  dispatch_device_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_queue TO authenticated;
GRANT ALL ON public.delivery_queue TO service_role;
ALTER TABLE public.delivery_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "delivery_queue auth all" ON public.delivery_queue FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 8. delivery_instructions
CREATE TABLE public.delivery_instructions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id uuid REFERENCES public.orders(id),
  instruction_type text NOT NULL DEFAULT 'ussd',
  ussd_code text,
  receiver_phone text,
  provider_name text,
  execution_order integer DEFAULT 1,
  status text DEFAULT 'pending',
  provider_id uuid REFERENCES public.providers_config(id),
  category_id uuid REFERENCES public.package_categories(id),
  package_id uuid REFERENCES public.data_packages_config(id),
  code_template text,
  sim_password text,
  notes text,
  instruction_template text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_instructions TO authenticated;
GRANT ALL ON public.delivery_instructions TO service_role;
ALTER TABLE public.delivery_instructions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "delivery_instructions auth all" ON public.delivery_instructions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 9. pending_online_payments
CREATE TABLE public.pending_online_payments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  verified_phone text,
  sender_phone text NOT NULL,
  receiver_phone text NOT NULL,
  provider_id uuid REFERENCES public.providers_config(id),
  package_id uuid REFERENCES public.data_packages_config(id),
  payment_provider text,
  expected_amount numeric NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  matched_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.pending_online_payments TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pending_online_payments TO authenticated;
GRANT ALL ON public.pending_online_payments TO service_role;
ALTER TABLE public.pending_online_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pending_online_payments read" ON public.pending_online_payments FOR SELECT USING (true);
CREATE POLICY "pending_online_payments insert" ON public.pending_online_payments FOR INSERT WITH CHECK (true);
CREATE POLICY "pending_online_payments auth update" ON public.pending_online_payments FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- 10. payment_receipts
CREATE TABLE public.payment_receipts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_phone text NOT NULL,
  amount numeric NOT NULL,
  receiver_sim text,
  sms_body text,
  tx_id text,
  status text DEFAULT 'unmatched',
  matched_order_id uuid REFERENCES public.orders(id),
  matching_strategy text,
  admin_notes text,
  processed_at timestamptz,
  created_at timestamptz DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_receipts TO authenticated;
GRANT ALL ON public.payment_receipts TO service_role;
ALTER TABLE public.payment_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payment_receipts auth all" ON public.payment_receipts FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 11. offline_registrations
CREATE TABLE public.offline_registrations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_phone text NOT NULL UNIQUE,
  receiver_phone text NOT NULL,
  provider_id text,
  provider_name text,
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.offline_registrations TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.offline_registrations TO authenticated;
GRANT ALL ON public.offline_registrations TO service_role;
ALTER TABLE public.offline_registrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "offline_registrations read" ON public.offline_registrations FOR SELECT USING (true);
CREATE POLICY "offline_registrations insert" ON public.offline_registrations FOR INSERT WITH CHECK (true);
CREATE POLICY "offline_registrations update" ON public.offline_registrations FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "offline_registrations auth delete" ON public.offline_registrations FOR DELETE TO authenticated USING (true);

-- 12. verified_phones
CREATE TABLE public.verified_phones (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  phone_number text NOT NULL UNIQUE,
  verified_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.verified_phones TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.verified_phones TO authenticated;
GRANT ALL ON public.verified_phones TO service_role;
ALTER TABLE public.verified_phones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "verified_phones read" ON public.verified_phones FOR SELECT USING (true);
CREATE POLICY "verified_phones insert" ON public.verified_phones FOR INSERT WITH CHECK (true);
CREATE POLICY "verified_phones update" ON public.verified_phones FOR UPDATE USING (true) WITH CHECK (true);

-- 13. blocked_users
CREATE TABLE public.blocked_users (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  phone_number text NOT NULL UNIQUE,
  reason text,
  is_active boolean NOT NULL DEFAULT true,
  blocked_by uuid,
  unblocked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.blocked_users TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blocked_users TO authenticated;
GRANT ALL ON public.blocked_users TO service_role;
ALTER TABLE public.blocked_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "blocked_users read" ON public.blocked_users FOR SELECT USING (true);
CREATE POLICY "blocked_users auth write" ON public.blocked_users FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 14. android_devices
CREATE TABLE public.android_devices (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  device_id text NOT NULL UNIQUE,
  device_name text NOT NULL,
  sim_number text NOT NULL,
  sim2_number text,
  provider_name text NOT NULL,
  sim1_provider text,
  sim2_provider text,
  is_active boolean NOT NULL DEFAULT true,
  total_deliveries integer DEFAULT 0,
  failed_deliveries integer DEFAULT 0,
  last_ping_at timestamptz,
  archived_at timestamptz,
  battery_level integer,
  is_charging boolean DEFAULT false,
  is_primary_hormuud_sim boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.android_devices TO authenticated;
GRANT ALL ON public.android_devices TO service_role;
ALTER TABLE public.android_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "android_devices auth all" ON public.android_devices FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 15. sim_balances
CREATE TABLE public.sim_balances (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  device_id text NOT NULL,
  sim_slot integer NOT NULL DEFAULT 1,
  balance numeric NOT NULL DEFAULT 0,
  balance_type text NOT NULL DEFAULT 'evc_plus',
  last_updated timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sim_balances TO authenticated;
GRANT ALL ON public.sim_balances TO service_role;
ALTER TABLE public.sim_balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sim_balances auth all" ON public.sim_balances FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 16. device_alerts
CREATE TABLE public.device_alerts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  device_id text NOT NULL,
  device_name text,
  alert_type text NOT NULL,
  message text,
  is_resolved boolean DEFAULT false,
  is_acknowledged boolean DEFAULT false,
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  sms_count integer DEFAULT 1,
  last_sms_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.device_alerts TO authenticated;
GRANT ALL ON public.device_alerts TO service_role;
ALTER TABLE public.device_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "device_alerts auth all" ON public.device_alerts FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 17. notifications
CREATE TABLE public.notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  message text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.notifications TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notifications read" ON public.notifications FOR SELECT USING (true);
CREATE POLICY "notifications auth write" ON public.notifications FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 18. banners_config
CREATE TABLE public.banners_config (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  banner_image text NOT NULL,
  alt_text text,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  media_type text DEFAULT 'image',
  video_duration integer,
  rotation_interval integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.banners_config TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.banners_config TO authenticated;
GRANT ALL ON public.banners_config TO service_role;
ALTER TABLE public.banners_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "banners_config read" ON public.banners_config FOR SELECT USING (true);
CREATE POLICY "banners_config auth write" ON public.banners_config FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 19. app_settings
CREATE TABLE public.app_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  setting_key text NOT NULL UNIQUE,
  setting_value boolean,
  text_value text,
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.app_settings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_settings read" ON public.app_settings FOR SELECT USING (true);
CREATE POLICY "app_settings auth write" ON public.app_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 20. audit_logs
CREATE TABLE public.audit_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid,
  user_email text,
  action text NOT NULL,
  table_name text NOT NULL,
  record_id text,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_logs auth read" ON public.audit_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "audit_logs auth insert" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (true);

-- 21. fraud_alerts
CREATE TABLE public.fraud_alerts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_phone text NOT NULL,
  amount numeric NOT NULL,
  alert_type text NOT NULL,
  severity text NOT NULL DEFAULT 'medium',
  description text,
  is_reviewed boolean NOT NULL DEFAULT false,
  reviewed_by uuid,
  reviewed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fraud_alerts TO authenticated;
GRANT ALL ON public.fraud_alerts TO service_role;
ALTER TABLE public.fraud_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fraud_alerts auth all" ON public.fraud_alerts FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 22. user_roles
CREATE TABLE public.user_roles (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'admin',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_roles self read" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- 23. admin_permissions
CREATE TABLE public.admin_permissions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_permissions TO authenticated;
GRANT ALL ON public.admin_permissions TO service_role;
ALTER TABLE public.admin_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_permissions auth all" ON public.admin_permissions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 24. auto_topup_numbers
CREATE TABLE public.auto_topup_numbers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  phone_number text NOT NULL,
  label text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.auto_topup_numbers TO authenticated;
GRANT ALL ON public.auto_topup_numbers TO service_role;
ALTER TABLE public.auto_topup_numbers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auto_topup_numbers auth all" ON public.auto_topup_numbers FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 25. bulk_sms_campaigns
CREATE TABLE public.bulk_sms_campaigns (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message text NOT NULL,
  target_type text NOT NULL DEFAULT 'all',
  total_recipients integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  device_id text,
  sim_slot integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bulk_sms_campaigns TO authenticated;
GRANT ALL ON public.bulk_sms_campaigns TO service_role;
ALTER TABLE public.bulk_sms_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bulk_sms_campaigns auth all" ON public.bulk_sms_campaigns FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 26. bulk_sms_queue
CREATE TABLE public.bulk_sms_queue (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id uuid NOT NULL REFERENCES public.bulk_sms_campaigns(id),
  phone_number text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  sent_at timestamptz,
  error_message text,
  device_id text,
  sim_slot integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bulk_sms_queue TO authenticated;
GRANT ALL ON public.bulk_sms_queue TO service_role;
ALTER TABLE public.bulk_sms_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bulk_sms_queue auth all" ON public.bulk_sms_queue FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 27. package_delivery_rules
CREATE TABLE public.package_delivery_rules (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_package_id uuid NOT NULL REFERENCES public.data_packages_config(id),
  target_package_id uuid NOT NULL REFERENCES public.data_packages_config(id),
  delivery_count integer NOT NULL DEFAULT 1,
  delay_minutes integer NOT NULL DEFAULT 0,
  execution_order integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.package_delivery_rules TO authenticated;
GRANT ALL ON public.package_delivery_rules TO service_role;
ALTER TABLE public.package_delivery_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "package_delivery_rules auth all" ON public.package_delivery_rules FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 28. customer_discounts
CREATE TABLE public.customer_discounts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_phone text NOT NULL,
  discount_value numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  discount_type text DEFAULT 'percentage',
  applicable_to text DEFAULT 'all',
  provider_id uuid REFERENCES public.providers_config(id),
  package_id uuid REFERENCES public.data_packages_config(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.customer_discounts TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_discounts TO authenticated;
GRANT ALL ON public.customer_discounts TO service_role;
ALTER TABLE public.customer_discounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "customer_discounts read" ON public.customer_discounts FOR SELECT USING (true);
CREATE POLICY "customer_discounts auth write" ON public.customer_discounts FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 29. error_messages
CREATE TABLE public.error_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  error_code text NOT NULL UNIQUE,
  message_so text,
  message_en text,
  is_active boolean NOT NULL DEFAULT true,
  error_type text,
  title text,
  message text,
  icon_type text DEFAULT 'emoji',
  icon_value text DEFAULT '⚠️',
  is_animated boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.error_messages TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.error_messages TO authenticated;
GRANT ALL ON public.error_messages TO service_role;
ALTER TABLE public.error_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "error_messages read" ON public.error_messages FOR SELECT USING (true);
CREATE POLICY "error_messages auth write" ON public.error_messages FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 30. auto_topup_packages
CREATE TABLE public.auto_topup_packages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  topup_number_id uuid NOT NULL REFERENCES public.auto_topup_numbers(id),
  package_name text NOT NULL,
  selling_price numeric NOT NULL,
  data_amount text NOT NULL DEFAULT '',
  ussd_code text,
  provider_name text NOT NULL DEFAULT 'hormuud',
  is_active boolean NOT NULL DEFAULT true,
  cost_price numeric NOT NULL DEFAULT 0,
  sim_password text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.auto_topup_packages TO authenticated;
GRANT ALL ON public.auto_topup_packages TO service_role;
ALTER TABLE public.auto_topup_packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auto_topup_packages auth all" ON public.auto_topup_packages FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 31. auto_topup_delivery_rules
CREATE TABLE public.auto_topup_delivery_rules (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_package_id uuid NOT NULL REFERENCES public.auto_topup_packages(id),
  target_package_id uuid NOT NULL REFERENCES public.auto_topup_packages(id),
  delivery_count integer NOT NULL DEFAULT 1,
  delay_minutes integer NOT NULL DEFAULT 0,
  execution_order integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.auto_topup_delivery_rules TO authenticated;
GRANT ALL ON public.auto_topup_delivery_rules TO service_role;
ALTER TABLE public.auto_topup_delivery_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auto_topup_delivery_rules auth all" ON public.auto_topup_delivery_rules FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 32. sms_logs
CREATE TABLE public.sms_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  device_id text NOT NULL,
  sim_slot integer NOT NULL DEFAULT 1,
  sim_number text,
  sms_type text NOT NULL DEFAULT 'incoming',
  sms_sender text,
  sms_body text NOT NULL,
  amount numeric,
  tx_type text,
  tx_id text,
  counterpart_phone text,
  received_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sms_logs TO authenticated;
GRANT ALL ON public.sms_logs TO service_role;
ALTER TABLE public.sms_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sms_logs auth all" ON public.sms_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 33. auto_topup_phone_mappings
CREATE TABLE public.auto_topup_phone_mappings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  phone_number text NOT NULL,
  package_id uuid REFERENCES public.auto_topup_packages(id),
  topup_number_id uuid NOT NULL REFERENCES public.auto_topup_numbers(id),
  label text,
  is_active boolean NOT NULL DEFAULT true,
  category_name text,
  custom_amount text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.auto_topup_phone_mappings TO authenticated;
GRANT ALL ON public.auto_topup_phone_mappings TO service_role;
ALTER TABLE public.auto_topup_phone_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auto_topup_phone_mappings auth all" ON public.auto_topup_phone_mappings FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 34. bank_credentials
CREATE TABLE public.bank_credentials (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  username text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.bank_credentials TO service_role;
ALTER TABLE public.bank_credentials ENABLE ROW LEVEL SECURITY;

-- 35. bank_sessions
CREATE TABLE public.bank_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  credential_id uuid NOT NULL REFERENCES public.bank_credentials(id),
  token text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.bank_sessions TO service_role;
ALTER TABLE public.bank_sessions ENABLE ROW LEVEL SECURITY;

-- 36. bank_transactions
CREATE TABLE public.bank_transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tran_no text NOT NULL UNIQUE,
  tran_date text,
  tran_date_time timestamptz,
  acc_no text,
  customer_name text,
  tran_amt numeric NOT NULL,
  narration text,
  dr_cr text,
  uti text,
  currency_code text,
  rrp_no text,
  tran_desc text,
  tran_type text,
  user_id_field text,
  charge_amt numeric,
  raw_payload jsonb,
  parsed_sender_phone text,
  parsed_receiver_phone text,
  match_status text NOT NULL DEFAULT 'unmatched',
  matched_payment_id uuid,
  matched_order_id uuid,
  match_notes text,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_transactions TO authenticated;
GRANT ALL ON public.bank_transactions TO service_role;
ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bank_transactions auth all" ON public.bank_transactions FOR ALL TO authenticated USING (true) WITH CHECK (true);
