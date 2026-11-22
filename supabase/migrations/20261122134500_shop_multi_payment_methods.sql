-- Tenant-controlled payment options for the storefront, while retaining legacy checkout settings.
-- Existing providers are backfilled as a single option; nothing is removed.
alter table public.shop_checkout_settings
  add column if not exists payment_methods jsonb not null default '[]'::jsonb;

alter table public.shop_checkout_settings
  add constraint shop_checkout_payment_methods_array
  check (
    case when jsonb_typeof(payment_methods) = 'array'
      then jsonb_array_length(payment_methods) <= 8
      else false
    end
  );

update public.shop_checkout_settings
set payment_methods = jsonb_build_array(
  jsonb_build_object('id', 'legacy', 'provider', payment_provider, 'number', payment_number)
)
where payment_number <> '' and payment_methods = '[]'::jsonb;

-- Snapshot the method chosen by the buyer from the merchant-owned list.
-- The selection is a transaction-local setting, never a client-supplied payee.
create or replace function private.shop_order_payment_snapshot()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  account public.shop_checkout_settings%rowtype;
  selected_key text := nullif(current_setting('iftin.shop_payment_method', true), '');
  selected jsonb;
begin
  select * into account from public.shop_checkout_settings s
    where s.tenant_id = new.tenant_id;

  if selected_key is not null then
    if account.tenant_id is null then
      raise exception 'Habka lacag-bixinta lama helin';
    end if;

    select m.value into selected
    from jsonb_array_elements(account.payment_methods) as m(value)
    where m.value->>'id' = selected_key
    limit 1;

    if selected is null
      or length(trim(coalesce(selected->>'provider', ''))) not between 1 and 60
      or coalesce(selected->>'number', '') !~ '^\+?[0-9]{7,15}$'
    then
      raise exception 'Habka lacag-bixinta waa isbeddelay. Dib u dooro.';
    end if;

    new.payment_method := 'manual_transfer';
    new.payment_provider := selected->>'provider';
    new.payment_number := selected->>'number';

  elsif account.tenant_id is not null and account.payment_number <> '' then
    -- Preserve the behavior of the existing shop_place_order RPC.
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

-- A separate RPC preserves existing callers. It delegates stock checks,
-- server-owned totals, and order idempotency to shop_place_order.
create or replace function public.shop_place_order_with_method(
  p_token uuid,
  p_name text,
  p_phone text,
  p_address text,
  p_items jsonb,
  p_expected_total numeric,
  p_method_key text
)
returns jsonb
language plpgsql security invoker set search_path = public, pg_temp
as $$
begin
  if p_method_key is null or p_method_key !~ '^[a-zA-Z0-9_-]{1,72}$' then
    raise exception 'Dooro hab lacag-bixin sax ah';
  end if;

  perform set_config('iftin.shop_payment_method', p_method_key, true);
  return public.shop_place_order(
    p_token, p_name, p_phone, p_address, p_items, p_expected_total
  );
end;
$$;

revoke all on function public.shop_place_order_with_method(uuid,text,text,text,jsonb,numeric,text)
  from public, anon, authenticated;
grant execute on function public.shop_place_order_with_method(uuid,text,text,text,jsonb,numeric,text)
  to anon, authenticated;
