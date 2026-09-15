
CREATE OR REPLACE FUNCTION public.get_active_providers()
RETURNS SETOF public.providers_config
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT * FROM public.providers_config
  WHERE COALESCE(is_active, true) = true
  ORDER BY display_order NULLS LAST, provider_name;
$$;

GRANT EXECUTE ON FUNCTION public.get_active_providers() TO anon, authenticated;
