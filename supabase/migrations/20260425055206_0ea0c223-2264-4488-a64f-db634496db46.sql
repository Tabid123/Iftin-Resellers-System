CREATE OR REPLACE FUNCTION public.set_bank_credential(p_username text, p_password text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  -- Admin only
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: admin only';
  END IF;

  IF p_username IS NULL OR length(trim(p_username)) = 0 THEN
    RAISE EXCEPTION 'username required';
  END IF;
  IF p_password IS NULL OR length(p_password) < 6 THEN
    RAISE EXCEPTION 'password must be at least 6 chars';
  END IF;

  -- Deactivate any other active rows so only one active credential exists
  UPDATE public.bank_credentials SET is_active = false WHERE is_active = true AND username <> p_username;

  -- Upsert the credential
  INSERT INTO public.bank_credentials (username, password_hash, is_active)
  VALUES (p_username, crypt(p_password, gen_salt('bf', 10)), true)
  ON CONFLICT (username) DO UPDATE
    SET password_hash = crypt(p_password, gen_salt('bf', 10)),
        is_active = true,
        updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.set_bank_credential(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_bank_credential(text, text) TO authenticated;