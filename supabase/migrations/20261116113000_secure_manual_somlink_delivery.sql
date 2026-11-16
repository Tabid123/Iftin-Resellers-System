-- A secure, idempotent manual Somlink dispatch path for tenant admins.
-- Requests use the same existing queue/edge-function dispatch as paid orders.
-- No Somlink credentials are ever given to a browser.
--
-- Important: manual deliveries have payment_source='manual' and do not
-- create a payment receipt; the merchant explicitly authorizes the wallet charge.
CREATE UNIQUE INDEX IF NOT EXISTS orders_somlink_manual_request_once
ON public.orders (tenant_id, tx_id)
WHERE payment_source = 'manual' AND tx_id LIKE 'somlink-manual:%';

CREATE OR REPLACE FUNCTION public.create_manual_somlink_delivery(
  p_tenant_id uuid,
  p_package_id uuid,
  p_receiver_phone text,
  p_request_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_membership_role text;
  v_has_permissions boolean := false;
  v_can_send boolean := false;
  v_normalized_phone text;
  v_package record;
  v_order_id uuid;
  v_ref text;
BEGIN
  IF v_user_id IS NULL OR p_tenant_id IS NULL OR p_request_id IS NULL
    OR p_package_id IS NULL OR p_tenant_id IS DISTINCT FROM public.current_request_tenant_id()
    OR p_tenant_id IS DISTINCT FROM public.effective_tenant_id()
  THEN
    RAISE EXCEPTION 'not_authorized_for_tenant' USING ERRCODE = '42501';
  END IF;

  SELECT m.role INTO v_membership_role
    FROM public.tenant_members m
   WHERE m.tenant_id = p_tenant_id AND m.user_id = v_user_id
   ORDER BY CASE WHEN m.role = 'owner' THEN 0 ELSE 1 END
   LIMIT 1;

  IF v_membership_role NOT IN ('owner', 'admin') OR v_membership_role IS NULL THEN
    RAISE EXCEPTION 'tenant_admin_required' USING ERRCODE = '42501';
  END IF;

  -- Consistent with useAdminPermissions: an admin with an explicit permission
  -- set needs manual_transactions; legacy admins without a set have full access.
  IF v_membership_role = 'admin' THEN
    SELECT EXISTS(
      SELECT 1 FROM public.admin_permissions
       WHERE tenant_id = p_tenant_id AND user_id = v_user_id
    ) INTO v_has_permissions;
    IF v_has_permissions AND NOT EXISTS(
      SELECT 1 FROM public.admin_permissions
       WHERE tenant_id = p_tenant_id AND user_id = v_user_id
         AND permission_key = 'manual_transactions'
    ) THEN
      RAISE EXCEPTION 'manual_delivery_permission_required' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF public.is_demo_tenant(p_tenant_id) THEN
    RAISE EXCEPTION 'demo_tenant_live_delivery_blocked';
  END IF;

  IF NOT public.somlink_tenant_ready() THEN
    RAISE EXCEPTION 'somlink_api_not_connected_or_active';
  END IF;

  v_normalized_phone := regexp_replace(coalesce(p_receiver_phone, ''), '[^0-9]', '', 'g');
  IF v_normalized_phone ~ '^25264[0-9]{7}$' THEN
    v_normalized_phone := substring(v_normalized_phone FROM 4);
  END IF;
  IF v_normalized_phone !~ '^64[0-9]{7}$' THEN
    RAISE EXCEPTION 'somlink_receiver_must_be_64_nine_digits';
  END IF;

  -- Serialise retries with the same client request id so a repeated tap,
  -- timeout, or lost response can never create a second charged delivery.
  v_ref := 'somlink-manual:' || p_request_id::text;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':' || v_ref, 0));
  SELECT o.id INTO v_order_id
    FROM public.orders o
   WHERE o.tenant_id = p_tenant_id AND o.tx_id = v_ref
     AND o.payment_source = 'manual'
   LIMIT 1;
  IF v_order_id IS NOT NULL THEN
    RETURN v_order_id;
  END IF;

  SELECT p.id, p.provider_id, p.package_name, p.data_amount,
         p.selling_price, p.cost_price, p.somlink_bundle_id
    INTO v_package
    FROM public.data_packages_config p
    JOIN public.providers_config pr
      ON pr.id = p.provider_id AND pr.tenant_id = p.tenant_id
   WHERE p.id = p_package_id AND p.tenant_id = p_tenant_id
     AND p.is_active IS TRUE AND pr.is_active IS TRUE
     AND lower(btrim(pr.provider_name)) = 'somlink'
     AND p.somlink_bundle_id IS NOT NULL AND p.somlink_bundle_id > 0
     AND p.is_discovery_root IS FALSE
     AND p.cost_price > 0 AND p.selling_price > 0.01
   LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'somlink_package_unavailable_or_invalid';
  END IF;

  INSERT INTO public.orders(
    tenant_id, customer_phone, receiver_phone, package_id, provider_id,
    package_name, data_amount, selling_price, cost_price,
    payment_number, payment_source, status, delivery_status,
    is_manual, delivery_notes, tx_id, source
  ) VALUES (
    p_tenant_id, v_normalized_phone, v_normalized_phone,
    v_package.id, v_package.provider_id,
    v_package.package_name, v_package.data_amount,
    v_package.selling_price, v_package.cost_price,
    'MANUAL', 'manual', 'completed', 'pending',
    true, 'Manual Somlink API dispatch — pending provider confirmation',
    v_ref, 'web'
  ) RETURNING id INTO v_order_id;

  -- Existing BEFORE trigger: validates mapped bundle and transitions this
  -- entry into 'processing'. Existing AFTER trigger: sends the authenticated
  -- queue id to the server-side Somlink dispatcher only after transaction commit.
  INSERT INTO public.delivery_queue(
    tenant_id, order_id, receiver_phone, provider_name,
    ussd_code, status, android_device_id
  ) VALUES (
    p_tenant_id, v_order_id, v_normalized_phone, 'somlink',
    'API:SOMLINK:' || v_package.somlink_bundle_id, 'pending', 'somlink-api'
  );

  -- Somlink packages correctly have no USSD code: the generic orders
  -- BEFORE INSERT delivery-configuration trigger may label them as
  -- config_missing. The API queue above is the valid delivery method.
  -- Fix ONLY this newly-created manual order's delivery status, leaving
  -- existing customer orders and all other provider rules untouched.
  UPDATE public.orders
     SET delivery_status = 'processing',
         delivery_notes = 'Manual Somlink API dispatch — awaiting provider confirmation'
   WHERE id = v_order_id AND tenant_id = p_tenant_id
     AND payment_source = 'manual' AND delivery_status = 'config_missing';

  RETURN v_order_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_manual_somlink_delivery(uuid,uuid,text,uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_manual_somlink_delivery(uuid,uuid,text,uuid)
  TO authenticated;

-- Read-only tenant-admin status for the SIM-like Somlink API card.
-- Only authenticated members may see their own integration; never return Vault
-- credentials, wallet phone, tokens, raw API payloads or another tenant's data.
CREATE OR REPLACE FUNCTION public.somlink_manual_device_status(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $status$
DECLARE
  v_role text;
  v_configured boolean := false;
  v_connected boolean := false;
  v_enabled boolean := false;
  v_balance numeric;
  v_at timestamptz;
  v_financial boolean := false;
BEGIN
  IF auth.uid() IS NULL OR p_tenant_id IS NULL
    OR p_tenant_id IS DISTINCT FROM public.current_request_tenant_id()
    OR p_tenant_id IS DISTINCT FROM public.effective_tenant_id()
  THEN
    RAISE EXCEPTION 'not_authorized_for_tenant' USING ERRCODE='42501';
  END IF;

  SELECT m.role INTO v_role FROM public.tenant_members m
   WHERE m.user_id = auth.uid() AND m.tenant_id = p_tenant_id
   ORDER BY CASE WHEN m.role='owner' THEN 0 ELSE 1 END LIMIT 1;
  IF v_role NOT IN ('owner','admin') OR v_role IS NULL THEN
    RAISE EXCEPTION 'tenant_admin_required' USING ERRCODE='42501';
  END IF;

  SELECT true, s.connection_status='connected', s.is_active
    INTO v_configured, v_connected, v_enabled
    FROM private.tenant_somlink_integrations s
   WHERE s.tenant_id=p_tenant_id LIMIT 1;

  IF v_role='owner' OR NOT EXISTS(
    SELECT 1 FROM public.admin_permissions
     WHERE tenant_id=p_tenant_id AND user_id=auth.uid()
  ) OR EXISTS(
    SELECT 1 FROM public.admin_permissions
     WHERE tenant_id=p_tenant_id AND user_id=auth.uid() AND permission_key='view_profit'
  ) THEN
    v_financial := true;
  END IF;

  IF v_financial THEN
    SELECT (q.somlink_response->>'balance')::numeric, q.completed_at
      INTO v_balance, v_at
      FROM public.delivery_queue q
     WHERE q.tenant_id = p_tenant_id
       AND q.provider_name = 'somlink' AND q.status='completed'
       AND q.somlink_response IS NOT NULL
       AND jsonb_typeof(q.somlink_response->'balance')='number'
     ORDER BY q.completed_at DESC NULLS LAST LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'configured', coalesce(v_configured,false),
    'ready', (coalesce(v_configured,false) AND coalesce(v_connected,false)
              AND coalesce(v_enabled,false) AND public.somlink_tenant_ready()),
    'balance', v_balance,
    'balance_at', v_at
  );
END;
$status$;

REVOKE ALL ON FUNCTION public.somlink_manual_device_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.somlink_manual_device_status(uuid) TO authenticated;
