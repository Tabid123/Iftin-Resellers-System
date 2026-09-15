-- Remove duplicates within the same tenant, keeping the newest row
DELETE FROM public.offline_registrations a
USING public.offline_registrations b
WHERE a.tenant_id = b.tenant_id
  AND a.sender_phone = b.sender_phone
  AND a.created_at < b.created_at;

ALTER TABLE public.offline_registrations
  DROP CONSTRAINT IF EXISTS offline_registrations_sender_phone_key;
ALTER TABLE public.offline_registrations
  DROP CONSTRAINT IF EXISTS offline_registrations_sender_phone_unique;
ALTER TABLE public.offline_registrations
  DROP CONSTRAINT IF EXISTS unique_sender_phone;

ALTER TABLE public.offline_registrations
  ADD CONSTRAINT offline_registrations_tenant_sender_key UNIQUE (tenant_id, sender_phone);