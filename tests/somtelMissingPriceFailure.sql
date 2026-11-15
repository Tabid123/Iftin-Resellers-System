-- Regression checks for Somtel USSD rejection; all must return true.
-- Safe read-only verification: no USSD actions or order mutations.
select
  public.is_provider_delivery_failure('Mustaf, qiimaha aad gelisay ma jiro, fadlan iska hubi. Mahadsanid!') as rejects_missing_price,
  public.is_provider_delivery_failure('Moahmud, qiimaha aad gelisay ma jiro, fadlan iska hubi. Mahadsanid!') as rejects_other_customer,
  public.is_provider_delivery_failure('Unrecognized mobile number') as preserves_old_failure,
  not public.is_provider_delivery_failure('Successfully sent internet data') as preserves_success,
  not public.is_provider_delivery_failure('Select your package 1. Daily 2. Weekly') as preserves_menu;

-- No completed queue row may retain this explicit provider rejection.
select count(*) as invalid_price_marked_completed
from public.delivery_queue
where status = 'completed'
  and lower(coalesce(provider_response, '')) like '%qiimaha aad gelisay ma jiro%';
