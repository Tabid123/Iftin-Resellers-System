
-- =============================================
-- 1. BLOCKED USERS TABLE
-- =============================================
CREATE TABLE public.blocked_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number text NOT NULL UNIQUE,
  reason text,
  blocked_by uuid,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  unblocked_at timestamptz
);

ALTER TABLE public.blocked_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can view blocked users"
  ON public.blocked_users FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins can manage blocked users"
  ON public.blocked_users FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- =============================================
-- 2. is_phone_blocked RPC
-- =============================================
CREATE OR REPLACE FUNCTION public.is_phone_blocked(p_phone text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.blocked_users
    WHERE phone_number = p_phone AND is_active = true
  );
$$;

-- =============================================
-- 3. BULK SMS CAMPAIGNS TABLE
-- =============================================
CREATE TABLE public.bulk_sms_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message text NOT NULL,
  target_type text NOT NULL DEFAULT 'all',
  target_filter jsonb,
  device_id text,
  sim_slot integer DEFAULT 1,
  total_recipients integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bulk_sms_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can view bulk sms campaigns"
  ON public.bulk_sms_campaigns FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins can manage bulk sms campaigns"
  ON public.bulk_sms_campaigns FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- =============================================
-- 4. BULK SMS QUEUE TABLE
-- =============================================
CREATE TABLE public.bulk_sms_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.bulk_sms_campaigns(id) ON DELETE CASCADE,
  phone_number text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  device_id text,
  sim_slot integer DEFAULT 1,
  sent_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bulk_sms_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can view bulk sms queue"
  ON public.bulk_sms_queue FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins can manage bulk sms queue"
  ON public.bulk_sms_queue FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Index for Android device polling
CREATE INDEX idx_bulk_sms_queue_pending ON public.bulk_sms_queue(status, device_id) WHERE status = 'pending';
