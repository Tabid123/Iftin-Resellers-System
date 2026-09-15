
-- =============================================
-- NAJAX DATA: Complete Database Setup
-- =============================================

-- 1. PROVIDERS CONFIG
CREATE TABLE public.providers_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_name TEXT NOT NULL,
  provider_logo TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  evoucher_rate NUMERIC NOT NULL DEFAULT 0,
  promotional_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. PACKAGE CATEGORIES
CREATE TABLE public.package_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_name TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  provider_id UUID REFERENCES public.providers_config(id) ON DELETE CASCADE,
  category_image TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. DATA PACKAGES CONFIG
CREATE TABLE public.data_packages_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_name TEXT NOT NULL,
  data_amount TEXT NOT NULL,
  validity_days TEXT NOT NULL DEFAULT '30',
  selling_price NUMERIC NOT NULL,
  cost_price NUMERIC NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  category_id UUID REFERENCES public.package_categories(id) ON DELETE SET NULL,
  provider_id UUID REFERENCES public.providers_config(id) ON DELETE CASCADE NOT NULL,
  connection_type_label TEXT NOT NULL DEFAULT 'Data',
  ussd_code TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. FEATURED PACKAGES
CREATE TABLE public.featured_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID REFERENCES public.data_packages_config(id) ON DELETE CASCADE NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. PAYMENT PROVIDERS CONFIG
CREATE TABLE public.payment_providers_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_name TEXT NOT NULL,
  provider_logo TEXT,
  commission_rate NUMERIC NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  prefix_code TEXT,
  ussd_code_template TEXT,
  payment_number TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. ORDERS
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_phone TEXT NOT NULL,
  sender_phone TEXT,
  receiver_phone TEXT NOT NULL,
  package_id UUID REFERENCES public.data_packages_config(id),
  provider_id UUID REFERENCES public.providers_config(id),
  payment_provider_id UUID REFERENCES public.payment_providers_config(id),
  package_name TEXT NOT NULL,
  data_amount TEXT,
  selling_price NUMERIC NOT NULL,
  cost_price NUMERIC NOT NULL DEFAULT 0,
  payment_number TEXT,
  payment_source TEXT,
  status TEXT NOT NULL DEFAULT 'pending_payment',
  delivery_status TEXT DEFAULT 'pending',
  delivery_notes TEXT,
  delivered_at TIMESTAMPTZ,
  is_manual BOOLEAN DEFAULT false,
  invoice_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. DELIVERY QUEUE
CREATE TABLE public.delivery_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
  provider_name TEXT NOT NULL,
  receiver_phone TEXT NOT NULL,
  ussd_code TEXT NOT NULL,
  package_code TEXT,
  status TEXT DEFAULT 'pending',
  attempts INTEGER DEFAULT 0,
  error_message TEXT,
  android_device_id TEXT,
  sim_slot INTEGER,
  last_attempt_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. DELIVERY INSTRUCTIONS
CREATE TABLE public.delivery_instructions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
  instruction_type TEXT NOT NULL DEFAULT 'ussd',
  ussd_code TEXT,
  receiver_phone TEXT,
  provider_name TEXT,
  execution_order INTEGER DEFAULT 1,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 9. PENDING ONLINE PAYMENTS
CREATE TABLE public.pending_online_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  verified_phone TEXT,
  sender_phone TEXT NOT NULL,
  receiver_phone TEXT NOT NULL,
  provider_id UUID REFERENCES public.providers_config(id),
  package_id UUID REFERENCES public.data_packages_config(id),
  payment_provider TEXT,
  expected_amount NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  matched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 10. PAYMENT RECEIPTS
CREATE TABLE public.payment_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_phone TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  receiver_sim TEXT,
  sms_body TEXT,
  tx_id TEXT,
  status TEXT DEFAULT 'unmatched',
  matched_order_id UUID REFERENCES public.orders(id),
  matching_strategy TEXT,
  admin_notes TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 11. OFFLINE REGISTRATIONS
