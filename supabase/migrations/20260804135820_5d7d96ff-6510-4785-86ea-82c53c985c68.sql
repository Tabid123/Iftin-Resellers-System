CREATE TABLE public.reseller_overrides (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('package','payment_provider')),
  ref_id text NOT NULL,
  sell_price numeric,
  base_price numeric,
  payment_number text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT reseller_overrides_unique UNIQUE (tenant_id, kind, ref_id),
  CONSTRAINT reseller_overrides_sell_price_nonneg CHECK (sell_price IS NULL OR sell_price >= 0)
);

GRANT SELECT ON public.reseller_overrides TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reseller_overrides TO authenticated;
GRANT ALL ON public.reseller_overrides TO service_role;

ALTER TABLE public.reseller_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Storefront can read tenant overrides"
ON public.reseller_overrides FOR SELECT
USING (tenant_id = public.effective_tenant_id() OR public.is_super_admin());

CREATE POLICY "Tenant members manage own overrides"
ON public.reseller_overrides FOR ALL
TO authenticated
USING (tenant_id = public.effective_tenant_id() OR public.is_super_admin())
WITH CHECK (tenant_id = public.effective_tenant_id() OR public.is_super_admin());

CREATE TRIGGER trg_reseller_overrides_set_tenant_id
BEFORE INSERT ON public.reseller_overrides
FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id_default();

CREATE TRIGGER trg_reseller_overrides_forbid_tenant_change
BEFORE UPDATE ON public.reseller_overrides
FOR EACH ROW EXECUTE FUNCTION public.forbid_tenant_id_change();

CREATE TRIGGER trg_reseller_overrides_updated
BEFORE UPDATE ON public.reseller_overrides
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.get_reseller_overrides()
RETURNS TABLE(kind text, ref_id text, sell_price numeric, base_price numeric, payment_number text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.kind, o.ref_id, o.sell_price, o.base_price, o.payment_number
  FROM public.reseller_overrides o
  WHERE o.tenant_id = public.current_request_tenant_id()
$$;

GRANT EXECUTE ON FUNCTION public.get_reseller_overrides() TO anon, authenticated, service_role;