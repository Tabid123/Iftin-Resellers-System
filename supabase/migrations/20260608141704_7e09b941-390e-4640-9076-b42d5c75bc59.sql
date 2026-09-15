DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'super_admin' AND enumtypid = 'public.app_role'::regtype
  ) THEN
    ALTER TYPE public.app_role ADD VALUE 'super_admin';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  price_monthly numeric NOT NULL DEFAULT 0,
  max_devices integer NOT NULL DEFAULT 1,
  max_orders_monthly integer NOT NULL DEFAULT 500,
  max_admins integer NOT NULL DEFAULT 2,
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.subscription_plans TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscription_plans TO authenticated;
GRANT ALL ON public.subscription_plans TO service_role;
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "plans public read" ON public.subscription_plans;
DROP POLICY IF EXISTS "plans super_admin write" ON public.subscription_plans;
CREATE POLICY "plans public read" ON public.subscription_plans FOR SELECT USING (true);
CREATE POLICY "plans super_admin write" ON public.subscription_plans FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));

CREATE TABLE IF NOT EXISTS public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  logo_url text,
  primary_color text DEFAULT '#3D0066',
  status text NOT NULL DEFAULT 'trial',
  plan_id uuid REFERENCES public.subscription_plans(id),
  current_period_end timestamptz,
  trial_ends_at timestamptz,
  owner_user_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tenants_slug ON public.tenants(slug);
GRANT SELECT ON public.tenants TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenants TO authenticated;
GRANT ALL ON public.tenants TO service_role;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenants public read" ON public.tenants;
DROP POLICY IF EXISTS "tenants super_admin write" ON public.tenants;
CREATE POLICY "tenants public read" ON public.tenants FOR SELECT USING (true);
CREATE POLICY "tenants super_admin write" ON public.tenants FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));

CREATE TABLE IF NOT EXISTS public.tenant_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'admin',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_members TO authenticated;
GRANT ALL ON public.tenant_members TO service_role;
ALTER TABLE public.tenant_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "members self read" ON public.tenant_members;
DROP POLICY IF EXISTS "members super_admin write" ON public.tenant_members;
CREATE POLICY "members self read" ON public.tenant_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "members super_admin write" ON public.tenant_members FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));

CREATE TABLE IF NOT EXISTS public.tenant_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES public.subscription_plans(id),
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  payment_method text,
  paid_at timestamptz,
  recorded_by uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_subscriptions TO authenticated;
GRANT ALL ON public.tenant_subscriptions TO service_role;
ALTER TABLE public.tenant_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "subs super_admin all" ON public.tenant_subscriptions;
CREATE POLICY "subs super_admin all" ON public.tenant_subscriptions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));

CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid() LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_plans_updated ON public.subscription_plans;
CREATE TRIGGER trg_plans_updated BEFORE UPDATE ON public.subscription_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_tenants_updated ON public.tenants;
CREATE TRIGGER trg_tenants_updated BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.subscription_plans (name, price_monthly, max_devices, max_orders_monthly, max_admins, features, display_order)
SELECT * FROM (VALUES
  ('Starter'::text, 19::numeric, 1::integer, 500::integer, 2::integer, '["1 Android device","500 orders/month","2 admins","Email support"]'::jsonb, 1::integer),
  ('Business'::text, 49::numeric, 5::integer, 5000::integer, 10::integer, '["5 Android devices","5,000 orders/month","10 admins","Priority support","Custom branding"]'::jsonb, 2::integer),
  ('Enterprise'::text, 149::numeric, 999::integer, 999999::integer, 999::integer, '["Unlimited devices","Unlimited orders","Unlimited admins","24/7 support","Custom domain","API access"]'::jsonb, 3::integer)
) AS seed(name, price_monthly, max_devices, max_orders_monthly, max_admins, features, display_order)
WHERE NOT EXISTS (SELECT 1 FROM public.subscription_plans WHERE subscription_plans.name = seed.name);