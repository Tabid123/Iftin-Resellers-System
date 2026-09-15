-- Small tenant-scoped helper used by the storefront to identify packages that
-- launch live *212* discovery rather than normal checkout.
CREATE OR REPLACE FUNCTION public.get_discovery_root_ids(p_provider_id uuid)
RETURNS TABLE(package_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant uuid;
BEGIN
  v_tenant := public.request_header_tenant_id();
  IF v_tenant IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT p.id
  FROM public.data_packages_config p
  WHERE p.tenant_id = v_tenant
    AND p.provider_id = p_provider_id
    AND p.is_active = true
    AND p.is_discovery_root = true;
END;
$$;

REVOKE ALL ON FUNCTION public.get_discovery_root_ids(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_discovery_root_ids(uuid) TO anon,authenticated,service_role;
