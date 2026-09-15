CREATE TABLE public.iftin_partner_credentials (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
  api_key text NOT NULL,
  callback_secret text,
  is_active boolean NOT NULL DEFAULT true,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.iftin_partner_credentials TO service_role;

ALTER TABLE public.iftin_partner_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role only" ON public.iftin_partner_credentials
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER trg_iftin_partner_credentials_updated
  BEFORE UPDATE ON public.iftin_partner_credentials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TABLE IF EXISTS public.partner_api_keys CASCADE;