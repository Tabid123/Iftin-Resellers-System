CREATE TABLE IF NOT EXISTS public.sim_pins (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider_name text NOT NULL,
  pin text NOT NULL DEFAULT '',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS sim_pins_tenant_provider_idx
  ON public.sim_pins (tenant_id, lower(provider_name));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sim_pins TO authenticated;
GRANT ALL ON public.sim_pins TO service_role;

ALTER TABLE public.sim_pins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON public.sim_pins;
CREATE POLICY tenant_isolation ON public.sim_pins
  FOR ALL
  USING ((tenant_id = effective_tenant_id()) OR is_super_admin())
  WITH CHECK ((tenant_id = effective_tenant_id()) OR is_super_admin());

DROP TRIGGER IF EXISTS sim_pins_set_tenant_id ON public.sim_pins;
CREATE TRIGGER sim_pins_set_tenant_id
  BEFORE INSERT ON public.sim_pins
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id_default();

DROP TRIGGER IF EXISTS sim_pins_updated_at ON public.sim_pins;
CREATE TRIGGER sim_pins_updated_at
  BEFORE UPDATE ON public.sim_pins
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Save a company PIN and cascade it into every USSD code of that company.
CREATE OR REPLACE FUNCTION public.set_sim_pin(_provider_name text, _pin text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t uuid;
  updated_codes integer := 0;
  updated_topups integer := 0;
BEGIN
  t := effective_tenant_id();
  IF t IS NULL THEN
    RAISE EXCEPTION 'tenant lama helin';
  END IF;

  INSERT INTO public.sim_pins (tenant_id, provider_name, pin)
  VALUES (t, btrim(_provider_name), coalesce(btrim(_pin), ''))
  ON CONFLICT (tenant_id, lower(provider_name))
  DO UPDATE SET pin = EXCLUDED.pin, updated_at = now();

  UPDATE public.delivery_instructions di
     SET sim_password = coalesce(btrim(_pin), '')
   WHERE di.tenant_id = t
     AND di.provider_id IN (
       SELECT pc.id FROM public.providers_config pc
        WHERE pc.tenant_id = t
          AND lower(pc.provider_name) = lower(btrim(_provider_name))
     );
  GET DIAGNOSTICS updated_codes = ROW_COUNT;

  UPDATE public.auto_topup_packages ap
     SET sim_password = coalesce(btrim(_pin), '')
   WHERE ap.tenant_id = t
     AND lower(ap.provider_name) = lower(btrim(_provider_name));
  GET DIAGNOSTICS updated_topups = ROW_COUNT;

  RETURN jsonb_build_object('updated_codes', updated_codes, 'updated_topups', updated_topups);
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_sim_pin(text, text) TO authenticated;

-- New/edited USSD codes inherit the company PIN when none is supplied.
CREATE OR REPLACE FUNCTION public.delivery_instructions_fill_sim_pin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p text;
BEGIN
  IF NEW.sim_password IS NULL OR btrim(NEW.sim_password) = '' THEN
    SELECT sp.pin INTO p
      FROM public.sim_pins sp
      JOIN public.providers_config pc
        ON pc.tenant_id = sp.tenant_id
       AND lower(pc.provider_name) = lower(sp.provider_name)
     WHERE sp.tenant_id = NEW.tenant_id
       AND pc.id = NEW.provider_id
     LIMIT 1;
    IF p IS NOT NULL AND btrim(p) <> '' THEN
      NEW.sim_password := p;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS delivery_instructions_fill_sim_pin ON public.delivery_instructions;
CREATE TRIGGER delivery_instructions_fill_sim_pin
  BEFORE INSERT OR UPDATE ON public.delivery_instructions
  FOR EACH ROW EXECUTE FUNCTION public.delivery_instructions_fill_sim_pin();