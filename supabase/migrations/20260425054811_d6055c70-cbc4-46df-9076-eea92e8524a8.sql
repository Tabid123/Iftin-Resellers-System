-- Enable pgcrypto for bcrypt hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =====================================================
-- 1) BANK CREDENTIALS
-- =====================================================
CREATE TABLE public.bank_credentials (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.bank_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage bank credentials"
ON public.bank_credentials FOR ALL
TO authenticated
USING (is_admin(auth.uid()))
WITH CHECK (is_admin(auth.uid()));

-- =====================================================
-- 2) BANK SESSIONS (JWT tokens issued to bank)
-- =====================================================
CREATE TABLE public.bank_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  credential_id UUID NOT NULL REFERENCES public.bank_credentials(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_bank_sessions_token ON public.bank_sessions(token);
CREATE INDEX idx_bank_sessions_expires ON public.bank_sessions(expires_at);

ALTER TABLE public.bank_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read bank sessions"
ON public.bank_sessions FOR SELECT
TO authenticated
USING (is_admin(auth.uid()));

-- =====================================================
-- 3) BANK TRANSACTIONS (push from bank)
-- =====================================================
CREATE TABLE public.bank_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  -- Bank fields
  tran_no TEXT NOT NULL UNIQUE,
  tran_date TEXT,
  tran_date_time TIMESTAMPTZ,
  acc_no TEXT,
  customer_name TEXT,
  tran_amt NUMERIC NOT NULL,
  narration TEXT,
  dr_cr TEXT,
  uti TEXT,
  currency_code TEXT,
  rrp_no TEXT,
  tran_desc TEXT,
  tran_type TEXT,
  user_id_field TEXT,
  charge_amt NUMERIC,
  raw_payload JSONB,
  -- Parsed
  parsed_sender_phone TEXT,
  parsed_receiver_phone TEXT,
  -- Matching
  match_status TEXT NOT NULL DEFAULT 'unmatched', -- matched | unmatched | ignored_debit | failed_parse | manual_matched
  matched_payment_id UUID,
  matched_order_id UUID,
  match_notes TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_bank_tx_tran_no ON public.bank_transactions(tran_no);
CREATE INDEX idx_bank_tx_sender_amount ON public.bank_transactions(parsed_sender_phone, tran_amt);
CREATE INDEX idx_bank_tx_status ON public.bank_transactions(match_status);
CREATE INDEX idx_bank_tx_created ON public.bank_transactions(created_at DESC);

ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage bank transactions"
ON public.bank_transactions FOR ALL
TO authenticated
USING (is_admin(auth.uid()))
WITH CHECK (is_admin(auth.uid()));

-- =====================================================
-- 4) updated_at trigger for credentials
-- =====================================================
CREATE OR REPLACE FUNCTION public.touch_bank_credentials_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_bank_credentials_updated
BEFORE UPDATE ON public.bank_credentials
FOR EACH ROW EXECUTE FUNCTION public.touch_bank_credentials_updated_at();

-- =====================================================
-- 5) Default credentials
--    username: najaxbank
--    password: NajaxBank@2026!
-- =====================================================
INSERT INTO public.bank_credentials (username, password_hash, is_active, notes)
VALUES (
  'najaxbank',
  crypt('NajaxBank@2026!', gen_salt('bf', 10)),
  true,
  'Default credentials — beddel marka bank-ka la xiriiro'
)
ON CONFLICT (username) DO NOTHING;