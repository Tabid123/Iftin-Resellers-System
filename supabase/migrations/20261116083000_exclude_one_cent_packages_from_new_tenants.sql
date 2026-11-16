-- Prevent the previously removed $0.01 normal packages being seeded into NEW tenants.
-- Preserve the special $0.01 USSD discovery root and every existing order/payment record.
-- This safeguards BOTH tenant-to-tenant copy and the official Iftin master template.

ALTER TABLE private.master_template_packages
  ADD CONSTRAINT master_template_packages_no_bad_cent_price
  CHECK (selling_price <> 0.01 OR is_discovery_root IS TRUE);

CREATE OR REPLACE FUNCTION public.seed_tenant_from_template(p_target uuid, p_source uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  FOR r IN SELECT * FROM data_packages_config
    WHERE tenant_id = p_source
      AND NOT (selling_price = 0.01 AND is_discovery_root IS NOT TRUE)
    ORDER BY display_order LOOP
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
$function$;

CREATE OR REPLACE FUNCTION public.apply_master_template_to_tenant(p_tenant_id uuid, p_template_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_template private.master_templates%rowtype;
  r record;
  v_target uuid;
  v_provider uuid;
  v_category uuid;
  v_package uuid;
  v_root uuid;
  n_providers int := 0;
  n_categories int := 0;
  n_packages int := 0;
  n_delivery int := 0;
  n_prices int := 0;
  n_payments int := 0;
  n_reused int := 0;
  v_result jsonb;
begin
  select * into v_template
  from private.master_templates
  where template_key = p_template_key and is_active = true;
  if not found then raise exception 'template_not_found'; end if;
  if not v_template.is_ready then raise exception 'template_not_ready'; end if;
  if not exists (select 1 from public.tenants where id = p_tenant_id) then
    raise exception 'tenant_not_found';
  end if;

  for r in
    select * from private.master_template_providers
    where template_id = v_template.id order by display_order, id
  loop
    v_target := null;
    select target_id into v_target from private.tenant_template_entities
    where tenant_id = p_tenant_id and template_id = v_template.id
      and entity_type = 'provider' and source_id = r.source_id;
    if v_target is null then
      select id into v_target from public.providers_config
      where tenant_id = p_tenant_id
        and lower(btrim(provider_name)) = lower(btrim(r.provider_name)) limit 1;
      if v_target is null then
        insert into public.providers_config
          (tenant_id, provider_name, provider_logo, is_active, display_order, evoucher_rate, promotional_text)
        values
          (p_tenant_id, r.provider_name, r.provider_logo, r.is_active, r.display_order, r.evoucher_rate, r.promotional_text)
        returning id into v_target;
        n_providers := n_providers + 1;
      else n_reused := n_reused + 1;
      end if;
      insert into private.tenant_template_entities
        (tenant_id, template_id, entity_type, source_id, target_id)
      values (p_tenant_id, v_template.id, 'provider', r.source_id, v_target)
      on conflict do nothing;
    else n_reused := n_reused + 1;
    end if;
  end loop;

  for r in
    select * from private.master_template_categories
    where template_id = v_template.id order by display_order, id
  loop
    v_provider := null;
    v_target := null;
    select target_id into v_provider from private.tenant_template_entities
    where tenant_id = p_tenant_id and template_id = v_template.id
      and entity_type = 'provider' and source_id = r.source_provider_id;
    if v_provider is null then raise exception 'provider_mapping_missing:%', r.source_provider_id; end if;
    select target_id into v_target from private.tenant_template_entities
    where tenant_id = p_tenant_id and template_id = v_template.id
      and entity_type = 'category' and source_id = r.source_id;
    if v_target is null then
      select id into v_target from public.package_categories
      where tenant_id = p_tenant_id and provider_id = v_provider
        and lower(btrim(category_name)) = lower(btrim(r.category_name)) limit 1;
      if v_target is null then
        insert into public.package_categories
          (tenant_id, provider_id, category_name, display_order, is_active, category_image)
        values
          (p_tenant_id, v_provider, r.category_name, r.display_order, r.is_active, r.category_image)
        returning id into v_target;
        n_categories := n_categories + 1;
      else n_reused := n_reused + 1;
      end if;
      insert into private.tenant_template_entities
        (tenant_id, template_id, entity_type, source_id, target_id)
      values (p_tenant_id, v_template.id, 'category', r.source_id, v_target)
      on conflict do nothing;
    else n_reused := n_reused + 1;
    end if;
  end loop;

  for r in
    select * from private.master_template_packages
    where template_id = v_template.id
      AND NOT (selling_price = 0.01 AND is_discovery_root IS NOT TRUE)
    order by display_order, id
  loop
    v_provider := null;
    v_category := null;
    v_target := null;
    select target_id into v_provider from private.tenant_template_entities
    where tenant_id = p_tenant_id and template_id = v_template.id
      and entity_type = 'provider' and source_id = r.source_provider_id;
    if r.source_category_id is not null then
      select target_id into v_category from private.tenant_template_entities
      where tenant_id = p_tenant_id and template_id = v_template.id
        and entity_type = 'category' and source_id = r.source_category_id;
    end if;
    if v_provider is null then raise exception 'provider_mapping_missing:%', r.source_provider_id; end if;
    select target_id into v_target from private.tenant_template_entities
    where tenant_id = p_tenant_id and template_id = v_template.id
      and entity_type = 'package' and source_id = r.source_id;
    if v_target is null then
      select id into v_target from public.data_packages_config
      where tenant_id = p_tenant_id and provider_id = v_provider
        and category_id is not distinct from v_category
        and package_name = r.package_name and data_amount = r.data_amount
        and validity_days = r.validity_days and cost_price = r.cost_price
        and selling_price = r.selling_price limit 1;
      if v_target is null then
        insert into public.data_packages_config
          (tenant_id, provider_id, category_id, package_name, data_amount,
           validity_days, cost_price, selling_price, profit_margin, is_active,
           connection_type_label, ussd_code, display_order, is_discovery_root,
           is_ussd_only, somlink_bundle_id)
        values
          (p_tenant_id, v_provider, v_category, r.package_name, r.data_amount,
           r.validity_days, r.cost_price, r.selling_price, r.profit_margin, r.is_active,
           r.connection_type_label, r.ussd_code, r.display_order, r.is_discovery_root,
           r.is_ussd_only, r.somlink_bundle_id)
        returning id into v_target;
        n_packages := n_packages + 1;
      else n_reused := n_reused + 1;
      end if;
      insert into private.tenant_template_entities
        (tenant_id, template_id, entity_type, source_id, target_id)
      values (p_tenant_id, v_template.id, 'package', r.source_id, v_target)
      on conflict do nothing;
    else n_reused := n_reused + 1;
    end if;
  end loop;

  for r in
    select * from private.master_template_delivery
    where template_id = v_template.id order by execution_order, id
  loop
    v_provider := null;
    v_category := null;
    v_package := null;
    v_target := null;
    if r.source_provider_id is not null then
      select target_id into v_provider from private.tenant_template_entities
      where tenant_id = p_tenant_id and template_id = v_template.id
        and entity_type = 'provider' and source_id = r.source_provider_id;
    end if;
    if r.source_category_id is not null then
      select target_id into v_category from private.tenant_template_entities
      where tenant_id = p_tenant_id and template_id = v_template.id
        and entity_type = 'category' and source_id = r.source_category_id;
    end if;
    if r.source_package_id is not null then
      select target_id into v_package from private.tenant_template_entities
      where tenant_id = p_tenant_id and template_id = v_template.id
        and entity_type = 'package' and source_id = r.source_package_id;
    end if;
    select target_id into v_target from private.tenant_template_entities
    where tenant_id = p_tenant_id and template_id = v_template.id
      and entity_type = 'delivery' and source_id = r.source_id;
    if v_target is null then
      select id into v_target from public.delivery_instructions
      where tenant_id = p_tenant_id
        and provider_id is not distinct from v_provider
        and category_id is not distinct from v_category
        and package_id is not distinct from v_package
        and code_template is not distinct from r.code_template limit 1;
      if v_target is null then
        insert into public.delivery_instructions
          (tenant_id, instruction_type, ussd_code, provider_name, execution_order,
           provider_id, category_id, package_id, code_template, sim_password,
           notes, instruction_template)
        values
          (p_tenant_id, r.instruction_type, r.ussd_code, r.provider_name, r.execution_order,
           v_provider, v_category, v_package, r.code_template, r.sim_password,
           r.notes, r.instruction_template)
        returning id into v_target;
        n_delivery := n_delivery + 1;
      else n_reused := n_reused + 1;
      end if;
      insert into private.tenant_template_entities
        (tenant_id, template_id, entity_type, source_id, target_id)
      values (p_tenant_id, v_template.id, 'delivery', r.source_id, v_target)
      on conflict do nothing;
    else n_reused := n_reused + 1;
    end if;
  end loop;

  for r in
    select * from private.master_template_price_catalog
    where template_id = v_template.id order by id
  loop
    v_root := null;
    v_target := null;
    select target_id into v_root from private.tenant_template_entities
    where tenant_id = p_tenant_id and template_id = v_template.id
      and entity_type = 'package' and source_id = r.source_root_package_id;
    if v_root is null then raise exception 'root_package_mapping_missing:%', r.source_root_package_id; end if;
    select target_id into v_target from private.tenant_template_entities
    where tenant_id = p_tenant_id and template_id = v_template.id
      and entity_type = 'price_catalog' and source_id = r.source_id;
    if v_target is null then
      select id into v_target from public.ussd_price_catalog
      where tenant_id = p_tenant_id and root_package_id = v_root
        and normalized_label = r.normalized_label limit 1;
      if v_target is null then
        insert into public.ussd_price_catalog
          (tenant_id, root_package_id, label, normalized_label, cost_price,
           selling_price, info_line1, info_line2, is_active)
        values
          (p_tenant_id, v_root, r.label, r.normalized_label, r.cost_price,
           r.selling_price, r.info_line1, r.info_line2, r.is_active)
        returning id into v_target;
        n_prices := n_prices + 1;
      else n_reused := n_reused + 1;
      end if;
      insert into private.tenant_template_entities
        (tenant_id, template_id, entity_type, source_id, target_id)
      values (p_tenant_id, v_template.id, 'price_catalog', r.source_id, v_target)
      on conflict do nothing;
    else n_reused := n_reused + 1;
    end if;
  end loop;

  for r in
    select * from private.master_template_payment_providers
    where template_id = v_template.id order by display_order, id
  loop
    v_target := null;
    select target_id into v_target from private.tenant_template_entities
    where tenant_id = p_tenant_id and template_id = v_template.id
      and entity_type = 'payment_provider' and source_id = r.source_id;
    if v_target is null then
      select id into v_target from public.payment_providers_config
      where tenant_id = p_tenant_id
        and lower(btrim(provider_name)) = lower(btrim(r.provider_name)) limit 1;
      if v_target is null then
        insert into public.payment_providers_config
          (tenant_id, provider_name, provider_logo, commission_rate, is_active,
           prefix_code, ussd_code_template, payment_number, display_order)
        values
          (p_tenant_id, r.provider_name, r.provider_logo, r.commission_rate, r.is_active,
           r.prefix_code, r.ussd_code_template, r.payment_number, r.display_order)
        returning id into v_target;
        n_payments := n_payments + 1;
      else n_reused := n_reused + 1;
      end if;
      insert into private.tenant_template_entities
        (tenant_id, template_id, entity_type, source_id, target_id)
      values (p_tenant_id, v_template.id, 'payment_provider', r.source_id, v_target)
      on conflict do nothing;
    else n_reused := n_reused + 1;
    end if;
  end loop;

  v_result := jsonb_build_object(
    'template_key', v_template.template_key,
    'version', v_template.version,
    'inserted', jsonb_build_object(
      'providers', n_providers,
      'categories', n_categories,
      'packages', n_packages,
      'delivery_instructions', n_delivery,
      'price_catalog', n_prices,
      'payment_providers', n_payments
    ),
    'reused', n_reused
  );
  insert into private.tenant_template_applications
    (tenant_id, template_id, template_version, result)
  values (p_tenant_id, v_template.id, v_template.version, v_result);
  return v_result;
end
$function$;

