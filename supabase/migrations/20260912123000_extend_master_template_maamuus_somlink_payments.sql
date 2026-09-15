-- Extend the ready Master Template without changing any existing tenant rows.
-- Existing tenants receive these additions only when the super-admin explicitly
-- runs "apply new template data" for that tenant.

alter table public.data_packages_config
  add column if not exists somlink_bundle_id integer;

alter table public.delivery_queue
  add column if not exists somlink_response jsonb;

alter table private.master_template_packages
  add column if not exists somlink_bundle_id integer;

create table if not exists private.master_template_price_catalog (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references private.master_templates(id) on delete cascade,
  source_id uuid not null,
  source_root_package_id uuid not null,
  label text not null,
  normalized_label text not null,
  cost_price numeric not null default 0,
  selling_price numeric not null default 0,
  info_line1 text,
  info_line2 text,
  is_active boolean not null default true,
  unique (template_id, source_id)
);

create table if not exists private.master_template_payment_providers (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references private.master_templates(id) on delete cascade,
  source_id uuid not null,
  provider_name text not null,
  provider_logo text,
  commission_rate numeric not null default 0,
  is_active boolean not null default false,
  prefix_code text,
  ussd_code_template text,
  payment_number text,
  display_order integer not null default 0,
  unique (template_id, source_id)
);

alter table private.master_template_price_catalog enable row level security;
alter table private.master_template_payment_providers enable row level security;

alter table private.tenant_template_entities
  drop constraint if exists tenant_template_entities_entity_type_check;
alter table private.tenant_template_entities
  add constraint tenant_template_entities_entity_type_check
  check (entity_type in ('provider','category','package','delivery','price_catalog','payment_provider'));

-- Hold the template unavailable while its version-2 snapshot is assembled.
update private.master_templates
set is_ready = false, updated_at = now()
where template_key = 'xog-dhameystiran-iftin';

-- Maamuus: one category and the three *212* discovery roots used by Riyokaab.
with template as (
  select id from private.master_templates where template_key = 'xog-dhameystiran-iftin'
), hormuud as (
  select p.source_id
  from private.master_template_providers p
  join template t on t.id = p.template_id
  where lower(btrim(p.provider_name)) = 'hormuud'
  limit 1
)
insert into private.master_template_categories
  (template_id, source_id, source_provider_id, category_name, display_order, is_active, category_image)
select t.id, md5('xog-dhameystiran-iftin:category:maamuus')::uuid,
       h.source_id, 'Maamuus', 0, true, null
from template t cross join hormuud h
on conflict (template_id, source_id) do update set
  source_provider_id = excluded.source_provider_id,
  category_name = excluded.category_name,
  display_order = excluded.display_order,
  is_active = excluded.is_active,
  category_image = excluded.category_image;

with template as (
  select id from private.master_templates where template_key = 'xog-dhameystiran-iftin'
), hormuud as (
  select p.source_id
  from private.master_template_providers p
  join template t on t.id = p.template_id
  where lower(btrim(p.provider_name)) = 'hormuud'
  limit 1
), roots(package_key, package_name, display_order) as (
  values
    ('data', 'Data', 1),
    ('kuhadal', 'Kuhadal', 2),
    ('data-iyo-kuhadal', 'Data iyo Kuhadal', 3)
)
insert into private.master_template_packages
  (template_id, source_id, source_provider_id, source_category_id,
   package_name, data_amount, validity_days, cost_price, selling_price,
   profit_margin, is_active, connection_type_label, ussd_code, display_order,
   is_discovery_root, is_ussd_only, somlink_bundle_id)
select t.id,
       md5('xog-dhameystiran-iftin:package:maamuus:' || r.package_key)::uuid,
       h.source_id,
       md5('xog-dhameystiran-iftin:category:maamuus')::uuid,
       r.package_name, 'Live *212*', 'Live', 0, 0, 0, true,
       'Discovery', null, r.display_order, true, false, null
