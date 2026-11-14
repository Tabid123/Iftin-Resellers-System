-- Additive, opt-in eCommerce. No existing tenant is enabled automatically.
create table public.tenant_shop_features (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  enabled boolean not null default false
);
alter table public.tenant_shop_features enable row level security;
revoke all on public.tenant_shop_features from anon, authenticated;
grant select on public.tenant_shop_features to anon, authenticated;
grant insert, update, delete on public.tenant_shop_features to authenticated;
grant all on public.tenant_shop_features to service_role;
create policy shop_feature_read on public.tenant_shop_features for select using
  (tenant_id = public.current_request_tenant_id() or public.is_super_admin());
create policy shop_feature_control on public.tenant_shop_features for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

create or replace function public.shop_is_enabled() returns boolean language sql stable security invoker set search_path = public as $$
  select exists (select 1 from public.tenant_shop_features where tenant_id = public.current_request_tenant_id() and enabled);
$$;
revoke all on function public.shop_is_enabled() from public;
grant execute on function public.shop_is_enabled() to anon, authenticated;

-- Tenant owners manage the shop; staff cannot promote themselves or enable it.
create or replace function private.shop_owner(p_tenant uuid) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select auth.uid() is not null and (public.is_super_admin() or exists (
    select 1 from public.tenant_members where tenant_id = p_tenant and user_id = auth.uid() and role = 'owner'
  ));
$$;
revoke all on function private.shop_owner(uuid) from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.shop_owner(uuid) to authenticated;

create table public.shop_categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 100),
  image_url text not null default '' check (image_url = '' or image_url like 'https://%'),
  active boolean not null default true,
  unique (tenant_id, id)
);
create index shop_categories_tenant_idx on public.shop_categories(tenant_id);
create table public.shop_products (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  category_id uuid not null,
  name text not null check (length(trim(name)) between 1 and 150),
  description text not null default '' check (length(description) <= 4000),
  image_url text not null default '' check (image_url = '' or image_url like 'https://%'),
  price numeric(12,2) not null check (price >= 0 and price <= 1000000),
  stock integer not null default 0 check (stock >= 0),
  active boolean not null default true,
  foreign key (tenant_id, category_id) references public.shop_categories(tenant_id, id)
);
create index shop_products_tenant_category_idx on public.shop_products(tenant_id, category_id);
alter table public.shop_categories enable row level security;
alter table public.shop_products enable row level security;
revoke all on public.shop_categories, public.shop_products from anon, authenticated;
grant select on public.shop_categories, public.shop_products to anon, authenticated;
grant insert, update, delete on public.shop_categories, public.shop_products to authenticated;
grant all on public.shop_categories, public.shop_products to service_role;
create policy shop_categories_public on public.shop_categories for select using
  (tenant_id = public.current_request_tenant_id() and active and public.shop_is_enabled());
create policy shop_categories_owner on public.shop_categories for all to authenticated using
  (tenant_id = public.current_request_tenant_id() and public.shop_is_enabled() and private.shop_owner(tenant_id)) with check
  (tenant_id = public.current_request_tenant_id() and public.shop_is_enabled() and private.shop_owner(tenant_id));
create policy shop_products_public on public.shop_products for select using
  (tenant_id = public.current_request_tenant_id() and active and public.shop_is_enabled() and exists
    (select 1 from public.shop_categories c where c.id = category_id and c.tenant_id = shop_products.tenant_id and c.active));
create policy shop_products_owner on public.shop_products for all to authenticated using
  (tenant_id = public.current_request_tenant_id() and public.shop_is_enabled() and private.shop_owner(tenant_id)) with check
  (tenant_id = public.current_request_tenant_id() and public.shop_is_enabled() and private.shop_owner(tenant_id));

create table public.shop_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  receipt_token uuid not null,
  customer_name text not null,
  phone text not null,
  address text not null,
  items jsonb not null,
  total numeric(14,2) not null,
  payment_method text not null default 'cash_on_delivery' check (payment_method = 'cash_on_delivery'),
  status text not null default 'received' check (status in ('received','preparing','dispatched','delivered','cancelled')),
  created_at timestamptz not null default now(),
  unique (tenant_id, receipt_token)
);
create index shop_orders_tenant_created_idx on public.shop_orders(tenant_id, created_at desc);
alter table public.shop_orders enable row level security;
revoke all on public.shop_orders from anon, authenticated;
grant select on public.shop_orders to authenticated;
grant update(status) on public.shop_orders to authenticated;
grant all on public.shop_orders to service_role;
create policy shop_orders_owner_read on public.shop_orders for select to authenticated using
  (tenant_id = public.current_request_tenant_id() and public.shop_is_enabled() and private.shop_owner(tenant_id));
create policy shop_orders_owner_update on public.shop_orders for update to authenticated using
  (tenant_id = public.current_request_tenant_id() and public.shop_is_enabled() and private.shop_owner(tenant_id)) with check
  (tenant_id = public.current_request_tenant_id() and public.shop_is_enabled() and private.shop_owner(tenant_id));

