-- Record the Super Admin's chosen eCommerce plan separately from reseller billing.
-- Existing enabled tenants remain enabled; no tenant plan or billing fields change.
alter table public.tenant_shop_features
  add column if not exists plan_id uuid references public.subscription_plans(id) on delete set null;

comment on column public.tenant_shop_features.plan_id is
  'Super-admin-selected eCommerce feature plan; does not modify tenants.plan_id or billing_cycle.';
