-- Match Riyokaab *212* discovery reopen behavior.
-- Completed results are never reused. An in-flight pending/processing request may
-- continue and be reused if the user merely closes the searching UI.
-- Leaving an already displayed result releases the carrier session and expires
-- that result, so the next visit performs a new carrier search.

CREATE OR REPLACE FUNCTION public.request_package_discovery(
  p_tenant_id uuid,
  p_root_package_id uuid,
  p_phone text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone text;
  v_row public.ussd_package_discoveries%ROWTYPE;
  v_id uuid;
BEGIN
  v_phone := regexp_replace(coalesce(p_phone,''), '\D', '', 'g');
  IF length(v_phone) = 12 AND left(v_phone,3) = '252' THEN
    v_phone := substring(v_phone from 4);
  END IF;
  IF length(v_phone) = 10 AND left(v_phone,1) = '0' THEN
    v_phone := substring(v_phone from 2);
  END IF;

  IF length(v_phone) <> 9 THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Fadlan gali lambarka oo dhan (9 lambar)'
    );
  END IF;

  IF NOT public.is_212_discovery_root(p_tenant_id, p_root_package_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Xulasho discovery ah lama helin'
    );
  END IF;

  -- Do NOT reuse any completed result. A new visit after results were shown
  -- must always search the live carrier menu again.
  -- Only reuse a still-running request, matching Riyokaab's "Jooji" behavior.
  SELECT * INTO v_row
  FROM public.ussd_package_discoveries
  WHERE tenant_id = p_tenant_id
    AND root_package_id = p_root_package_id
    AND phone_number = v_phone
    AND status IN ('pending','processing')
    AND queued_at > now() - interval '5 minutes'
  ORDER BY queued_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'id', v_row.id,
      'status', v_row.status,
      'cached', false
    );
  END IF;

  INSERT INTO public.ussd_package_discoveries(
    tenant_id,
    root_package_id,
    phone_number
  )
  VALUES (
    p_tenant_id,
    p_root_package_id,
    v_phone
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'success', true,
    'id', v_id,
    'status', 'pending',
    'cached', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.release_discovery_session(
  p_tenant_id uuid,
  p_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.ussd_package_discoveries
  SET expires_at = now(),
      session_state = 'closed',
      session_expires_at = NULL,
      session_device_id = NULL,
      session_note = 'released_by_user',
      updated_at = now()
  WHERE id = p_id
    AND tenant_id = p_tenant_id;

  RETURN jsonb_build_object('success', FOUND);
END;
$$;
