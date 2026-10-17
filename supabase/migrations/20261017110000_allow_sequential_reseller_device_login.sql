-- Allow sequential (logout -> login) reseller accounts on one physical Android phone.
-- Preserve a separate immutable tenant-owned android_devices row (and SIM balances)
-- for each tenant; never rewrite tenant_id on existing rows.
ALTER TABLE public.android_devices
  ADD COLUMN IF NOT EXISTS physical_device_id text;

CREATE UNIQUE INDEX IF NOT EXISTS android_devices_physical_tenant_unique
  ON public.android_devices (physical_device_id, tenant_id)
  WHERE physical_device_id IS NOT NULL;

COMMENT ON COLUMN public.android_devices.physical_device_id IS
  'Original Android ID. Set for tenant-specific registrations so the active row may use the real ID while inactive tenant rows use a parked ID.';

CREATE OR REPLACE FUNCTION public.activate_reseller_device(
  p_device_id text,
  p_tenant_id uuid,
  p_device_name text DEFAULT 'Android Device',
  p_sim_number text DEFAULT '',
  p_sim2_number text DEFAULT NULL,
  p_provider_name text DEFAULT 'unknown',
  p_sim1_provider text DEFAULT NULL,
  p_sim2_provider text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $function$
DECLARE
  v_device_id text := NULLIF(btrim(p_device_id), '');
  v_current public.android_devices%ROWTYPE;
  v_target public.android_devices%ROWTYPE;
  v_target_id uuid;
BEGIN
  -- This RPC may ONLY be used by the server's service-role client, which has
  -- already authenticated the user's password and checked tenant_members.
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Only the device registration service may switch resellers';
  END IF;
  IF v_device_id IS NULL OR length(v_device_id) > 256 OR p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Device ID and tenant are required';
  END IF;

  -- Serialize two concurrent logins on the same handset.
  PERFORM pg_advisory_xact_lock(hashtextextended('reseller-device:' || v_device_id, 0));

  SELECT * INTO v_current
    FROM public.android_devices
   WHERE device_id = v_device_id
   FOR UPDATE;

  IF v_current.id IS NOT NULL AND v_current.tenant_id = p_tenant_id THEN
    UPDATE public.android_devices
       SET physical_device_id = v_device_id
     WHERE id = v_current.id;
    RETURN v_current.id;
  END IF;

  IF v_current.id IS NOT NULL THEN
    -- Never interrupt a just-dispatched USSD operation: the old APK is still
    -- receiving the carrier response and must report it to the old tenant.
    IF EXISTS (
      SELECT 1 FROM public.delivery_queue q
       WHERE q.tenant_id = v_current.tenant_id
         AND q.android_device_id = v_device_id
         AND q.status = 'processing'
         AND (q.last_attempt_at IS NULL
              OR q.last_attempt_at > now() - interval '90 seconds')
    ) THEN
      RAISE EXCEPTION 'DEVICE_BUSY: A delivery is still processing; try logging in after it finishes';
    END IF;

    -- Keep all existing references to this tenant's device UUID and balances.
    -- Only one tenant row at a time owns the physical Android ID used by the APK.
    UPDATE public.android_devices
       SET device_id = 'switched-out:' || v_current.id::text,
           physical_device_id = v_device_id,
           archived_at = now(),
           is_active = false
     WHERE id = v_current.id;
  END IF;

  SELECT * INTO v_target
    FROM public.android_devices
   WHERE physical_device_id = v_device_id
     AND tenant_id = p_tenant_id
     AND device_id = 'switched-out:' || id::text
   FOR UPDATE;

  IF v_target.id IS NOT NULL THEN
    UPDATE public.android_devices
       SET device_id = v_device_id,
           archived_at = NULL,
           is_active = true
     WHERE id = v_target.id
     RETURNING id INTO v_target_id;
  ELSE
    INSERT INTO public.android_devices (
      device_id, physical_device_id, tenant_id, device_name,
      sim_number, sim2_number, provider_name, sim1_provider, sim2_provider,
      is_active, archived_at, last_ping_at
    ) VALUES (
      v_device_id, v_device_id, p_tenant_id,
      COALESCE(NULLIF(btrim(p_device_name), ''), 'Android Device'),
      COALESCE(p_sim_number, ''),
      p_sim2_number,
      COALESCE(NULLIF(p_provider_name, ''), 'unknown'),
      p_sim1_provider, p_sim2_provider,
      true, NULL, now()
    )
    RETURNING id INTO v_target_id;
  END IF;

  RETURN v_target_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.activate_reseller_device(
  text, uuid, text, text, text, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_reseller_device(
  text, uuid, text, text, text, text, text, text
) TO service_role;