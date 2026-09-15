-- Remove the check constraint that prevents sender = receiver
ALTER TABLE public.offline_registrations
DROP CONSTRAINT IF EXISTS sender_receiver_different;

-- Comment explaining why we allow sender = receiver
COMMENT ON TABLE public.offline_registrations 
IS 'Allows sender_phone = receiver_phone for self top-up scenarios';