-- Add UNIQUE constraint to sender_phone to prevent duplicates
ALTER TABLE public.offline_registrations
ADD CONSTRAINT offline_registrations_sender_phone_unique UNIQUE (sender_phone);

-- Comment explaining the constraint
COMMENT ON CONSTRAINT offline_registrations_sender_phone_unique ON public.offline_registrations 
IS 'Ensures each sender_phone can only be registered once. Updates will modify the existing record.';