-- Tenant-aware port of Riyokaab_App's *212* discovery/hold/resume system.
-- This migration only adds the generic engine. It deliberately does NOT seed
-- Riyokaab-specific packages or prices into reseller tenants.

ALTER TABLE public.data_packages_config
  ADD COLUMN IF NOT EXISTS is_discovery_root boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_ussd_only boolean NOT NULL DEFAULT false;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS discovery_menu_label text,
  ADD COLUMN IF NOT EXISTS discovery_root_id uuid;

ALTER TABLE public.delivery_queue
  ADD COLUMN IF NOT EXISTS discovery_menu_label text;

CREATE OR REPLACE FUNCTION public.ussd_strip_price_prefix(p_label text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT btrim(regexp_replace(coalesce(p_label,''), '^\s*[^=]{0,20}=\s*', ''));
$$;

CREATE OR REPLACE FUNCTION public.ussd_normalize_label(p_label text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT btrim(regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(lower(coalesce(p_label,'')), '[^a-z0-9]+', ' ', 'g'),
          '\m(xadidneyn|xadidnaan|xaddidnayn|xadidneen|xadidnayn)\M', 'xadidnayn', 'g'),
        '\m(ku hadal|kuhadall|kuhadal|kuhdal)\M', 'kuhadal', 'g'),
      '\m(saacadood|saacado|saacad|saacc|saac|hours|hour|hrs|hr)\M', 'saac', 'g'),
    '\m(maalmood|maalmo|maalin|days|day)\M', 'maalin', 'g'));
$$;

CREATE OR REPLACE FUNCTION public.ussd_duration_key(p_label text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE WHEN m IS NULL THEN NULL ELSE m[1] || ' ' || m[2] END
  FROM (SELECT regexp_match(
    public.ussd_normalize_label(public.ussd_strip_price_prefix(p_label)),
    '([0-9]+) (saac|maalin)') AS m) s;
$$;

CREATE TABLE IF NOT EXISTS public.ussd_price_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  root_package_id uuid NOT NULL REFERENCES public.data_packages_config(id) ON DELETE CASCADE,
  label text NOT NULL,
  normalized_label text NOT NULL DEFAULT '',
  cost_price numeric NOT NULL DEFAULT 0,
  selling_price numeric NOT NULL DEFAULT 0,
  info_line1 text,
  info_line2 text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, root_package_id, normalized_label)
);

CREATE OR REPLACE FUNCTION public.ussd_price_catalog_normalize()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.normalized_label := public.ussd_normalize_label(public.ussd_strip_price_prefix(NEW.label));
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_ussd_price_catalog_normalize ON public.ussd_price_catalog;
CREATE TRIGGER trg_ussd_price_catalog_normalize
BEFORE INSERT OR UPDATE ON public.ussd_price_catalog
FOR EACH ROW EXECUTE FUNCTION public.ussd_price_catalog_normalize();

CREATE TABLE IF NOT EXISTS public.ussd_package_discoveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  root_package_id uuid NOT NULL REFERENCES public.data_packages_config(id) ON DELETE CASCADE,
  phone_number text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','done','failed')),
  device_id text,
  raw_menu text,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  error text,
  queued_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz,
  session_state text NOT NULL DEFAULT 'closed' CHECK (session_state IN ('open','selected','delivering','consumed','lost','closed')),
  session_device_id text,
  session_expires_at timestamptz,
  selected_label text,
  selected_index text,
  selected_order_id uuid,
  session_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ussd_discovery_queue_idx
  ON public.ussd_package_discoveries (tenant_id, status, queued_at);
CREATE INDEX IF NOT EXISTS ussd_discovery_cache_idx
  ON public.ussd_package_discoveries (tenant_id, root_package_id, phone_number, status, expires_at DESC);

CREATE TABLE IF NOT EXISTS public.discovery_unmatched_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  root_package_id uuid NOT NULL REFERENCES public.data_packages_config(id) ON DELETE CASCADE,
  raw_label text NOT NULL,
  normalized_label text NOT NULL,
  hits integer NOT NULL DEFAULT 1,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, root_package_id, normalized_label)
);

