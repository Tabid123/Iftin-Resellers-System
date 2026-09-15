alter table public.data_packages_config
  add column if not exists secret_prices numeric[] not null default '{}'::numeric[];

create index if not exists idx_packages_secret_prices
  on public.data_packages_config using gin (secret_prices);
