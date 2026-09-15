CREATE OR REPLACE FUNCTION public.seed_tenant_from_template(p_target uuid, p_source uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prov int := 0; v_cat int := 0; v_pkg int := 0; v_pay int := 0; v_feat int := 0;
  r record; v_new uuid;
  prov_map jsonb := '{}'::jsonb;
  cat_map  jsonb := '{}'::jsonb;
  pkg_map  jsonb := '{}'::jsonb;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF p_target IS NULL OR p_source IS NULL OR p_target = p_source THEN
    RAISE EXCEPTION 'Source iyo target waa inay kala duwanaadaan';
  END IF;

  -- providers
  FOR r IN SELECT * FROM providers_config WHERE tenant_id = p_source ORDER BY display_order LOOP
    SELECT id INTO v_new FROM providers_config
      WHERE tenant_id = p_target AND lower(provider_name) = lower(r.provider_name) LIMIT 1;
    IF v_new IS NULL THEN
      INSERT INTO providers_config (tenant_id, provider_name, provider_logo, is_active, display_order, evoucher_rate, promotional_text)
      VALUES (p_target, r.provider_name, r.provider_logo, r.is_active, r.display_order, r.evoucher_rate, r.promotional_text)
      RETURNING id INTO v_new;
      v_prov := v_prov + 1;
    END IF;
    prov_map := prov_map || jsonb_build_object(r.id::text, v_new::text);
  END LOOP;

  -- categories
  FOR r IN SELECT * FROM package_categories WHERE tenant_id = p_source ORDER BY display_order LOOP
    SELECT id INTO v_new FROM package_categories
      WHERE tenant_id = p_target AND lower(category_name) = lower(r.category_name) LIMIT 1;
    IF v_new IS NULL THEN
      INSERT INTO package_categories (tenant_id, category_name, display_order, is_active, provider_id, category_image)
      VALUES (p_target, r.category_name, r.display_order, r.is_active,
              NULLIF(prov_map ->> r.provider_id::text, '')::uuid, r.category_image)
      RETURNING id INTO v_new;
      v_cat := v_cat + 1;
    END IF;
    cat_map := cat_map || jsonb_build_object(r.id::text, v_new::text);
  END LOOP;

  -- packages
  FOR r IN SELECT * FROM data_packages_config WHERE tenant_id = p_source ORDER BY display_order LOOP
    SELECT id INTO v_new FROM data_packages_config
      WHERE tenant_id = p_target AND lower(package_name) = lower(r.package_name)
        AND coalesce(data_amount,'') = coalesce(r.data_amount,'') LIMIT 1;
    IF v_new IS NULL THEN
      INSERT INTO data_packages_config (
        tenant_id, package_name, data_amount, validity_days, selling_price, cost_price,
        is_active, category_id, provider_id, connection_type_label, ussd_code, display_order,
        profit_margin, is_discovery_root, is_ussd_only)
      VALUES (
        p_target, r.package_name, r.data_amount, r.validity_days, r.selling_price, r.cost_price,
        r.is_active,
        NULLIF(cat_map ->> r.category_id::text, '')::uuid,
        coalesce(NULLIF(prov_map ->> r.provider_id::text, '')::uuid, r.provider_id),
        r.connection_type_label, r.ussd_code, r.display_order,
        r.profit_margin, r.is_discovery_root, r.is_ussd_only)
      RETURNING id INTO v_new;
      v_pkg := v_pkg + 1;
    END IF;
    pkg_map := pkg_map || jsonb_build_object(r.id::text, v_new::text);
  END LOOP;

  -- payment providers (payment_number intentionally blank)
  FOR r IN SELECT * FROM payment_providers_config WHERE tenant_id = p_source ORDER BY display_order LOOP
    IF NOT EXISTS (SELECT 1 FROM payment_providers_config
                   WHERE tenant_id = p_target AND lower(provider_name) = lower(r.provider_name)) THEN
      INSERT INTO payment_providers_config (
        tenant_id, provider_name, provider_logo, commission_rate, is_active,
        prefix_code, ussd_code_template, payment_number, display_order)
      VALUES (p_target, r.provider_name, r.provider_logo, r.commission_rate, r.is_active,
              r.prefix_code, r.ussd_code_template, NULL, r.display_order);
      v_pay := v_pay + 1;
    END IF;
  END LOOP;

  -- featured packages
  FOR r IN SELECT * FROM featured_packages WHERE tenant_id = p_source ORDER BY display_order LOOP
    v_new := NULLIF(pkg_map ->> r.package_id::text, '')::uuid;
    IF v_new IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM featured_packages WHERE tenant_id = p_target AND package_id = v_new) THEN
      INSERT INTO featured_packages (tenant_id, package_id, display_order, is_active)
      VALUES (p_target, v_new, r.display_order, r.is_active);
      v_feat := v_feat + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('providers', v_prov, 'categories', v_cat, 'packages', v_pkg,
                            'payment_providers', v_pay, 'featured', v_feat);
END;
$$;

REVOKE ALL ON FUNCTION public.seed_tenant_from_template(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seed_tenant_from_template(uuid, uuid) TO authenticated;