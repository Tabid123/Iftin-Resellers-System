-- Ensure the client-facing one-argument release wrapper expires displayed
-- discovery results but never cancels an in-flight search by itself.
CREATE OR REPLACE FUNCTION public.release_discovery_session(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
  v_status text;
BEGIN
  v_tenant := public.request_header_tenant_id();
  IF v_tenant IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Tenant context missing');
  END IF;

  SELECT status INTO v_status
  FROM public.ussd_package_discoveries
  WHERE id = p_id AND tenant_id = v_tenant;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Codsi lama helin');
  END IF;

  -- Riyokaab semantics: closing while still searching does NOT cancel the job.
  IF v_status IN ('pending','processing') THEN
    RETURN jsonb_build_object('success', true, 'released', false, 'still_running', true);
  END IF;

  UPDATE public.ussd_package_discoveries
  SET expires_at = now(),
      session_state = 'closed',
      session_expires_at = NULL,
      session_device_id = NULL,
      session_note = 'released_by_user',
      updated_at = now()
  WHERE id = p_id
    AND tenant_id = v_tenant;

  RETURN jsonb_build_object('success', FOUND, 'released', FOUND);
END;
$$;