from template t cross join hormuud h cross join roots r
on conflict (template_id, source_id) do update set
  source_provider_id = excluded.source_provider_id,
  source_category_id = excluded.source_category_id,
  package_name = excluded.package_name,
  data_amount = excluded.data_amount,
  validity_days = excluded.validity_days,
  cost_price = excluded.cost_price,
  selling_price = excluded.selling_price,
  profit_margin = excluded.profit_margin,
  is_active = excluded.is_active,
  connection_type_label = excluded.connection_type_label,
  ussd_code = excluded.ussd_code,
  display_order = excluded.display_order,
  is_discovery_root = excluded.is_discovery_root,
  is_ussd_only = excluded.is_ussd_only,
  somlink_bundle_id = excluded.somlink_bundle_id;

-- The complete Riyokaab *212* price catalog (20 rows).
with template as (
  select id from private.master_templates where template_key = 'xog-dhameystiran-iftin'
), prices(root_key, label, cost_price, selling_price) as (
  values
    ('data', 'Internet aan xadidnayn, 1 Saac', 0.10::numeric, 0.11::numeric),
    ('data', 'Internet aan xadidnayn, 3 Saac', 0.15::numeric, 0.17::numeric),
    ('data', 'Internet aan xadidnayn, 8 Saac', 0.25::numeric, 0.25::numeric),
    ('data', 'Internet aan xadidnayn, 20 Saac', 0.50::numeric, 0.50::numeric),
    ('data', 'Internet aan xadidnayn, 24 Saac', 0.60::numeric, 0.60::numeric),
    ('data', '12GB,30 Maalin', 5.00::numeric, 5.00::numeric),
    ('data', 'Internet aan xadidnayn, 15 Maalin', 9.00::numeric, 9.00::numeric),
    ('data', 'Internet aan xadidnayn, 30 Maalin', 18.00::numeric, 18.00::numeric),
    ('kuhadal', 'kuhadal aan xadidnayn, 3 saac', 0.10::numeric, 0.11::numeric),
    ('kuhadal', 'kuhadal aan xadidneyn, 6saac', 0.15::numeric, 0.16::numeric),
    ('kuhadal', 'kuhadal aan xadidneyn, 15 saac', 0.25::numeric, 0.27::numeric),
    ('kuhadal', 'kuhadal aan xadidneyn, 36 saac', 0.50::numeric, 0.55::numeric),
    ('kuhadal', 'kuhadal aan xadidneyn,7 maalin', 2.50::numeric, 2.70::numeric),
    ('kuhadal', 'Kuhadal aan xadidneyn, 30 Maalin', 8.00::numeric, 8.50::numeric),
    ('data-iyo-kuhadal', 'internet iyo kuhadal aan xadidneyn,24 saac', 0.60::numeric, 0.60::numeric),
    ('data-iyo-kuhadal', 'internet+kuhadal aan xadidnayn,40 saac', 1.00::numeric, 1.00::numeric),
    ('data-iyo-kuhadal', 'Unlimit data iyo voice,2 maalin', 1.60::numeric, 1.65::numeric),
    ('data-iyo-kuhadal', 'internet iyo kuhadal aan xadidnayn,7 maalin', 4.20::numeric, 4.20::numeric),
    ('data-iyo-kuhadal', 'internet iyo kuhadal aan xadidnayn, 15 maalin', 9.00::numeric, 9.00::numeric),
    ('data-iyo-kuhadal', 'internet iyo kuhadal aan xadidneyn,30 maalin', 18.00::numeric, 18.00::numeric)
)
insert into private.master_template_price_catalog
  (template_id, source_id, source_root_package_id, label, normalized_label,
   cost_price, selling_price, info_line1, info_line2, is_active)
select t.id,
       md5('xog-dhameystiran-iftin:price:' || p.root_key || ':' || p.label)::uuid,
       md5('xog-dhameystiran-iftin:package:maamuus:' || p.root_key)::uuid,
       p.label, public.ussd_normalize_label(p.label), p.cost_price, p.selling_price,
       null, null, true
