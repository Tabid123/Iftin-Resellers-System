-- Harden client-facing *212* discovery RPCs.
-- Public clients no longer pass an arbitrary tenant_id. The safe overloads below
-- derive tenant identity from the x-tenant-id request header used by the existing
-- Supabase client. Explicit-tenant variants remain service-role only.

CREATE OR REPLACE FUNCTION public.request_header_tenant_id()
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_headers jsonb;
  v_value text;
BEGIN
  BEGIN
    v_headers := current_setting('request.headers', true)::jsonb;
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;
  v_value := nullif(btrim(v_headers->>'x-tenant-id'), '');
  IF v_value IS NULL THEN RETURN NULL; END IF;
  BEGIN
    RETURN v_value::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN NULL;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.request_package_discovery(
  p_root_package_id uuid,
  p_phone text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant uuid;
BEGIN
  v_tenant := public.request_header_tenant_id();
  IF v_tenant IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Tenant context missing');
  END IF;
  RETURN public.request_package_discovery(v_tenant, p_root_package_id, p_phone);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_package_discovery(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant uuid;
BEGIN
  v_tenant := public.request_header_tenant_id();
  IF v_tenant IS NULL THEN RETURN jsonb_build_object('success',false,'message','Tenant context missing'); END IF;
  RETURN public.get_package_discovery(v_tenant, p_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_discovery_queue_status(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant uuid;
BEGIN
  v_tenant := public.request_header_tenant_id();
  IF v_tenant IS NULL THEN RETURN jsonb_build_object('found',false,'message','Tenant context missing'); END IF;
  RETURN public.get_discovery_queue_status(v_tenant, p_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_discovery_selection(
  p_discovery_id uuid,
  p_order_id uuid,
  p_label text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant uuid;
BEGIN
  v_tenant := public.request_header_tenant_id();
  IF v_tenant IS NULL THEN RETURN jsonb_build_object('success',false,'message','Tenant context missing'); END IF;
  RETURN public.enqueue_discovery_selection(v_tenant, p_discovery_id, p_order_id, p_label);
END;
$$;

CREATE OR REPLACE FUNCTION public.release_discovery_session(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant uuid;
BEGIN
  v_tenant := public.request_header_tenant_id();
  IF v_tenant IS NULL THEN RETURN jsonb_build_object('success',false,'message','Tenant context missing'); END IF;
  RETURN public.release_discovery_session(v_tenant, p_id);
END;
$$;

-- Explicit tenant-id signatures are internal/service-role only.
REVOKE EXECUTE ON FUNCTION public.request_package_discovery(uuid,uuid,text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_package_discovery(uuid,uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_discovery_queue_status(uuid,uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_discovery_selection(uuid,uuid,uuid,text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.release_discovery_session(uuid,uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_package_discovery(uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_package_discovery(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_discovery_queue_status(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_discovery_selection(uuid,uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_discovery_session(uuid,uuid) TO service_role;

-- Header-bound overloads are the only client-facing forms.
REVOKE ALL ON FUNCTION public.request_package_discovery(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_package_discovery(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_discovery_queue_status(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enqueue_discovery_selection(uuid,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_discovery_session(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_package_discovery(uuid,text) TO anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_package_discovery(uuid) TO anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_discovery_queue_status(uuid) TO anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_discovery_selection(uuid,uuid,text) TO anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.release_discovery_session(uuid) TO anon,authenticated,service_role;