CREATE TABLE public.offline_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_phone TEXT NOT NULL,
  receiver_phone TEXT NOT NULL,
  provider_id TEXT,
  provider_name TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 12. VERIFIED PHONES
CREATE TABLE public.verified_phones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number TEXT NOT NULL UNIQUE,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 13. BLOCKED USERS
CREATE TABLE public.blocked_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number TEXT NOT NULL UNIQUE,
  reason TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  blocked_by UUID,
  unblocked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 14. ANDROID DEVICES
CREATE TABLE public.android_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL UNIQUE,
  device_name TEXT NOT NULL,
  sim_number TEXT NOT NULL,
  sim2_number TEXT,
  provider_name TEXT NOT NULL,
  sim1_provider TEXT,
  sim2_provider TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  total_deliveries INTEGER DEFAULT 0,
  failed_deliveries INTEGER DEFAULT 0,
  last_ping_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 15. SIM BALANCES
CREATE TABLE public.sim_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL,
  sim_slot INTEGER NOT NULL DEFAULT 1,
  balance NUMERIC NOT NULL DEFAULT 0,
  balance_type TEXT NOT NULL DEFAULT 'evc_plus',
  last_updated TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 16. DEVICE ALERTS
CREATE TABLE public.device_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL,
  alert_type TEXT NOT NULL,
  message TEXT,
  is_resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 17. NOTIFICATIONS
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 18. BANNERS CONFIG
CREATE TABLE public.banners_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  banner_image TEXT NOT NULL,
  alt_text TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  media_type TEXT DEFAULT 'image',
  video_duration INTEGER,
  rotation_interval INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 19. APP SETTINGS
CREATE TABLE public.app_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key TEXT NOT NULL UNIQUE,
  setting_value BOOLEAN,
  text_value TEXT,
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 20. AUDIT LOGS
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  user_email TEXT,
  action TEXT NOT NULL,
  table_name TEXT NOT NULL,
  record_id TEXT,
  old_data JSONB,
  new_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 21. FRAUD ALERTS
CREATE TABLE public.fraud_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_phone TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium',
  description TEXT,
  is_reviewed BOOLEAN NOT NULL DEFAULT false,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 22. USER ROLES
CREATE TYPE public.app_role AS ENUM ('admin', 'super_admin');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

-- 23. ADMIN PERMISSIONS
CREATE TABLE public.admin_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  permission_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, permission_key)
);

-- 24. AUTO TOPUP NUMBERS
CREATE TABLE public.auto_topup_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number TEXT NOT NULL,
  label TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 25. BULK SMS CAMPAIGNS
CREATE TABLE public.bulk_sms_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message TEXT NOT NULL,
  target_type TEXT NOT NULL DEFAULT 'all',
  total_recipients INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  device_id TEXT,
  sim_slot INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 26. BULK SMS QUEUE
CREATE TABLE public.bulk_sms_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES public.bulk_sms_campaigns(id) ON DELETE CASCADE NOT NULL,
  phone_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 27. PACKAGE DELIVERY RULES
CREATE TABLE public.package_delivery_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_package_id UUID REFERENCES public.data_packages_config(id) ON DELETE CASCADE NOT NULL,
  target_package_id UUID REFERENCES public.data_packages_config(id) ON DELETE CASCADE NOT NULL,
  delivery_count INTEGER NOT NULL DEFAULT 1,
  delay_minutes INTEGER NOT NULL DEFAULT 0,
  execution_order INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 28. CUSTOMER DISCOUNTS
CREATE TABLE public.customer_discounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number TEXT NOT NULL,
  discount_percent NUMERIC NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 29. ERROR MESSAGES
CREATE TABLE public.error_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  error_code TEXT NOT NULL UNIQUE,
  message_so TEXT,
  message_en TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================
