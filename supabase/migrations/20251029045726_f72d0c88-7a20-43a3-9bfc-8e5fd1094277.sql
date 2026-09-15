-- Create table for verified phone numbers
CREATE TABLE public.verified_phones (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  phone_number TEXT NOT NULL UNIQUE,
  verification_code TEXT,
  verified_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_login_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.verified_phones ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert (when they verify)
CREATE POLICY "Anyone can insert verified phone"
ON public.verified_phones
FOR INSERT
WITH CHECK (true);

-- Allow anyone to update their own last login
CREATE POLICY "Anyone can update verified phone"
ON public.verified_phones
FOR UPDATE
USING (true);

-- Only admins can view all verified phones
CREATE POLICY "Only admins can view verified phones"
ON public.verified_phones
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_verified_phones_updated_at
BEFORE UPDATE ON public.verified_phones
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();