ALTER TABLE public.ussd_price_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ussd_package_discoveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discovery_unmatched_labels ENABLE ROW LEVEL SECURITY;

-- Direct anonymous table access is intentionally denied. Customer and Android
-- clients use SECURITY DEFINER RPCs below; admin CRUD can use service-role-backed APIs.
REVOKE ALL ON public.ussd_price_catalog FROM anon;
REVOKE ALL ON public.ussd_package_discoveries FROM anon;
REVOKE ALL ON public.discovery_unmatched_labels FROM anon;
GRANT ALL ON public.ussd_price_catalog TO service_role;
GRANT ALL ON public.ussd_package_discoveries TO service_role;
GRANT ALL ON public.discovery_unmatched_labels TO service_role;

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

  IF NOT EXISTS (
    SELECT 1 FROM public.data_packages_config p
    WHERE p.id = p_root_package_id
      AND p.tenant_id = p_tenant_id
      AND p.is_active = true
      AND p.is_discovery_root = true
  ) THEN
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

CREATE OR REPLACE FUNCTION public.claim_next_discovery(p_device_id text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant uuid;
  v_providers text[];
  v_row public.ussd_package_discoveries%ROWTYPE;
  v_root_name text;
BEGIN
  SELECT d.tenant_id,
    ARRAY(SELECT DISTINCT lower(x) FROM unnest(ARRAY[d.sim1_provider,d.sim2_provider]) x WHERE x IS NOT NULL AND x <> '')
  INTO v_tenant, v_providers
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
    AND (array_length(v_providers,1) IS NULL OR lower(prov.provider_name)=ANY(v_providers))
  ORDER BY dsc.queued_at ASC
  LIMIT 1 FOR UPDATE OF dsc SKIP LOCKED;

  IF NOT FOUND THEN RETURN NULL; END IF;

  UPDATE public.ussd_package_discoveries
  SET status='processing', device_id=p_device_id, claimed_at=now(), updated_at=now()
  WHERE id=v_row.id AND tenant_id=v_tenant;

  SELECT package_name INTO v_root_name FROM public.data_packages_config
  WHERE id=v_row.root_package_id AND tenant_id=v_tenant;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'phone_number', v_row.phone_number,
    'menu1_label', coalesce(v_root_name,''),
    'ussd_code', '*212*' || v_row.phone_number || '#'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_discovery(
  p_id uuid,
  p_raw_menu text,
  p_items jsonb DEFAULT '[]'::jsonb,
  p_error text DEFAULT NULL,
  p_hold boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.ussd_package_discoveries d
  SET raw_menu=p_raw_menu,
      items=coalesce(p_items,'[]'::jsonb),
      error=p_error,
      status=CASE WHEN p_error IS NULL THEN 'done' ELSE 'failed' END,
      completed_at=now(),
      expires_at=CASE WHEN p_error IS NULL THEN now()+interval '30 minutes' ELSE NULL END,
      session_state=CASE WHEN p_error IS NULL AND p_hold THEN 'open' ELSE 'closed' END,
      session_device_id=CASE WHEN p_error IS NULL AND p_hold THEN d.device_id ELSE NULL END,
      session_expires_at=CASE WHEN p_error IS NULL AND p_hold THEN now()+interval '8 minutes' ELSE NULL END,
      updated_at=now()
  WHERE d.id=p_id;
  RETURN jsonb_build_object('success', FOUND);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_package_discovery(p_tenant_id uuid, p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row public.ussd_package_discoveries%ROWTYPE;
  v_packages jsonb;
BEGIN
  SELECT * INTO v_row FROM public.ussd_package_discoveries
  WHERE id=p_id AND tenant_id=p_tenant_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'message','Codsi lama helin'); END IF;

  IF v_row.status <> 'done' THEN
    RETURN jsonb_build_object('success',true,'status',v_row.status,'error',v_row.error,'packages','[]'::jsonb);
  END IF;

  WITH rows AS (
    SELECT item->>'index' idx,
      public.ussd_strip_price_prefix(item->>'label') raw_label,
      m.label c_label, m.selling_price c_price, m.info_line1 c_info1, m.info_line2 c_info2
    FROM jsonb_array_elements(v_row.items) item
    LEFT JOIN LATERAL (
      SELECT c.label,c.selling_price,c.info_line1,c.info_line2
      FROM public.ussd_price_catalog c
      WHERE c.tenant_id=v_row.tenant_id AND c.root_package_id=v_row.root_package_id AND c.is_active=true
        AND (c.normalized_label=public.ussd_normalize_label(public.ussd_strip_price_prefix(item->>'label'))
          OR (public.ussd_duration_key(c.label) IS NOT NULL
            AND public.ussd_duration_key(c.label)=public.ussd_duration_key(item->>'label')))
      ORDER BY (c.normalized_label=public.ussd_normalize_label(public.ussd_strip_price_prefix(item->>'label'))) DESC
      LIMIT 1
    ) m ON true
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'index',idx,'label',coalesce(c_label,raw_label),'carrier_label',raw_label,
    'selling_price',c_price,'info_line1',c_info1,'info_line2',c_info2,
    'price_missing',(c_price IS NULL)) ORDER BY idx),'[]'::jsonb)
  INTO v_packages FROM rows;

  INSERT INTO public.discovery_unmatched_labels(tenant_id,root_package_id,raw_label,normalized_label)
  SELECT v_row.tenant_id,v_row.root_package_id,
    public.ussd_strip_price_prefix(item->>'label'),
    public.ussd_normalize_label(public.ussd_strip_price_prefix(item->>'label'))
  FROM jsonb_array_elements(v_row.items) item
  WHERE NOT EXISTS (
    SELECT 1 FROM public.ussd_price_catalog c
    WHERE c.tenant_id=v_row.tenant_id AND c.root_package_id=v_row.root_package_id AND c.is_active=true
      AND (c.normalized_label=public.ussd_normalize_label(public.ussd_strip_price_prefix(item->>'label'))
        OR (public.ussd_duration_key(c.label) IS NOT NULL AND public.ussd_duration_key(c.label)=public.ussd_duration_key(item->>'label')))
  )
  ON CONFLICT (tenant_id,root_package_id,normalized_label)
  DO UPDATE SET hits=public.discovery_unmatched_labels.hits+1,last_seen_at=now(),raw_label=EXCLUDED.raw_label,updated_at=now();

  RETURN jsonb_build_object(
    'success',true,'status','done','packages',v_packages,
    'session_state',v_row.session_state,
    'session_seconds_left',greatest(0,extract(epoch from (coalesce(v_row.session_expires_at,now())-now()))::int)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_discovery_queue_status(p_tenant_id uuid, p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.ussd_package_discoveries%ROWTYPE; v_ahead int:=0;
BEGIN
  SELECT * INTO v_row FROM public.ussd_package_discoveries WHERE id=p_id AND tenant_id=p_tenant_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('found',false); END IF;
  IF v_row.status='pending' THEN
    SELECT count(*) INTO v_ahead FROM public.ussd_package_discoveries
    WHERE tenant_id=p_tenant_id AND status='pending' AND queued_at<v_row.queued_at AND queued_at>=now()-interval '5 minutes';
  END IF;
  RETURN jsonb_build_object('found',true,'status',v_row.status,'error',v_row.error,'ahead',v_ahead,
    'position',v_ahead+1,'active_sessions',(SELECT count(*) FROM public.ussd_package_discoveries WHERE tenant_id=p_tenant_id AND status='processing'),
    'queued_at',v_row.queued_at,'claimed_at',v_row.claimed_at);
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_discovery_selection(p_device_id text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant uuid; v_row public.ussd_package_discoveries%ROWTYPE;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.android_devices
  WHERE device_id=p_device_id AND is_active=true AND archived_at IS NULL LIMIT 1;
  IF v_tenant IS NULL THEN RETURN NULL; END IF;

  SELECT * INTO v_row FROM public.ussd_package_discoveries
  WHERE tenant_id=v_tenant AND session_state='selected'
    AND session_expires_at>now()
    AND (session_device_id IS NULL OR session_device_id=p_device_id OR device_id=p_device_id)
  ORDER BY created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN RETURN NULL; END IF;

  UPDATE public.ussd_package_discoveries
  SET session_state='delivering',session_device_id=p_device_id,updated_at=now()
  WHERE id=v_row.id AND tenant_id=v_tenant;
  RETURN jsonb_build_object('id',v_row.id,'label',v_row.selected_label,'index',v_row.selected_index,'order_id',v_row.selected_order_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_discovery_selection(
  p_tenant_id uuid,
  p_discovery_id uuid,
  p_order_id uuid,
  p_label text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_disc public.ussd_package_discoveries%ROWTYPE;
  v_order record;
  v_root record;
  v_index text;
  v_carrier_label text;
  v_code text;
BEGIN
  SELECT * INTO v_disc FROM public.ussd_package_discoveries
  WHERE id=p_discovery_id AND tenant_id=p_tenant_id AND status='done';
  IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'message','Discovery lama helin'); END IF;

  SELECT id,receiver_phone INTO v_order FROM public.orders WHERE id=p_order_id AND tenant_id=p_tenant_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'message','Order lama helin'); END IF;

  SELECT p.package_name,pr.provider_name INTO v_root
  FROM public.data_packages_config p JOIN public.providers_config pr ON pr.id=p.provider_id AND pr.tenant_id=p.tenant_id
  WHERE p.id=v_disc.root_package_id AND p.tenant_id=p_tenant_id;

  SELECT item->>'index', item->>'label' INTO v_index,v_carrier_label
  FROM jsonb_array_elements(v_disc.items) item
  WHERE public.ussd_normalize_label(public.ussd_strip_price_prefix(item->>'label'))
      = public.ussd_normalize_label(public.ussd_strip_price_prefix(p_label))
     OR (public.ussd_duration_key(item->>'label') IS NOT NULL
      AND public.ussd_duration_key(item->>'label')=public.ussd_duration_key(p_label))
  ORDER BY (public.ussd_normalize_label(public.ussd_strip_price_prefix(item->>'label'))
      = public.ussd_normalize_label(public.ussd_strip_price_prefix(p_label))) DESC
  LIMIT 1;

  UPDATE public.orders SET discovery_menu_label=p_label,discovery_root_id=v_disc.root_package_id
  WHERE id=p_order_id AND tenant_id=p_tenant_id;

  IF v_index IS NOT NULL AND v_disc.session_state='open' AND v_disc.session_expires_at>now() THEN
    UPDATE public.ussd_package_discoveries
    SET session_state='selected',selected_label=p_label,selected_index=v_index,selected_order_id=p_order_id,
        session_expires_at=now()+interval '5 minutes',updated_at=now()
    WHERE id=p_discovery_id AND tenant_id=p_tenant_id;
    RETURN jsonb_build_object('success',true,'mode','held_session','index',v_index);
  END IF;

  IF v_index IS NULL THEN RETURN jsonb_build_object('success',false,'message','Xirmada menu-ga lagama helin'); END IF;

  v_code := '*212*' || v_disc.phone_number || '#|' || replace(coalesce(v_root.package_name,'Data'),',',' ') || ',' ||
            replace(coalesce(nullif(btrim(v_carrier_label),''),p_label),',',' ');

  IF NOT EXISTS (SELECT 1 FROM public.delivery_queue WHERE tenant_id=p_tenant_id AND order_id=p_order_id AND status IN ('pending','processing','completed')) THEN
    INSERT INTO public.delivery_queue(tenant_id,order_id,provider_name,receiver_phone,ussd_code,status,attempts,discovery_menu_label)
    VALUES(p_tenant_id,p_order_id,lower(coalesce(v_root.provider_name,'hormuud')),v_order.receiver_phone,v_code,'pending',0,p_label);
  END IF;
  RETURN jsonb_build_object('success',true,'mode','redial');
END;
$$;

CREATE OR REPLACE FUNCTION public.discovery_delivery_fallback(p_discovery_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.ussd_package_discoveries%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.ussd_package_discoveries WHERE id=p_discovery_id;
  IF NOT FOUND OR v_row.selected_order_id IS NULL OR v_row.selected_label IS NULL THEN RETURN; END IF;
  PERFORM public.enqueue_discovery_selection(v_row.tenant_id,v_row.id,v_row.selected_order_id,v_row.selected_label);
END;
$$;

CREATE OR REPLACE FUNCTION public.discovery_session_lost(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_state text;
BEGIN
  SELECT session_state INTO v_state FROM public.ussd_package_discoveries WHERE id=p_id;
  IF v_state IN ('selected','delivering') THEN RETURN jsonb_build_object('success',true,'skipped',true); END IF;
  UPDATE public.ussd_package_discoveries SET session_state='lost',session_expires_at=NULL,updated_at=now() WHERE id=p_id;
  PERFORM public.discovery_delivery_fallback(p_id);
  RETURN jsonb_build_object('success',true);
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_discovery_selection(p_id uuid,p_success boolean,p_response text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.ussd_package_discoveries%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.ussd_package_discoveries WHERE id=p_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success',false); END IF;
  UPDATE public.ussd_package_discoveries
  SET session_state=CASE WHEN p_success THEN 'consumed' ELSE 'lost' END,session_expires_at=NULL,session_note=p_response,updated_at=now()
  WHERE id=p_id;
  IF v_row.selected_order_id IS NOT NULL THEN
    IF p_success THEN
      UPDATE public.orders SET delivery_status='delivered',delivered_at=now(),delivery_notes=coalesce(p_response,'*212* session delivered')
      WHERE id=v_row.selected_order_id AND tenant_id=v_row.tenant_id;
    ELSE
      PERFORM public.discovery_delivery_fallback(p_id);
    END IF;
  END IF;
  RETURN jsonb_build_object('success',true);
END;
$$;

CREATE OR REPLACE FUNCTION public.release_discovery_session(p_tenant_id uuid,p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.ussd_package_discoveries
  SET session_state='closed',session_expires_at=NULL,session_note='released_by_user',updated_at=now()
  WHERE id=p_id AND tenant_id=p_tenant_id AND session_state='open';
  RETURN jsonb_build_object('success',true);
END;
$$;

CREATE OR REPLACE FUNCTION public.discovery_has_waiting_request()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.ussd_package_discoveries WHERE status='pending' AND queued_at>=now()-interval '5 minutes');
$$;

REVOKE ALL ON FUNCTION public.request_package_discovery(uuid,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_next_discovery(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_discovery(uuid,text,jsonb,text,boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_package_discovery(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_discovery_queue_status(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_discovery_selection(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enqueue_discovery_selection(uuid,uuid,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.discovery_session_lost(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_discovery_selection(uuid,boolean,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_discovery_session(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.discovery_has_waiting_request() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.request_package_discovery(uuid,uuid,text) TO anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.claim_next_discovery(text) TO anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.complete_discovery(uuid,text,jsonb,text,boolean) TO anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_package_discovery(uuid,uuid) TO anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_discovery_queue_status(uuid,uuid) TO anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.claim_discovery_selection(text) TO anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_discovery_selection(uuid,uuid,uuid,text) TO anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.discovery_session_lost(uuid) TO anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.complete_discovery_selection(uuid,boolean,text) TO anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.release_discovery_session(uuid,uuid) TO anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.discovery_has_waiting_request() TO anon,authenticated,service_role;