-- ENABLE RLS ON ALL TABLES
-- =============================================
ALTER TABLE public.providers_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.package_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_packages_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.featured_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_providers_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_instructions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending_online_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offline_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verified_phones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.android_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sim_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.banners_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fraud_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auto_topup_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bulk_sms_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bulk_sms_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.package_delivery_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_discounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.error_messages ENABLE ROW LEVEL SECURITY;

-- =============================================
-- SECURITY DEFINER FUNCTION FOR ROLE CHECK
-- =============================================
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Helper: check if user is any admin
CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin', 'super_admin')
  )
$$;

-- =============================================
-- RLS POLICIES
-- =============================================

-- Public read tables (anon + authenticated)
CREATE POLICY "Anyone can read active providers" ON public.providers_config FOR SELECT USING (true);
CREATE POLICY "Anyone can read active categories" ON public.package_categories FOR SELECT USING (true);
CREATE POLICY "Anyone can read active packages" ON public.data_packages_config FOR SELECT USING (true);
CREATE POLICY "Anyone can read featured packages" ON public.featured_packages FOR SELECT USING (true);
CREATE POLICY "Anyone can read payment providers" ON public.payment_providers_config FOR SELECT USING (true);
CREATE POLICY "Anyone can read notifications" ON public.notifications FOR SELECT USING (is_active = true);
CREATE POLICY "Anyone can read banners" ON public.banners_config FOR SELECT USING (is_active = true);
CREATE POLICY "Anyone can read app settings" ON public.app_settings FOR SELECT USING (true);
CREATE POLICY "Anyone can read error messages" ON public.error_messages FOR SELECT USING (true);

-- Public insert tables (anon can create orders, registrations, etc.)
CREATE POLICY "Anyone can create orders" ON public.orders FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can read orders" ON public.orders FOR SELECT USING (true);
CREATE POLICY "Anyone can create offline registrations" ON public.offline_registrations FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can read offline registrations" ON public.offline_registrations FOR SELECT USING (true);
CREATE POLICY "Anyone can update offline registrations" ON public.offline_registrations FOR UPDATE USING (true);
CREATE POLICY "Anyone can create pending payments" ON public.pending_online_payments FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can read pending payments" ON public.pending_online_payments FOR SELECT USING (true);
CREATE POLICY "Anyone can create verified phones" ON public.verified_phones FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can read verified phones" ON public.verified_phones FOR SELECT USING (true);
CREATE POLICY "Anyone can read blocked users" ON public.blocked_users FOR SELECT USING (true);

-- Android device policies (anon access for device polling)
CREATE POLICY "Anyone can read devices" ON public.android_devices FOR SELECT USING (true);
CREATE POLICY "Anyone can update devices" ON public.android_devices FOR UPDATE USING (true);
CREATE POLICY "Anyone can insert devices" ON public.android_devices FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can read delivery queue" ON public.delivery_queue FOR SELECT USING (true);
CREATE POLICY "Anyone can update delivery queue" ON public.delivery_queue FOR UPDATE USING (true);
CREATE POLICY "Anyone can insert delivery queue" ON public.delivery_queue FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can read delivery instructions" ON public.delivery_instructions FOR SELECT USING (true);
CREATE POLICY "Anyone can read sim balances" ON public.sim_balances FOR SELECT USING (true);
CREATE POLICY "Anyone can insert sim balances" ON public.sim_balances FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update sim balances" ON public.sim_balances FOR UPDATE USING (true);
CREATE POLICY "Anyone can read device alerts" ON public.device_alerts FOR SELECT USING (true);
CREATE POLICY "Anyone can insert device alerts" ON public.device_alerts FOR INSERT WITH CHECK (true);

-- Payment receipts (anon access for edge function)
CREATE POLICY "Anyone can read payment receipts" ON public.payment_receipts FOR SELECT USING (true);
CREATE POLICY "Anyone can insert payment receipts" ON public.payment_receipts FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update payment receipts" ON public.payment_receipts FOR UPDATE USING (true);

