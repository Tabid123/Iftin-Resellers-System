-- Per-tenant payment and support settings. Storefront sees only its own enabled shop.
create table public.shop_checkout_settings (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  payment_provider text not null default 'EVC Plus'
    check (length(payment_provider) between 1 and 60),
  payment_number text not null default ''
    check (payment_number = '' or payment_number ~ '^\+?[0-9]{7,15}$'),
  support_whatsapp text not null default ''
    check (support_whatsapp = '' or support_whatsapp ~ '^\+?[0-9]{7,15}$'),
  support_call text not null default ''
    check (support_call = '' or support_call ~ '^\+?[0-9]{7,15}$'),
  updated_at timestamptz not null default now()
);
alter table public.shop_checkout_settings enable row level security;
revoke all on public.shop_checkout_settings from public, anon, authenticated;
grant select on public.shop_checkout_settings to anon, authenticated;
grant insert, update on public.shop_checkout_settings to authenticated;
grant all on public.shop_checkout_settings to service_role;

create policy shop_checkout_settings_public on public.shop_checkout_settings
  for select to anon, authenticated
  using (tenant_id = public.current_request_tenant_id() and public.shop_is_enabled());
create policy shop_checkout_settings_owner on public.shop_checkout_settings
  for all to authenticated
  using (tenant_id = public.current_request_tenant_id() and public.shop_is_enabled()
    and private.shop_owner(tenant_id))
  with check (tenant_id = public.current_request_tenant_id() and public.shop_is_enabled()
    and private.shop_owner(tenant_id));

-- Record what the customer was asked to pay when an order was placed.
-- The existing stock-reserving shop_place_order RPC remains unchanged.
alter table public.shop_orders drop constraint shop_orders_payment_method_check;
alter table public.shop_orders add constraint shop_orders_payment_method_check
  check (payment_method in ('cash_on_delivery', 'manual_transfer'));
alter table public.shop_orders add column payment_number text;
alter table public.shop_orders add column payment_provider text;

create function private.shop_order_payment_snapshot()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  account public.shop_checkout_settings%rowtype;
begin
  select * into account from public.shop_checkout_settings s
    where s.tenant_id = new.tenant_id and s.payment_number <> '';
  if found then
    new.payment_method := 'manual_transfer';
    new.payment_number := account.payment_number;
    new.payment_provider := account.payment_provider;
  else
    new.payment_method := 'cash_on_delivery';
    new.payment_number := null;
    new.payment_provider := null;
  end if;
  return new;
end;
$$;
revoke all on function private.shop_order_payment_snapshot() from public, anon, authenticated;
create trigger shop_order_payment_snapshot
  before insert on public.shop_orders
  for each row execute function private.shop_order_payment_snapshot();

-- A receipt token only reveals orders belonging to its tenant, as before.
create or replace function public.shop_order_history(p_tokens uuid[])
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(to_jsonb(o) order by o.created_at desc), '[]'::jsonb)
  from (
    select id, created_at, status, items, total, payment_method,
           payment_number, payment_provider
    from public.shop_orders
    where tenant_id = public.current_request_tenant_id()
      and receipt_token = any(p_tokens[1:50])
  ) o;
$$;
revoke all on function public.shop_order_history(uuid[]) from public;
grant execute on function public.shop_order_history(uuid[]) to anon, authenticated;
