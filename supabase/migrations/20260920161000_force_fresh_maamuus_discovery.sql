-- Make *212* discovery fresh-only.
-- Every customer search creates a brand-new discovery row; old completed/pending
-- rows are never reused. Closing the UI also cancels the current search/session.

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

  IF NOT EXISTS (
    SELECT 1
    FROM public.data_packages_config p
    WHERE p.id = p_root_package_id
      AND p.tenant_id = p_tenant_id
      AND p.is_active = true
      AND p.is_discovery_root = true
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Xulasho discovery ah lama helin'
    );
  END IF;

  -- Never reuse a previous result or in-flight request for the same search.
  -- Expire/cancel it so a new UI search always reflects a fresh carrier menu.
  UPDATE public.ussd_package_discoveries
  SET status = CASE
        WHEN status IN ('pending','processing') THEN 'failed'
        ELSE status
      END,
      error = CASE
        WHEN status IN ('pending','processing') THEN 'superseded_by_new_search'
        ELSE error
      END,
      completed_at = CASE
        WHEN status IN ('pending','processing') THEN now()
        ELSE completed_at
      END,
      expires_at = now(),
      session_state = 'closed',
      session_expires_at = NULL,
      session_device_id = NULL,
      session_note = 'superseded_by_new_search',
      updated_at = now()
  WHERE tenant_id = p_tenant_id
    AND root_package_id = p_root_package_id
    AND phone_number = v_phone
    AND (
      status IN ('pending','processing','done')
      OR session_state = 'open'
    );

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
  SET status = CASE
        WHEN status IN ('pending','processing') THEN 'failed'
        ELSE status
      END,
      error = CASE
        WHEN status IN ('pending','processing') THEN 'cancelled_by_user'
        ELSE error
      END,
      completed_at = CASE
        WHEN status IN ('pending','processing') THEN now()
        ELSE completed_at
      END,
      expires_at = now(),
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
