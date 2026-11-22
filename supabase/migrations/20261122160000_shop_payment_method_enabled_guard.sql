-- Enforce the merchant's payment-method ON/OFF state at order creation.
-- A disabled payment option cannot be selected by a crafted checkout request.
create or replace function private.shop_order_payment_snapshot()
returns trigger
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  account public.shop_checkout_settings%rowtype;
  selected_key text := nullif(current_setting('iftin.shop_payment_method', true), '');
  selected jsonb;
begin
  select * into account
  from public.shop_checkout_settings s
  where s.tenant_id = new.tenant_id;

  if selected_key is not null then
    if account.tenant_id is null then
      raise exception 'Habka lacag-bixinta lama helin';
    end if;

    select m.value into selected
    from jsonb_array_elements(account.payment_methods) as m(value)
    where m.value->>'id' = selected_key
      and coalesce(m.value->>'enabled', 'true') = 'true'
    limit 1;

    if selected is null
      or length(trim(coalesce(selected->>'provider', ''))) not between 1 and 60
      or coalesce(selected->>'number', '') !~ '^\+?[0-9]{7,15}$'
    then
      raise exception 'Habka lacag-bixinta waa xiran yahay ama wuu isbeddelay. Dib u dooro.';
    end if;

    new.payment_method := 'manual_transfer';
    new.payment_provider := selected->>'provider';
    new.payment_number := selected->>'number';

  elsif account.tenant_id is not null then
    -- Older checkouts still use the first ENABLED merchant payment method.
    -- If every method is OFF, do not silently use an old payment_number.
    if jsonb_array_length(account.payment_methods) > 0 then
      select m.value into selected
      from jsonb_array_elements(account.payment_methods) as m(value)
      where coalesce(m.value->>'enabled', 'true') = 'true'
        and length(trim(coalesce(m.value->>'provider',''))) between 1 and 60
        and coalesce(m.value->>'number','') ~ '^\+?[0-9]{7,15}$'
      limit 1;
    elsif account.payment_number <> '' then
      selected := jsonb_build_object(
        'provider', account.payment_provider,
        'number', account.payment_number
      );
    end if;

    if selected is not null then
      new.payment_method := 'manual_transfer';
      new.payment_number := selected->>'number';
      new.payment_provider := selected->>'provider';
    else
      new.payment_method := 'cash_on_delivery';
      new.payment_number := null;
      new.payment_provider := null;
    end if;
  else
    new.payment_method := 'cash_on_delivery';
    new.payment_number := null;
    new.payment_provider := null;
  end if;

  return new;
end;
$$;
