CREATE OR REPLACE FUNCTION public.storefront_save_offline_registration(p_sender text, p_receiver text, p_provider_id uuid DEFAULT NULL::uuid, p_provider_name text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_tenant uuid := public.effective_tenant_id(); v_id uuid;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'tenant_required'; END IF;
  IF p_sender IS NULL OR p_receiver IS NULL THEN RAISE EXCEPTION 'phones_required'; END IF;

  SELECT id INTO v_id FROM public.offline_registrations
   WHERE tenant_id = v_tenant AND sender_phone = p_sender LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO public.offline_registrations (tenant_id, sender_phone, receiver_phone, provider_id, provider_name, is_active)
    VALUES (v_tenant, p_sender, p_receiver, p_provider_id::text, p_provider_name, true);
  ELSE
    UPDATE public.offline_registrations
       SET receiver_phone = p_receiver,
           provider_id = COALESCE(p_provider_id::text, provider_id),
           provider_name = COALESCE(p_provider_name, provider_name),
           is_active = true,
           updated_at = now()
     WHERE id = v_id;
  END IF;
END $function$;