from template t cross join prices p
on conflict (template_id, source_id) do update set
  source_root_package_id = excluded.source_root_package_id,
  label = excluded.label,
  normalized_label = excluded.normalized_label,
  cost_price = excluded.cost_price,
  selling_price = excluded.selling_price,
  info_line1 = excluded.info_line1,
  info_line2 = excluded.info_line2,
  is_active = excluded.is_active;

-- Somlink: categories and bundle-id delivery mappings from Riyokaab.
with template as (
  select id from private.master_templates where template_key = 'xog-dhameystiran-iftin'
), somlink as (
  select p.source_id
  from private.master_template_providers p
  join template t on t.id = p.template_id
  where lower(btrim(p.provider_name)) = 'somlink'
  limit 1
), categories(category_key, category_name, display_order) as (
  values
    ('kaafiye', 'Kaafiye', 1),
    ('kulmis', 'Kulmis', 2),
    ('promotion', 'Promotion', 3)
)
insert into private.master_template_categories
  (template_id, source_id, source_provider_id, category_name, display_order, is_active, category_image)
select t.id,
       md5('xog-dhameystiran-iftin:category:somlink:' || c.category_key)::uuid,
       s.source_id, c.category_name, c.display_order, true, null
from template t cross join somlink s cross join categories c
on conflict (template_id, source_id) do update set
  source_provider_id = excluded.source_provider_id,
  category_name = excluded.category_name,
  display_order = excluded.display_order,
  is_active = excluded.is_active,
  category_image = excluded.category_image;

with template as (
  select id from private.master_templates where template_key = 'xog-dhameystiran-iftin'
), somlink as (
  select p.source_id
  from private.master_template_providers p
  join template t on t.id = p.template_id
  where lower(btrim(p.provider_name)) = 'somlink'
  limit 1
), packages(category_key, package_key, package_name, data_amount, validity_days,
             selling_price, cost_price, connection_type_label, display_order, bundle_id) as (
  values
    ('kaafiye','kaafiye-1gb-1gb','Kaafiye 1GB+1GB','1GB+1GB','30',0.5::numeric,0.5::numeric,'Data',1,20060),
    ('kaafiye','kaafiye-3gb-3gb','Kaafiye 3GB+3GB','3GB+3GB','30',1::numeric,1::numeric,'Data',2,20061),
    ('kaafiye','kaafiye-16gb-16gb','Kaafiye 16GB+16GB','16GB+16GB','30',5::numeric,5::numeric,'Data',3,20062),
    ('kaafiye','kaafiye-35gb-35gb','Kaafiye 35GB+35GB','35GB+35GB','30',10::numeric,10::numeric,'Data',4,20063),
    ('kaafiye','night-2gb','Night 2GB (10PM-7AM)','2GB','1',0.2::numeric,0.2::numeric,'Night',5,30),
    ('kulmis','kulmis-900mb','Kulmis 900MB+30Min+50SMS','900MB+30Min+50SMS','30',0.5::numeric,0.5::numeric,'Data+Min+SMS',1,25),
    ('kulmis','kulmis-2gb','Kulmis 2GB+150Min+70SMS','2GB+150Min+70SMS','30',1::numeric,1::numeric,'Data+Min+SMS',2,24),
    ('kulmis','kulmis-13gb','Kulmis 13GB+500Min+200SMS','13GB+500Min+200SMS','30',5::numeric,5::numeric,'Data+Min+SMS',3,26),
    ('kulmis','kulmis-30gb','Kulmis 30GB+700Min+300SMS','30GB+700Min+300SMS','60',10::numeric,10::numeric,'Data+Min+SMS',4,27),
    ('promotion','unlimited-24hr','Unlimited 24hr','Unlimited','1',0.5::numeric,0.5::numeric,'Unlimited',1,20071),
    ('promotion','unlimited-7-days','Unlimited 7 days','Unlimited','7',3::numeric,3::numeric,'Unlimited',2,20094),
    ('promotion','unlimited-10-days','Unlimited 10 days','Unlimited','10',1::numeric,1::numeric,'Unlimited',3,20103),
    ('promotion','unlimited-30-days','Unlimited 30 days','Unlimited','30',15::numeric,15::numeric,'Unlimited',4,11)
)
insert into private.master_template_packages
  (template_id, source_id, source_provider_id, source_category_id,
   package_name, data_amount, validity_days, cost_price, selling_price,
   profit_margin, is_active, connection_type_label, ussd_code, display_order,
   is_discovery_root, is_ussd_only, somlink_bundle_id)
