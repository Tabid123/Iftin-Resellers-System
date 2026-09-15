-- Create admin verification codes table for 2FA
CREATE TABLE public.admin_verification_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  code TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.admin_verification_codes ENABLE ROW LEVEL SECURITY;

-- Only allow service role to manage (edge functions will use service role)
CREATE POLICY "Service role can manage verification codes"
ON public.admin_verification_codes
FOR ALL
USING (true)
WITH CHECK (true);

-- Create index for faster lookups
CREATE INDEX idx_admin_verification_user_code ON public.admin_verification_codes(user_id, code);

-- Auto-cleanup old codes (optional trigger)
CREATE OR REPLACE FUNCTION public.cleanup_expired_verification_codes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.admin_verification_codes 
  WHERE expires_at < NOW() OR used = TRUE;
  RETURN NEW;
END;
$$;

CREATE TRIGGER cleanup_old_codes
AFTER INSERT ON public.admin_verification_codes
FOR EACH STATEMENT
EXECUTE FUNCTION public.cleanup_expired_verification_codes();