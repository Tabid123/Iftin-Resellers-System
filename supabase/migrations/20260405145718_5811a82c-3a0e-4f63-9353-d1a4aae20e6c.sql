
-- 1. Audit Logs table
CREATE TABLE public.audit_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid,
  user_email text,
  action text NOT NULL,
  table_name text NOT NULL,
  record_id text,
  old_data jsonb,
  new_data jsonb,
  ip_address text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can view audit logs"
  ON public.audit_logs FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "System can insert audit logs"
  ON public.audit_logs FOR INSERT
  WITH CHECK (true);

CREATE INDEX idx_audit_logs_table ON public.audit_logs(table_name);
CREATE INDEX idx_audit_logs_created ON public.audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_user ON public.audit_logs(user_id);

-- 2. Admin Permissions table
CREATE TABLE public.admin_permissions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  permission_key text NOT NULL,
  granted_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, permission_key)
);

ALTER TABLE public.admin_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all permissions"
  ON public.admin_permissions FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage permissions"
  ON public.admin_permissions FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- 3. Fraud Alerts table
CREATE TABLE public.fraud_alerts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  payment_receipt_id uuid REFERENCES public.payment_receipts(id),
  sender_phone text NOT NULL,
  amount numeric NOT NULL,
  alert_type text NOT NULL,
  severity text NOT NULL DEFAULT 'medium',
  description text,
  is_reviewed boolean NOT NULL DEFAULT false,
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.fraud_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can view fraud alerts"
  ON public.fraud_alerts FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admins can manage fraud alerts"
  ON public.fraud_alerts FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "System can insert fraud alerts"
  ON public.fraud_alerts FOR INSERT
  WITH CHECK (true);

CREATE INDEX idx_fraud_alerts_reviewed ON public.fraud_alerts(is_reviewed);
CREATE INDEX idx_fraud_alerts_created ON public.fraud_alerts(created_at DESC);

-- 4. Audit log trigger function
CREATE OR REPLACE FUNCTION public.audit_log_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (action, table_name, record_id, new_data)
    VALUES ('create', TG_TABLE_NAME, NEW.id::text, to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_logs (action, table_name, record_id, old_data, new_data)
    VALUES ('update', TG_TABLE_NAME, NEW.id::text, to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_logs (action, table_name, record_id, old_data)
    VALUES ('delete', TG_TABLE_NAME, OLD.id::text, to_jsonb(OLD));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

-- 5. Attach triggers to critical tables
CREATE TRIGGER audit_orders
  AFTER INSERT OR UPDATE OR DELETE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();

CREATE TRIGGER audit_data_packages
  AFTER INSERT OR UPDATE OR DELETE ON public.data_packages_config
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();

CREATE TRIGGER audit_app_settings
  AFTER INSERT OR UPDATE OR DELETE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();

CREATE TRIGGER audit_auto_topup
  AFTER INSERT OR UPDATE OR DELETE ON public.auto_topup_numbers
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();

CREATE TRIGGER audit_blocked_users
  AFTER INSERT OR UPDATE OR DELETE ON public.blocked_users
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();

CREATE TRIGGER audit_providers
  AFTER INSERT OR UPDATE OR DELETE ON public.providers_config
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();

-- 6. Fraud detection function (used by process-payment-receipt)
CREATE OR REPLACE FUNCTION public.check_fraud_rules(
  p_sender_phone text,
  p_amount numeric,
  p_receipt_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recent_count integer;
  v_duplicate_count integer;
BEGIN
  -- Rule 1: High amount (>$50)
  IF p_amount > 50 THEN
    INSERT INTO public.fraud_alerts (payment_receipt_id, sender_phone, amount, alert_type, severity, description)
    VALUES (p_receipt_id, p_sender_phone, p_amount, 'high_amount', 'high', 
      'Lacag aad u badan: $' || p_amount::text);
  END IF;

  -- Rule 2: High frequency (5+ in 1 hour)
  SELECT count(*) INTO v_recent_count
  FROM public.payment_receipts
  WHERE sender_phone = p_sender_phone
    AND created_at > now() - interval '1 hour';

  IF v_recent_count >= 5 THEN
    INSERT INTO public.fraud_alerts (payment_receipt_id, sender_phone, amount, alert_type, severity, description)
    VALUES (p_receipt_id, p_sender_phone, p_amount, 'high_frequency', 'high',
      'Inta badan: ' || v_recent_count::text || ' lacag 1 saac gudaheeda');
  END IF;

  -- Rule 3: Duplicate amount from same sender in 10 min
  SELECT count(*) INTO v_duplicate_count
  FROM public.payment_receipts
  WHERE sender_phone = p_sender_phone
    AND amount = p_amount
    AND created_at > now() - interval '10 minutes'
    AND id != p_receipt_id;

  IF v_duplicate_count > 0 THEN
    INSERT INTO public.fraud_alerts (payment_receipt_id, sender_phone, amount, alert_type, severity, description)
    VALUES (p_receipt_id, p_sender_phone, p_amount, 'duplicate_payment', 'medium',
      'Lacag la mid ah ($' || p_amount::text || ') 10 daqiiqo gudahooda');
  END IF;
END;
$$;
