-- Backfill Somlink template data into all existing tenants without changing
-- any unrelated tenant configuration. Safe to run repeatedly.

do $$
declare
  v_template_id uuid;
  v_somlink_source uuid;
  t record;
  p record;
  c record;
  pkg record;
  v_provider uuid;
  v_category uuid;
  v_package uuid;
begin
  select id into v_template_id
  from private.master_templates
  where template_key = 'xog-dhameystiran-iftin'
  limit 1;

  if v_template_id is null then
    raise exception 'master_template_not_found';
  end if;

  select source_id into v_somlink_source
  from private.master_template_providers
  where template_id = v_template_id
    and lower(btrim(provider_name)) = 'somlink'
  limit 1;

  if v_somlink_source is null then
    raise exception 'somlink_template_provider_not_found';
  end if;

  select * into p
  from private.master_template_providers
  where template_id = v_template_id
    and source_id = v_somlink_source
  limit 1;

  for t in select id from public.tenants loop
    -- Provider
    select id into v_provider
    from public.providers_config
    where tenant_id = t.id
      and lower(btrim(provider_name)) = 'somlink'
    limit 1;

    if v_provider is null then
      insert into public.providers_config
        (tenant_id, provider_name, provider_logo, is_active, display_order, evoucher_rate, promotional_text)
      values
        (t.id, p.provider_name, p.provider_logo, true, p.display_order, p.evoucher_rate, p.promotional_text)
      returning id into v_provider;
    else
      update public.providers_config
      set is_active = true
      where id = v_provider;
    end if;

    insert into private.tenant_template_entities
      (tenant_id, template_id, entity_type, source_id, target_id)
    values (t.id, v_template_id, 'provider', v_somlink_source, v_provider)
    on conflict (tenant_id, template_id, entity_type, source_id)
    do update set target_id = excluded.target_id;

    -- Categories
    for c in
      select *
      from private.master_template_categories
      where template_id = v_template_id
        and source_provider_id = v_somlink_source
      order by display_order, id
    loop
      v_category := null;

      select id into v_category
      from public.package_categories
      where tenant_id = t.id
        and provider_id = v_provider
        and lower(btrim(category_name)) = lower(btrim(c.category_name))
      limit 1;

      if v_category is null then
        insert into public.package_categories
          (tenant_id, provider_id, category_name, display_order, is_active, category_image)
        values
          (t.id, v_provider, c.category_name, c.display_order, true, c.category_image)
        returning id into v_category;
      else
        update public.package_categories
        set is_active = true
        where id = v_category;
      end if;

      insert into private.tenant_template_entities
        (tenant_id, template_id, entity_type, source_id, target_id)
      values (t.id, v_template_id, 'category', c.source_id, v_category)
      on conflict (tenant_id, template_id, entity_type, source_id)
      do update set target_id = excluded.target_id;
    end loop;

    -- Packages
    for pkg in
      select *
      from private.master_template_packages
      where template_id = v_template_id
        and source_provider_id = v_somlink_source
      order by display_order, id
    loop
      v_category := null;
      v_package := null;

      if pkg.source_category_id is not null then
        select target_id into v_category
        from private.tenant_template_entities
        where tenant_id = t.id
          and template_id = v_template_id
          and entity_type = 'category'
          and source_id = pkg.source_category_id
        limit 1;
      end if;

      select id into v_package
      from public.data_packages_config
      where tenant_id = t.id
        and provider_id = v_provider
        and lower(btrim(package_name)) = lower(btrim(pkg.package_name))
        and coalesce(category_id::text, '') = coalesce(v_category::text, '')
      limit 1;

      if v_package is null then
        insert into public.data_packages_config
          (tenant_id, provider_id, category_id, package_name, data_amount, validity_days,
           cost_price, selling_price, profit_margin, is_active, connection_type_label,
           ussd_code, display_order, is_discovery_root, is_ussd_only, somlink_bundle_id)
        values
          (t.id, v_provider, v_category, pkg.package_name, pkg.data_amount, pkg.validity_days,
           pkg.cost_price, pkg.selling_price, pkg.profit_margin, true, pkg.connection_type_label,
           pkg.ussd_code, pkg.display_order, pkg.is_discovery_root, pkg.is_ussd_only, pkg.somlink_bundle_id)
        returning id into v_package;
      else
        update public.data_packages_config
        set is_active = true
        where id = v_package;
      end if;

      insert into private.tenant_template_entities
        (tenant_id, template_id, entity_type, source_id, target_id)
      values (t.id, v_template_id, 'package', pkg.source_id, v_package)
      on conflict (tenant_id, template_id, entity_type, source_id)
      do update set target_id = excluded.target_id;
    end loop;
  end loop;
end
$$;