-- Admin-only write tables
CREATE POLICY "Admins can manage providers" ON public.providers_config FOR ALL TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can manage categories" ON public.package_categories FOR ALL TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can manage packages" ON public.data_packages_config FOR ALL TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can manage featured" ON public.featured_packages FOR ALL TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can manage payment providers" ON public.payment_providers_config FOR ALL TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can manage orders" ON public.orders FOR ALL TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can manage notifications" ON public.notifications FOR ALL TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can manage banners" ON public.banners_config FOR ALL TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can manage settings" ON public.app_settings FOR ALL TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can manage blocked users" ON public.blocked_users FOR ALL TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can manage devices" ON public.android_devices FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

-- Audit logs
CREATE POLICY "Admins can read audit logs" ON public.audit_logs FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Anyone can insert audit logs" ON public.audit_logs FOR INSERT WITH CHECK (true);

-- Fraud alerts
CREATE POLICY "Admins can read fraud alerts" ON public.fraud_alerts FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can update fraud alerts" ON public.fraud_alerts FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Anyone can insert fraud alerts" ON public.fraud_alerts FOR INSERT WITH CHECK (true);

-- User roles & permissions
CREATE POLICY "Admins can read user roles" ON public.user_roles FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Super admins can manage roles" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Admins can read permissions" ON public.admin_permissions FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Super admins can manage permissions" ON public.admin_permissions FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));

-- Auto topup
CREATE POLICY "Admins can manage auto topup" ON public.auto_topup_numbers FOR ALL TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Anyone can read auto topup" ON public.auto_topup_numbers FOR SELECT USING (true);

-- Bulk SMS
CREATE POLICY "Admins can manage campaigns" ON public.bulk_sms_campaigns FOR ALL TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Anyone can read campaigns" ON public.bulk_sms_campaigns FOR SELECT USING (true);
CREATE POLICY "Admins can manage sms queue" ON public.bulk_sms_queue FOR ALL TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Anyone can read sms queue" ON public.bulk_sms_queue FOR SELECT USING (true);
CREATE POLICY "Anyone can update sms queue" ON public.bulk_sms_queue FOR UPDATE USING (true);

-- Delivery rules
CREATE POLICY "Admins can manage delivery rules" ON public.package_delivery_rules FOR ALL TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Anyone can read delivery rules" ON public.package_delivery_rules FOR SELECT USING (true);

-- Customer discounts
CREATE POLICY "Admins can manage discounts" ON public.customer_discounts FOR ALL TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Anyone can read discounts" ON public.customer_discounts FOR SELECT USING (true);

-- Error messages
CREATE POLICY "Admins can manage error messages" ON public.error_messages FOR ALL TO authenticated USING (public.is_admin(auth.uid()));

-- =============================================
-- ENABLE REALTIME
-- =============================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.delivery_queue;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.payment_receipts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.android_devices;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sim_balances;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bulk_sms_queue;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pending_online_payments;

-- =============================================
-- INDEXES
-- =============================================
CREATE INDEX idx_orders_customer_phone ON public.orders(customer_phone);
CREATE INDEX idx_orders_sender_phone ON public.orders(sender_phone);
CREATE INDEX idx_orders_status ON public.orders(status);
CREATE INDEX idx_orders_created_at ON public.orders(created_at DESC);
CREATE INDEX idx_delivery_queue_status ON public.delivery_queue(status);
CREATE INDEX idx_delivery_queue_order_id ON public.delivery_queue(order_id);
CREATE INDEX idx_payment_receipts_sender ON public.payment_receipts(sender_phone);
CREATE INDEX idx_payment_receipts_status ON public.payment_receipts(status);
CREATE INDEX idx_pending_payments_sender ON public.pending_online_payments(sender_phone);
CREATE INDEX idx_pending_payments_status ON public.pending_online_payments(status);
CREATE INDEX idx_offline_reg_sender ON public.offline_registrations(sender_phone);
CREATE INDEX idx_blocked_users_phone ON public.blocked_users(phone_number);

-- =============================================
-- RPC FUNCTIONS
-- =============================================