select t.id,
       md5('xog-dhameystiran-iftin:package:somlink:' || p.package_key)::uuid,
       s.source_id,
       md5('xog-dhameystiran-iftin:category:somlink:' || p.category_key)::uuid,
       p.package_name, p.data_amount, p.validity_days, p.cost_price, p.selling_price,
       0, true, p.connection_type_label, null, p.display_order, false, false, p.bundle_id
from template t cross join somlink s cross join packages p
on conflict (template_id, source_id) do update set
  source_provider_id = excluded.source_provider_id,
  source_category_id = excluded.source_category_id,
  package_name = excluded.package_name,
  data_amount = excluded.data_amount,
  validity_days = excluded.validity_days,
  cost_price = excluded.cost_price,
  selling_price = excluded.selling_price,
  profit_margin = excluded.profit_margin,
  is_active = excluded.is_active,
  connection_type_label = excluded.connection_type_label,
  ussd_code = excluded.ussd_code,
  display_order = excluded.display_order,
  is_discovery_root = excluded.is_discovery_root,
  is_ussd_only = excluded.is_ussd_only,
  somlink_bundle_id = excluded.somlink_bundle_id;

-- Payment-method slots are cloned independently. They stay inactive and have no
-- payment number until the new tenant enters its own company receiving number.
with template as (
  select id from private.master_templates where template_key = 'xog-dhameystiran-iftin'
), methods(method_key, provider_name, provider_logo, prefix_code, ussd_code_template, display_order) as (
  values
    ('evc-plus','EVC Plus','/storage/payment-logos/evc.png','61,77','*712*{payment_number}*{amount}#',1),
    ('jeeb','Jeeb','/storage/payment-logos/jeeb.jpg','68','*812*{payment_number}*{amount}#',2),
    ('e-dahab','E-Dahab',null,'62',null,3),
    ('premier-bank','Premier Bank',null,null,null,4)
)
insert into private.master_template_payment_providers
  (template_id, source_id, provider_name, provider_logo, commission_rate,
   is_active, prefix_code, ussd_code_template, payment_number, display_order)
select t.id,
       md5('xog-dhameystiran-iftin:payment:' || m.method_key)::uuid,
       m.provider_name, m.provider_logo, 0, false, m.prefix_code,
       m.ussd_code_template, null, m.display_order
from template t cross join methods m
on conflict (template_id, source_id) do update set
  provider_name = excluded.provider_name,
  provider_logo = excluded.provider_logo,
  commission_rate = excluded.commission_rate,
  is_active = excluded.is_active,
  prefix_code = excluded.prefix_code,
  ussd_code_template = excluded.ussd_code_template,
  payment_number = excluded.payment_number,
  display_order = excluded.display_order;

create or replace function public.apply_master_template_to_tenant(
  p_tenant_id uuid,
  p_template_key text
)
returns jsonb
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $$
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
    where template_id = v_template.id order by display_order, id
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
$$;

revoke all on function public.apply_master_template_to_tenant(uuid, text)
from public, anon, authenticated;
grant execute on function public.apply_master_template_to_tenant(uuid, text)
to service_role;

update private.master_templates
set version = 2, is_ready = true, updated_at = now()
where template_key = 'xog-dhameystiran-iftin';

