-- Cover WaafiPay ledger foreign keys used by package/provider reconciliation.
create index if not exists idx_waafipay_transactions_package
  on public.waafipay_transactions (package_id);

create index if not exists idx_waafipay_transactions_payment_provider
  on public.waafipay_transactions (payment_provider_id)
  where payment_provider_id is not null;
