
CREATE OR REPLACE FUNCTION public.update_tenant_branding(
  p_primary_color text,
  p_accent_color text,
  p_logo_url text
) RETURNS public.tenants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_row public.tenants;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  v_tenant_id := public.current_tenant_id();

  IF v_tenant_id IS NULL AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'no tenant for current user';
  END IF;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant id required';
  END IF;

  UPDATE public.tenants
  SET primary_color = COALESCE(p_primary_color, primary_color),
      accent_color  = COALESCE(p_accent_color, accent_color),
      logo_url      = COALESCE(p_logo_url, logo_url),
      updated_at    = now()
  WHERE id = v_tenant_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_tenant_branding(text, text, text) TO authenticated;
