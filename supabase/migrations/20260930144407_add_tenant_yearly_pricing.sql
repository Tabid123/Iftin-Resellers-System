-- Per-reseller yearly commercial pricing.
-- Feature plans remain separate from what each reseller is actually charged.

alter table public.tenants
  add column if not exists first_year_price numeric,
  add column if not exists renewal_yearly_price numeric;

alter table public.tenants
  drop constraint if exists tenants_first_year_price_nonnegative,
  add constraint tenants_first_year_price_nonnegative
    check (first_year_price is null or first_year_price >= 0);

alter table public.tenants
  drop constraint if exists tenants_renewal_yearly_price_nonnegative,
  add constraint tenants_renewal_yearly_price_nonnegative
    check (renewal_yearly_price is null or renewal_yearly_price >= 0);

-- Existing paid resellers follow the current Year-1 standard unless manually
-- corrected from their Manage page. Existing renewal prices stay unknown so
-- the UI can show the $150-$200 expected range without inventing an exact fee.
update public.tenants
   set first_year_price = 50
 where first_year_price is null
   and coalesce(is_demo, false) = false;
