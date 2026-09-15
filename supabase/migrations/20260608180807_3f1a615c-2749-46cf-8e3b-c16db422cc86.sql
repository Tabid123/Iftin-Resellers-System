REVOKE ALL ON FUNCTION public.update_tenant_branding(text, text, text) FROM PUBLIC, anon, authenticated;
DROP FUNCTION IF EXISTS public.update_tenant_branding(text, text, text);