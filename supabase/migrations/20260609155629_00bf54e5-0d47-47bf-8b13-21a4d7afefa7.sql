
-- Grant table access so RLS-protected reads work via PostgREST + RPCs.
-- All these tables are tenant-scoped; RLS still enforces tenant isolation.

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'providers_config','package_categories','data_packages_config',
    'banners_config','payment_providers_config','delivery_instructions',
    'app_settings','featured_packages','error_messages'
  ] LOOP
    EXECUTE format('GRANT SELECT ON public.%I TO anon, authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

GRANT SELECT ON public.tenants TO anon, authenticated;