-- Guest storefront has phone-only login. Unpredictable private receipt tokens
-- provide order access; knowing a phone number or changing x-tenant-id does not.
-- Definer is necessary for atomic stock reservation and server-owned pricing.
create function public.shop_place_order(p_token uuid, p_name text, p_phone text, p_address text, p_items jsonb, p_expected_total numeric)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  tid uuid := public.current_request_tenant_id();
  item jsonb; product public.shop_products%rowtype; qty integer;
  snapshot jsonb := '[]'; amount numeric := 0; oid uuid;
begin
  if tid is null or p_token is null then raise exception 'Dukaan aan sax ahayn'; end if;
  -- Serialize retries of the same receipt without blocking other customers.
  perform pg_advisory_xact_lock(hashtextextended(tid::text || p_token::text, 0));
  perform 1 from public.tenant_shop_features f join public.tenants t on t.id = f.tenant_id
    where f.tenant_id = tid and f.enabled and t.status in ('active','trial')
    and (case when t.status = 'active' then t.current_period_end else coalesce(t.trial_ends_at,t.current_period_end) end is null
      or case when t.status = 'active' then t.current_period_end else coalesce(t.trial_ends_at,t.current_period_end) end > now()) for share of f, t;
  if not found then raise exception 'Dukaanku ma furna'; end if;
  select id into oid from public.shop_orders where tenant_id = tid and receipt_token = p_token;
  if found then return jsonb_build_object('id', oid, 'token', p_token); end if;
  if p_name is null or length(trim(p_name)) not between 1 and 100
    or p_phone is null or p_phone !~ '^\+?[0-9]{9,15}$'
    or p_address is null or length(trim(p_address)) not between 5 and 500 then raise exception 'Hubi magaca, telefoonka iyo cinwaanka'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'Dambiisha aan sax ahayn'; end if;
  if jsonb_array_length(p_items) not between 1 and 50 then raise exception 'Dambiisha aan sax ahayn'; end if;
  if (select count(distinct x->>'product_id') from jsonb_array_elements(p_items) x) <> jsonb_array_length(p_items) then raise exception 'Alaab soo noqnoqotay'; end if;
  -- Stable lock order prevents deadlocks for carts containing the same products.
  for item in select value from jsonb_array_elements(p_items) order by value->>'product_id' loop
    if coalesce(item->>'quantity','') !~ '^[1-9][0-9]?$' then raise exception 'Tirada aan sax ahayn'; end if;
    qty := (item->>'quantity')::integer;
    select p.* into product from public.shop_products p join public.shop_categories c on c.id = p.category_id and c.tenant_id = p.tenant_id
      where p.id = (item->>'product_id')::uuid and p.tenant_id = tid and p.active and c.active for update of p;
    if not found then raise exception 'Alaabtan hadda lama heli karo'; end if;
    if product.stock < qty then raise exception 'Stock kuma filna: %', product.name; end if;
    update public.shop_products set stock = stock - qty where id = product.id;
    amount := amount + product.price * qty;
    snapshot := snapshot || jsonb_build_array(jsonb_build_object('product_id', product.id, 'name', product.name, 'quantity', qty, 'price', product.price));
  end loop;
  if p_expected_total is null or p_expected_total <> amount then raise exception 'Qiimaha waa isbeddelay. Dib u fur dambiisha.'; end if;
  insert into public.shop_orders(tenant_id, receipt_token, customer_name, phone, address, items, total)
    values(tid,p_token,trim(p_name),p_phone,trim(p_address),snapshot,amount) returning id into oid;
  return jsonb_build_object('id',oid,'token',p_token);
end;
$$;
revoke all on function public.shop_place_order(uuid,text,text,text,jsonb,numeric) from public;
grant execute on function public.shop_place_order(uuid,text,text,text,jsonb,numeric) to anon, authenticated;

create function public.shop_order_history(p_tokens uuid[]) returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(to_jsonb(o) order by o.created_at desc), '[]'::jsonb) from (
    select id, created_at, status, items, total, payment_method from public.shop_orders
    where tenant_id = public.current_request_tenant_id() and receipt_token = any(p_tokens[1:50])
  ) o;
$$;
revoke all on function public.shop_order_history(uuid[]) from public;
grant execute on function public.shop_order_history(uuid[]) to anon, authenticated;

-- Cancel once, replenish inventory once; terminal orders cannot be reopened.
create function private.shop_order_transition() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare item jsonb;
begin
  if old.status = new.status then return new; end if;
  if old.status in ('delivered','cancelled') then raise exception 'Dalab dhammaaday lama beddeli karo'; end if;
  if new.status <> 'cancelled' and not ((old.status = 'received' and new.status = 'preparing') or
    (old.status = 'preparing' and new.status = 'dispatched') or (old.status = 'dispatched' and new.status = 'delivered')) then
    raise exception 'Tallaabada dalabka aan sax ahayn'; end if;
  if new.status = 'cancelled' then
    for item in select value from jsonb_array_elements(old.items) order by value->>'product_id' loop
      update public.shop_products set stock = stock + (item->>'quantity')::integer
        where id = (item->>'product_id')::uuid and tenant_id = old.tenant_id;
    end loop;
  end if;
  return new;
end;
$$;
revoke all on function private.shop_order_transition() from public, anon, authenticated;
create trigger shop_order_transition before update of status on public.shop_orders for each row execute function private.shop_order_transition();
