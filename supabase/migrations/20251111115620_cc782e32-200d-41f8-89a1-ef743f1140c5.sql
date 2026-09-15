-- Add unique constraint on sender_phone to ensure one sender = one registration
ALTER TABLE public.offline_registrations
ADD CONSTRAINT unique_sender_phone UNIQUE (sender_phone);

-- Add check constraint to ensure sender and receiver are different
ALTER TABLE public.offline_registrations
ADD CONSTRAINT sender_receiver_different 
CHECK (sender_phone <> receiver_phone);

-- Add UPDATE policy for public access (needed for offline registration updates)
CREATE POLICY "Anyone can update registrations"
ON public.offline_registrations
FOR UPDATE
USING (true)
WITH CHECK (true);

-- Comments for clarity
COMMENT ON CONSTRAINT unique_sender_phone ON public.offline_registrations 
IS 'Ensures each sender phone has only one registration record';

COMMENT ON CONSTRAINT sender_receiver_different ON public.offline_registrations 
IS 'Ensures sender and receiver phone numbers are different';