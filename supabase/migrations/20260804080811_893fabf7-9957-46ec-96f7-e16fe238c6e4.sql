GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

-- anon needs the helper functions used inside RLS policies that apply to the public role
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO anon;
GRANT EXECUTE ON FUNCTION public.effective_tenant_id() TO anon;

-- phone verification happens before sign-in, so anon must reach verified_phones (RLS still applies)
GRANT SELECT, INSERT, UPDATE ON public.verified_phones TO anon;
-- read-only notice feed; RLS still restricts rows
GRANT SELECT ON public.notifications TO anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;