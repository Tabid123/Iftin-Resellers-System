CREATE OR REPLACE FUNCTION public.verify_bank_password(p_username text, p_password text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hash text;
BEGIN
  SELECT password_hash INTO v_hash
  FROM public.bank_credentials
  WHERE username = p_username
    AND is_active = true
  LIMIT 1;

  IF v_hash IS NULL THEN
    RETURN false;
  END IF;

  RETURN v_hash = crypt(p_password, v_hash);
END;
$$;

REVOKE ALL ON FUNCTION public.verify_bank_password(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_bank_password(text, text) TO service_role;