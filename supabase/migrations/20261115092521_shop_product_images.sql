-- Keep the legacy cover URL for existing app clients and order snapshots.
-- Uploads reuse the existing public category-images bucket with tenant-folder RLS.
alter table public.shop_products
  add column image_urls text[] not null default '{}'::text[],
  add constraint shop_products_image_urls_limit check (
    cardinality(image_urls) <= 8
    and (cardinality(image_urls) = 0 or array_ndims(image_urls) = 1)
    and array_position(image_urls, null) is null
  );
