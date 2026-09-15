-- Follow-up hardening for the tenant-aware *212* discovery port.
-- Scope queue-pressure checks to the Android device's tenant and return the
-- correct SIM slot for the discovered package provider.

DROP FUNCTION IF EXISTS public.discovery_has_waiting_request();

CREATE OR REPLACE FUNCTION public.discovery_has_waiting_request(p_device_id text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant uuid;
BEGIN
  SELECT tenant_id INTO v_tenant
  FROM public.android_devices
  WHERE device_id = p_device_id AND is_active = true AND archived_at IS NULL
  LIMIT 1;

  IF v_tenant IS NULL THEN RETURN false; END IF;

  RETURN EXISTS(
    SELECT 1 FROM public.ussd_package_discoveries
    WHERE tenant_id = v_tenant
      AND status = 'pending'
      AND queued_at >= now() - interval '5 minutes'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_next_discovery(p_device_id text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant uuid;
  v_sim1 text;
  v_sim2 text;
  v_row public.ussd_package_discoveries%ROWTYPE;
  v_root_name text;
  v_provider_name text;
  v_sim_slot int := 0;
BEGIN
  SELECT d.tenant_id, lower(coalesce(d.sim1_provider,'')), lower(coalesce(d.sim2_provider,''))
  INTO v_tenant, v_sim1, v_sim2
  FROM public.android_devices d
  WHERE d.device_id = p_device_id AND d.is_active = true AND d.archived_at IS NULL
  LIMIT 1;

  IF v_tenant IS NULL THEN RETURN NULL; END IF;

  UPDATE public.ussd_package_discoveries
  SET status='failed', error='timeout', completed_at=now(), updated_at=now()
  WHERE tenant_id=v_tenant AND status='processing' AND claimed_at < now()-interval '90 seconds';

  UPDATE public.ussd_package_discoveries
  SET status='failed', error='no_device_available', completed_at=now(), updated_at=now()
  WHERE tenant_id=v_tenant AND status='pending' AND queued_at < now()-interval '5 minutes';

  SELECT dsc.* INTO v_row
  FROM public.ussd_package_discoveries dsc
  JOIN public.data_packages_config pkg ON pkg.id=dsc.root_package_id AND pkg.tenant_id=dsc.tenant_id
  JOIN public.providers_config prov ON prov.id=pkg.provider_id AND prov.tenant_id=dsc.tenant_id
  WHERE dsc.tenant_id=v_tenant AND dsc.status='pending'
    AND dsc.queued_at >= now()-interval '5 minutes'
    AND (
      (v_sim1='' AND v_sim2='') OR
      lower(prov.provider_name)=v_sim1 OR
      lower(prov.provider_name)=v_sim2
    )
  ORDER BY dsc.queued_at ASC
  LIMIT 1 FOR UPDATE OF dsc SKIP LOCKED;

  IF NOT FOUND THEN RETURN NULL; END IF;

  UPDATE public.ussd_package_discoveries
  SET status='processing', device_id=p_device_id, claimed_at=now(), updated_at=now()
  WHERE id=v_row.id AND tenant_id=v_tenant;

  SELECT pkg.package_name, lower(prov.provider_name)
  INTO v_root_name, v_provider_name
  FROM public.data_packages_config pkg
  JOIN public.providers_config prov ON prov.id=pkg.provider_id AND prov.tenant_id=pkg.tenant_id
  WHERE pkg.id=v_row.root_package_id AND pkg.tenant_id=v_tenant;

  v_sim_slot := CASE
    WHEN v_provider_name <> '' AND v_provider_name = v_sim2 AND v_provider_name <> v_sim1 THEN 1
    ELSE 0
  END;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'phone_number', v_row.phone_number,
    'menu1_label', coalesce(v_root_name,''),
    'ussd_code', '*212*' || v_row.phone_number || '#',
    'sim_slot', v_sim_slot
  );
END;
$$;

REVOKE ALL ON FUNCTION public.discovery_has_waiting_request(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.discovery_has_waiting_request(text) TO anon, authenticated, service_role;
