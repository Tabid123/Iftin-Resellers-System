-- Finish the customer payment -> *212* held-session handoff without coupling
-- process-payment-receipt to carrier-specific UI details. The receipt function
-- creates the order as usual; these tenant-aware triggers attach the discovery
-- and suppress the ordinary delivery queue entry so the Android agent can
-- resume the already-open carrier session. If that session is gone, the
-- existing enqueue_discovery_selection() RPC creates the safe *212* redial.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS discovery_id uuid REFERENCES public.ussd_package_discoveries(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS orders_discovery_idx
  ON public.orders (tenant_id, discovery_id)
  WHERE discovery_id IS NOT NULL;

-- Treat an explicitly flagged package as a discovery root. For existing tenant
-- data, also recognise packages/instructions that already use *212* so rollout
-- does not require a manual flag migration before the storefront can use them.
CREATE OR REPLACE FUNCTION public.is_212_discovery_root(p_tenant_id uuid, p_package_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.data_packages_config p
    WHERE p.id = p_package_id
      AND p.tenant_id = p_tenant_id
      AND p.is_active = true
      AND (
        p.is_discovery_root = true
        OR coalesce(p.ussd_code, '') LIKE '*212%'
        OR EXISTS (
          SELECT 1
          FROM public.delivery_instructions di
          WHERE di.tenant_id = p.tenant_id
            AND di.provider_id = p.provider_id
            AND coalesce(di.code_template, '') LIKE '*212%'
            AND (
              di.package_id = p.id
              OR (di.package_id IS NULL AND di.category_id = p.category_id)
              OR (di.package_id IS NULL AND di.category_id IS NULL)
            )
        )
      )
  );
$$;

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
    AND public.is_212_discovery_root(v_tenant, p.id);
END;
$$;

-- Replace the service-role implementation with the same validation plus the
-- backwards-compatible *212* detection above. The safe header-bound overload
-- continues to delegate to this function.
CREATE OR REPLACE FUNCTION public.request_package_discovery(
  p_tenant_id uuid,
  p_root_package_id uuid,
  p_phone text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_phone text;
  v_row public.ussd_package_discoveries%ROWTYPE;
  v_id uuid;
BEGIN
  v_phone := regexp_replace(coalesce(p_phone,''), '\D', '', 'g');
  IF length(v_phone) = 12 AND left(v_phone,3) = '252' THEN v_phone := substring(v_phone from 4); END IF;
  IF length(v_phone) = 10 AND left(v_phone,1) = '0' THEN v_phone := substring(v_phone from 2); END IF;
  IF length(v_phone) <> 9 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Fadlan gali lambarka oo dhan (9 lambar)');
  END IF;

  IF NOT public.is_212_discovery_root(p_tenant_id, p_root_package_id) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Xulasho discovery ah lama helin');
  END IF;

  SELECT * INTO v_row
  FROM public.ussd_package_discoveries
  WHERE tenant_id = p_tenant_id AND root_package_id = p_root_package_id
    AND phone_number = v_phone AND status = 'done' AND expires_at > now()
  ORDER BY completed_at DESC LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('success', true, 'id', v_row.id, 'status', 'done', 'cached', true);
  END IF;

  SELECT * INTO v_row
  FROM public.ussd_package_discoveries
  WHERE tenant_id = p_tenant_id AND root_package_id = p_root_package_id
    AND phone_number = v_phone AND status IN ('pending','processing')
    AND queued_at > now() - interval '5 minutes'
  ORDER BY queued_at DESC LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('success', true, 'id', v_row.id, 'status', v_row.status, 'cached', false);
  END IF;

  INSERT INTO public.ussd_package_discoveries(tenant_id, root_package_id, phone_number)
  VALUES (p_tenant_id, p_root_package_id, v_phone) RETURNING id INTO v_id;
  RETURN jsonb_build_object('success', true, 'id', v_id, 'status', 'pending', 'cached', false);
END;
$$;

-- Attach the matched pending payment's discovery metadata to the order that
-- process-payment-receipt creates. Prefix formatting differences are ignored.
CREATE OR REPLACE FUNCTION public.zz_apply_pending_discovery_to_order()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pending record;
  v_disc record;
  v_price record;
  v_sender text;
  v_receiver text;
BEGIN
  IF NEW.discovery_id IS NOT NULL OR NEW.tenant_id IS NULL THEN RETURN NEW; END IF;

  v_sender := right(regexp_replace(coalesce(NEW.sender_phone,''), '\D', '', 'g'), 9);
  v_receiver := right(regexp_replace(coalesce(NEW.receiver_phone,''), '\D', '', 'g'), 9);

  SELECT p.id, p.discovery_id, p.discovery_label
  INTO v_pending
  FROM public.pending_online_payments p
  WHERE p.tenant_id = NEW.tenant_id
    AND p.status = 'matched'
    AND p.discovery_id IS NOT NULL
    AND p.created_at >= now() - interval '30 minutes'
    AND right(regexp_replace(coalesce(p.sender_phone,''), '\D', '', 'g'), 9) = v_sender
    AND right(regexp_replace(coalesce(p.receiver_phone,''), '\D', '', 'g'), 9) = v_receiver
    AND p.package_id = NEW.package_id
    AND abs(coalesce(p.expected_amount,0)::numeric - coalesce(NEW.selling_price,0)::numeric) < 0.01
  ORDER BY p.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN RETURN NEW; END IF;

  SELECT d.root_package_id, d.phone_number
  INTO v_disc
  FROM public.ussd_package_discoveries d
  WHERE d.id = v_pending.discovery_id AND d.tenant_id = NEW.tenant_id
  LIMIT 1;
  IF NOT FOUND THEN RETURN NEW; END IF;

  NEW.discovery_id := v_pending.discovery_id;
  NEW.discovery_root_id := v_disc.root_package_id;
  NEW.discovery_menu_label := v_pending.discovery_label;

  SELECT c.label, c.cost_price, c.info_line1
  INTO v_price
  FROM public.ussd_price_catalog c
  WHERE c.tenant_id = NEW.tenant_id
    AND c.root_package_id = v_disc.root_package_id
    AND c.is_active = true
    AND (
      c.normalized_label = public.ussd_normalize_label(public.ussd_strip_price_prefix(v_pending.discovery_label))
      OR (
        public.ussd_duration_key(c.label) IS NOT NULL
        AND public.ussd_duration_key(c.label) = public.ussd_duration_key(v_pending.discovery_label)
      )
    )
  ORDER BY (c.normalized_label = public.ussd_normalize_label(public.ussd_strip_price_prefix(v_pending.discovery_label))) DESC
  LIMIT 1;

  IF FOUND THEN
    NEW.package_name := coalesce(nullif(v_price.label,''), NEW.package_name);
    NEW.cost_price := coalesce(v_price.cost_price, NEW.cost_price);
    IF nullif(v_price.info_line1,'') IS NOT NULL THEN NEW.data_amount := v_price.info_line1; END IF;
  ELSIF nullif(v_pending.discovery_label,'') IS NOT NULL THEN
    NEW.package_name := v_pending.discovery_label;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zz_apply_pending_discovery_to_order ON public.orders;
CREATE TRIGGER zz_apply_pending_discovery_to_order
BEFORE INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.zz_apply_pending_discovery_to_order();

-- Once the order exists, choose held-session resume when possible. The existing
-- RPC falls back to a fresh *212* redial when the held session is expired/lost.
CREATE OR REPLACE FUNCTION public.zz_enqueue_order_discovery_selection()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.discovery_id IS NOT NULL AND nullif(NEW.discovery_menu_label,'') IS NOT NULL THEN
    PERFORM public.enqueue_discovery_selection(
      NEW.tenant_id,
      NEW.discovery_id,
      NEW.id,
      NEW.discovery_menu_label
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zz_enqueue_order_discovery_selection ON public.orders;
CREATE TRIGGER zz_enqueue_order_discovery_selection
AFTER INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.zz_enqueue_order_discovery_selection();

-- process-payment-receipt continues through its generic delivery path after it
-- inserts an order. Do not let that generic row duplicate a *212* delivery.
-- Rows created by enqueue_discovery_selection() carry discovery_menu_label and
-- are therefore allowed (that is the expired-session redial path).
CREATE OR REPLACE FUNCTION public.skip_generic_queue_for_discovery_order()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.discovery_menu_label IS NULL
     AND EXISTS (
       SELECT 1 FROM public.orders o
       WHERE o.id = NEW.order_id AND o.discovery_id IS NOT NULL
     ) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS aa_skip_generic_queue_for_discovery_order ON public.delivery_queue;
CREATE TRIGGER aa_skip_generic_queue_for_discovery_order
BEFORE INSERT ON public.delivery_queue
FOR EACH ROW EXECUTE FUNCTION public.skip_generic_queue_for_discovery_order();

REVOKE ALL ON FUNCTION public.is_212_discovery_root(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_212_discovery_root(uuid,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.get_discovery_root_ids(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_discovery_root_ids(uuid) TO anon,authenticated,service_role;
REVOKE EXECUTE ON FUNCTION public.request_package_discovery(uuid,uuid,text) FROM anon,authenticated;
GRANT EXECUTE ON FUNCTION public.request_package_discovery(uuid,uuid,text) TO service_role;