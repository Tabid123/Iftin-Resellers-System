-- Bind Android *212* mutation RPCs to the active device that claimed the discovery/session.
-- The legacy UUID-only signatures remain available to service_role for trusted backend work,
-- but are no longer executable by anon/authenticated clients.

CREATE OR REPLACE FUNCTION public.complete_discovery(
  p_device_id text,
  p_id uuid,
  p_raw_menu text,
  p_items jsonb DEFAULT '[]'::jsonb,
  p_error text DEFAULT NULL,
  p_hold boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant uuid;
BEGIN
  SELECT tenant_id INTO v_tenant
  FROM public.android_devices
  WHERE device_id=p_device_id AND is_active=true AND archived_at IS NULL
  LIMIT 1;
  IF v_tenant IS NULL THEN RETURN jsonb_build_object('success',false,'message','device_not_authorized'); END IF;

  UPDATE public.ussd_package_discoveries d
  SET raw_menu=p_raw_menu,
      items=coalesce(p_items,'[]'::jsonb),
      error=p_error,
      status=CASE WHEN p_error IS NULL THEN 'done' ELSE 'failed' END,
      completed_at=now(),
      expires_at=CASE WHEN p_error IS NULL THEN now()+interval '30 minutes' ELSE NULL END,
      session_state=CASE WHEN p_error IS NULL AND p_hold THEN 'open' ELSE 'closed' END,
      session_device_id=CASE WHEN p_error IS NULL AND p_hold THEN p_device_id ELSE NULL END,
      session_expires_at=CASE WHEN p_error IS NULL AND p_hold THEN now()+interval '8 minutes' ELSE NULL END,
      updated_at=now()
  WHERE d.id=p_id AND d.tenant_id=v_tenant AND d.device_id=p_device_id AND d.status='processing';

  RETURN jsonb_build_object('success',FOUND);
END;
$$;

CREATE OR REPLACE FUNCTION public.discovery_session_lost(p_device_id text,p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant uuid;
  v_row public.ussd_package_discoveries%ROWTYPE;
BEGIN
  SELECT tenant_id INTO v_tenant
  FROM public.android_devices
  WHERE device_id=p_device_id AND is_active=true AND archived_at IS NULL
  LIMIT 1;
  IF v_tenant IS NULL THEN RETURN jsonb_build_object('success',false,'message','device_not_authorized'); END IF;

  SELECT * INTO v_row FROM public.ussd_package_discoveries
  WHERE id=p_id AND tenant_id=v_tenant
    AND (session_device_id=p_device_id OR (session_device_id IS NULL AND device_id=p_device_id));
  IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'message','session_not_owned_by_device'); END IF;
  IF v_row.session_state IN ('selected','delivering') THEN
    RETURN jsonb_build_object('success',true,'skipped',true);
  END IF;

  UPDATE public.ussd_package_discoveries
  SET session_state='lost',session_expires_at=NULL,updated_at=now()
  WHERE id=p_id AND tenant_id=v_tenant;
  PERFORM public.discovery_delivery_fallback(p_id);
  RETURN jsonb_build_object('success',true);
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_discovery_selection(
  p_device_id text,
  p_id uuid,
  p_success boolean,
  p_response text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant uuid;
  v_row public.ussd_package_discoveries%ROWTYPE;
BEGIN
  SELECT tenant_id INTO v_tenant
  FROM public.android_devices
  WHERE device_id=p_device_id AND is_active=true AND archived_at IS NULL
  LIMIT 1;
  IF v_tenant IS NULL THEN RETURN jsonb_build_object('success',false,'message','device_not_authorized'); END IF;

  SELECT * INTO v_row FROM public.ussd_package_discoveries
  WHERE id=p_id AND tenant_id=v_tenant AND session_device_id=p_device_id AND session_state='delivering';
  IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'message','selection_not_owned_by_device'); END IF;

  UPDATE public.ussd_package_discoveries
  SET session_state=CASE WHEN p_success THEN 'consumed' ELSE 'lost' END,
      session_expires_at=NULL,
      session_note=p_response,
      updated_at=now()
  WHERE id=p_id AND tenant_id=v_tenant AND session_device_id=p_device_id;

  IF v_row.selected_order_id IS NOT NULL THEN
    IF p_success THEN
      UPDATE public.orders
      SET delivery_status='delivered',delivered_at=now(),delivery_notes=coalesce(p_response,'*212* session delivered')
      WHERE id=v_row.selected_order_id AND tenant_id=v_row.tenant_id;
    ELSE
      PERFORM public.discovery_delivery_fallback(p_id);
    END IF;
  END IF;
  RETURN jsonb_build_object('success',true);
END;
$$;

-- Remove direct anonymous access to mutation signatures that do not prove device ownership.
REVOKE EXECUTE ON FUNCTION public.complete_discovery(uuid,text,jsonb,text,boolean) FROM anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.discovery_session_lost(uuid) FROM anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.complete_discovery_selection(uuid,boolean,text) FROM anon,authenticated;

-- Android delivery agent uses these device-bound signatures with the public anon key.
REVOKE ALL ON FUNCTION public.complete_discovery(text,uuid,text,jsonb,text,boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.discovery_session_lost(text,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_discovery_selection(text,uuid,boolean,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_discovery(text,uuid,text,jsonb,text,boolean) TO anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.discovery_session_lost(text,uuid) TO anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.complete_discovery_selection(text,uuid,boolean,text) TO anon,authenticated,service_role;