-- 1. get_active_providers
CREATE OR REPLACE FUNCTION public.get_active_providers()
RETURNS TABLE(id UUID, provider_name TEXT, provider_logo TEXT, is_active BOOLEAN, display_order INTEGER, evoucher_rate NUMERIC, promotional_text TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id, provider_name, provider_logo, is_active, display_order, evoucher_rate, promotional_text
  FROM providers_config
  WHERE is_active = true
  ORDER BY display_order ASC;
$$;

-- 2. get_active_categories
CREATE OR REPLACE FUNCTION public.get_active_categories(p_provider_id UUID)
RETURNS TABLE(id UUID, category_name TEXT, display_order INTEGER, is_active BOOLEAN, provider_id UUID, category_image TEXT, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id, category_name, display_order, is_active, provider_id, category_image, created_at, updated_at
  FROM package_categories
  WHERE is_active = true AND provider_id = p_provider_id
  ORDER BY display_order ASC;
$$;

-- 3. get_public_packages
CREATE OR REPLACE FUNCTION public.get_public_packages(p_provider_id UUID)
RETURNS TABLE(id UUID, package_name TEXT, data_amount TEXT, validity_days TEXT, selling_price NUMERIC, cost_price NUMERIC, is_active BOOLEAN, category_id UUID, provider_id UUID, connection_type_label TEXT, ussd_code TEXT, display_order INTEGER)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id, package_name, data_amount, validity_days, selling_price, cost_price, is_active, category_id, provider_id, connection_type_label, ussd_code, display_order
  FROM data_packages_config
  WHERE is_active = true AND provider_id = p_provider_id
  ORDER BY display_order ASC, selling_price ASC;
$$;

-- 4. get_featured_packages
CREATE OR REPLACE FUNCTION public.get_featured_packages()
RETURNS TABLE(id UUID, package_id UUID, package_name TEXT, data_amount TEXT, validity_days TEXT, selling_price NUMERIC, provider_name TEXT, provider_logo TEXT, provider_id UUID)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT fp.id, fp.package_id, dp.package_name, dp.data_amount, dp.validity_days, dp.selling_price, pc.provider_name, pc.provider_logo, dp.provider_id
  FROM featured_packages fp
  JOIN data_packages_config dp ON fp.package_id = dp.id
  JOIN providers_config pc ON dp.provider_id = pc.id
  WHERE fp.is_active = true AND dp.is_active = true
  ORDER BY fp.display_order ASC;
$$;

-- 5. get_active_payment_providers
CREATE OR REPLACE FUNCTION public.get_active_payment_providers()
RETURNS TABLE(id UUID, provider_name TEXT, provider_logo TEXT, commission_rate NUMERIC, is_active BOOLEAN, prefix_code TEXT, ussd_code_template TEXT, payment_number TEXT, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id, provider_name, provider_logo, commission_rate, is_active, prefix_code, ussd_code_template, payment_number, created_at, updated_at
  FROM payment_providers_config
  WHERE is_active = true
  ORDER BY display_order ASC;
$$;

-- 6. get_customer_order_history
CREATE OR REPLACE FUNCTION public.get_customer_order_history(customer_phone_number TEXT)
RETURNS TABLE(
  id UUID, customer_phone TEXT, sender_phone TEXT, receiver_phone TEXT,
  package_name TEXT, data_amount TEXT, selling_price NUMERIC,
  status TEXT, delivery_status TEXT, delivery_notes TEXT,
  created_at TIMESTAMPTZ, delivered_at TIMESTAMPTZ, invoice_url TEXT,
  provider_name TEXT, provider_logo TEXT, validity_days TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT o.id, o.customer_phone, o.sender_phone, o.receiver_phone,
    o.package_name, o.data_amount, o.selling_price,
    o.status, o.delivery_status, o.delivery_notes,
    o.created_at, o.delivered_at, o.invoice_url,
    pc.provider_name, pc.provider_logo,
    COALESCE(dp.validity_days, '30')
  FROM orders o
  LEFT JOIN providers_config pc ON o.provider_id = pc.id
  LEFT JOIN data_packages_config dp ON o.package_id = dp.id
  WHERE o.customer_phone = customer_phone_number
     OR o.sender_phone = customer_phone_number
  ORDER BY o.created_at DESC
  LIMIT 100;
$$;

-- 7. get_admin_analytics_summary
CREATE OR REPLACE FUNCTION public.get_admin_analytics_summary(
  p_period TEXT DEFAULT 'today',
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  result JSON;
  date_from TIMESTAMPTZ;
  date_to TIMESTAMPTZ;
BEGIN
  date_to := COALESCE(p_end_date, now());
  CASE p_period
    WHEN 'today' THEN date_from := date_trunc('day', now());
    WHEN 'week' THEN date_from := date_trunc('week', now());
    WHEN 'month' THEN date_from := date_trunc('month', now());
    WHEN 'year' THEN date_from := date_trunc('year', now());
    WHEN 'custom' THEN date_from := COALESCE(p_start_date, date_trunc('day', now()));
    ELSE date_from := '2000-01-01'::TIMESTAMPTZ;
  END CASE;

  SELECT json_build_object(
    'totalRevenue', COALESCE(SUM(selling_price), 0),
    'totalCost', COALESCE(SUM(cost_price), 0),
    'totalProfit', COALESCE(SUM(selling_price) - SUM(cost_price), 0),
    'totalOrders', COUNT(*),
    'deliveredOrders', COUNT(*) FILTER (WHERE delivery_status = 'delivered'),
    'pendingOrders', COUNT(*) FILTER (WHERE delivery_status = 'pending' OR delivery_status IS NULL),
    'failedOrders', COUNT(*) FILTER (WHERE delivery_status = 'failed')
  ) INTO result
  FROM orders
  WHERE created_at >= date_from AND created_at <= date_to;

  RETURN result;
END;
$$;

-- 8. get_admin_transactions_paginated
CREATE OR REPLACE FUNCTION public.get_admin_transactions_paginated(
  p_page INTEGER DEFAULT 0,
  p_page_size INTEGER DEFAULT 50,
  p_search TEXT DEFAULT '',
  p_status TEXT DEFAULT 'all',
  p_period TEXT DEFAULT 'today',
  p_provider_id TEXT DEFAULT 'all'
)
RETURNS JSON
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  result JSON;
  date_from TIMESTAMPTZ;
  query_offset INTEGER;
BEGIN
  query_offset := p_page * p_page_size;
  
  CASE p_period
    WHEN 'today' THEN date_from := date_trunc('day', now());
    WHEN 'week' THEN date_from := date_trunc('week', now());
    WHEN 'month' THEN date_from := date_trunc('month', now());
    WHEN 'year' THEN date_from := date_trunc('year', now());
    ELSE date_from := '2000-01-01'::TIMESTAMPTZ;
  END CASE;

  SELECT json_build_object(
    'transactions', COALESCE((
      SELECT json_agg(row_to_json(t))
      FROM (
        SELECT o.id, o.customer_phone, o.package_name, o.data_amount, o.selling_price,
          o.status, o.delivery_status, o.created_at, o.package_id, o.provider_id,
          o.cost_price, COALESCE(pc.evoucher_rate, 0) as evoucher_rate,
          o.sender_phone, o.receiver_phone, pc.provider_name
        FROM orders o
        LEFT JOIN providers_config pc ON o.provider_id = pc.id
        WHERE o.created_at >= date_from
          AND (p_status = 'all' OR o.delivery_status = p_status OR (p_status = 'pending' AND o.delivery_status IS NULL))
          AND (p_provider_id = 'all' OR o.provider_id::text = p_provider_id)
          AND (p_search = '' OR o.customer_phone ILIKE '%' || p_search || '%' OR o.sender_phone ILIKE '%' || p_search || '%' OR o.receiver_phone ILIKE '%' || p_search || '%')
        ORDER BY o.created_at DESC
        LIMIT p_page_size OFFSET query_offset
      ) t
    ), '[]'::json),
    'totalCount', (
      SELECT COUNT(*)
      FROM orders o
      WHERE o.created_at >= date_from
        AND (p_status = 'all' OR o.delivery_status = p_status OR (p_status = 'pending' AND o.delivery_status IS NULL))
        AND (p_provider_id = 'all' OR o.provider_id::text = p_provider_id)
        AND (p_search = '' OR o.customer_phone ILIKE '%' || p_search || '%' OR o.sender_phone ILIKE '%' || p_search || '%' OR o.receiver_phone ILIKE '%' || p_search || '%')
    )
  ) INTO result;

  RETURN result;
END;
$$;

-- 9. get_admin_transactions_summary
CREATE OR REPLACE FUNCTION public.get_admin_transactions_summary(
  p_period TEXT DEFAULT 'today',
  p_status TEXT DEFAULT 'all',
  p_provider_id TEXT DEFAULT 'all',
  p_search TEXT DEFAULT ''
)
RETURNS JSON
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  result JSON;
  date_from TIMESTAMPTZ;
BEGIN
  CASE p_period
    WHEN 'today' THEN date_from := date_trunc('day', now());
    WHEN 'week' THEN date_from := date_trunc('week', now());
    WHEN 'month' THEN date_from := date_trunc('month', now());
    WHEN 'year' THEN date_from := date_trunc('year', now());
    ELSE date_from := '2000-01-01'::TIMESTAMPTZ;
  END CASE;

  SELECT json_build_object(
    'totalSales', COALESCE(SUM(o.selling_price), 0),
    'totalProfit', COALESCE(SUM(o.selling_price - o.cost_price), 0),
    'totalCount', COUNT(*)
  ) INTO result
  FROM orders o
  WHERE o.created_at >= date_from
    AND (p_status = 'all' OR o.delivery_status = p_status OR (p_status = 'pending' AND o.delivery_status IS NULL))
    AND (p_provider_id = 'all' OR o.provider_id::text = p_provider_id)
    AND (p_search = '' OR o.customer_phone ILIKE '%' || p_search || '%' OR o.sender_phone ILIKE '%' || p_search || '%');

  RETURN result;
END;
$$;

-- 10. get_admin_date_range_breakdown
CREATE OR REPLACE FUNCTION public.get_admin_date_range_breakdown(
  p_start_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ
)
RETURNS JSON
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_agg(row_to_json(d))
  INTO result
  FROM (
    SELECT date_trunc('day', created_at)::date as date,
      COUNT(*) as orders,
      COALESCE(SUM(selling_price), 0) as revenue,
      COALESCE(SUM(cost_price), 0) as cost,
      COALESCE(SUM(selling_price - cost_price), 0) as profit
    FROM orders
    WHERE created_at >= p_start_date AND created_at <= p_end_date
    GROUP BY date_trunc('day', created_at)::date
    ORDER BY date
  ) d;

  RETURN COALESCE(result, '[]'::json);
END;
$$;

-- 11. get_admin_provider_daily_stats
CREATE OR REPLACE FUNCTION public.get_admin_provider_daily_stats(
  p_date DATE DEFAULT CURRENT_DATE
)
RETURNS JSON
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_agg(row_to_json(s))
  INTO result
  FROM (
    SELECT pc.id as provider_id, pc.provider_name, pc.provider_logo, pc.evoucher_rate,
      COUNT(o.id) as orders,
      COALESCE(SUM(o.selling_price), 0) as revenue,
      COALESCE(SUM(o.cost_price), 0) as cost,
      COALESCE(SUM(o.selling_price - o.cost_price), 0) as profit
    FROM providers_config pc
    LEFT JOIN orders o ON o.provider_id = pc.id
      AND o.created_at >= p_date::timestamptz
      AND o.created_at < (p_date + 1)::timestamptz
    WHERE pc.is_active = true
    GROUP BY pc.id, pc.provider_name, pc.provider_logo, pc.evoucher_rate
    ORDER BY pc.display_order
  ) s;

  RETURN COALESCE(result, '[]'::json);
END;
$$;

-- 12. claim_next_delivery
CREATE OR REPLACE FUNCTION public.claim_next_delivery(p_device_id TEXT)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  delivery_row delivery_queue%ROWTYPE;
  result JSON;
BEGIN
  SELECT * INTO delivery_row
  FROM delivery_queue
  WHERE status = 'pending'
    AND (android_device_id IS NULL OR android_device_id = p_device_id)
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  UPDATE delivery_queue
  SET status = 'processing',
      android_device_id = p_device_id,
      last_attempt_at = now(),
      attempts = COALESCE(attempts, 0) + 1
  WHERE id = delivery_row.id;

  SELECT row_to_json(d) INTO result
  FROM (
    SELECT dq.*, o.package_name, o.data_amount, o.customer_phone
    FROM delivery_queue dq
    LEFT JOIN orders o ON dq.order_id = o.id
    WHERE dq.id = delivery_row.id
  ) d;

  RETURN result;
END;
$$;

-- 13. check_fraud_rules
CREATE OR REPLACE FUNCTION public.check_fraud_rules(
  p_sender_phone TEXT,
  p_amount NUMERIC
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  result JSON;
  recent_count INTEGER;
  daily_total NUMERIC;
BEGIN
  -- Count recent orders (last 5 minutes)
  SELECT COUNT(*) INTO recent_count
  FROM orders
  WHERE sender_phone = p_sender_phone
    AND created_at >= now() - interval '5 minutes';

  -- Daily total
  SELECT COALESCE(SUM(selling_price), 0) INTO daily_total
  FROM orders
  WHERE sender_phone = p_sender_phone
    AND created_at >= date_trunc('day', now());

  result := json_build_object(
    'is_suspicious', (recent_count >= 3 OR daily_total > 100),
    'recent_count', recent_count,
    'daily_total', daily_total
  );

  -- Create alert if suspicious
  IF recent_count >= 3 THEN
    INSERT INTO fraud_alerts (sender_phone, amount, alert_type, severity, description)
    VALUES (p_sender_phone, p_amount, 'rapid_orders', 'high',
      format('5 daqiiqo gudahood %s dalabood - %s', recent_count, p_sender_phone));
  END IF;

  IF daily_total > 100 THEN
    INSERT INTO fraud_alerts (sender_phone, amount, alert_type, severity, description)
    VALUES (p_sender_phone, p_amount, 'high_daily_total', 'medium',
      format('Wadarta maalinta $%s - %s', daily_total, p_sender_phone));
  END IF;

  RETURN result;
END;
$$;

-- 14. is_phone_blocked
CREATE OR REPLACE FUNCTION public.is_phone_blocked(p_phone TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM blocked_users
    WHERE phone_number = p_phone AND is_active = true
  );
$$;

-- =============================================
-- SEED DATA: Default Providers
-- =============================================
INSERT INTO public.providers_config (provider_name, display_order, evoucher_rate) VALUES
  ('Hormuud', 1, 0.03),
  ('Somtel', 2, 0.03),
  ('Somnet', 3, 0.03),
  ('Amtel', 4, 0.03),
  ('Somlink', 5, 0.03);

-- Default Payment Provider
INSERT INTO public.payment_providers_config (provider_name, prefix_code, payment_number, display_order) VALUES
  ('EVC Plus', '61', '617195659', 1);

-- Default App Settings
INSERT INTO public.app_settings (setting_key, setting_value, description) VALUES
  ('maintenance_mode', false, 'Enable/disable maintenance mode'),
  ('allow_offline_orders', true, 'Allow offline order queuing');

INSERT INTO public.app_settings (setting_key, text_value, description) VALUES
  ('iftin_payment_number', '617195659', 'Lambarka lacag bixinta'),
  ('iftin_payment_prefix', '*712*', 'USSD prefix for payment');
