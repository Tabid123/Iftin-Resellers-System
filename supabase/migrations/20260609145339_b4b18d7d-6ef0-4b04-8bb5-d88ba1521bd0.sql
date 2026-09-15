DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND c.column_name = 'tenant_id'
      AND t.table_type = 'BASE TABLE'
      AND c.table_name NOT IN ('tenants','tenant_members','tenant_subscriptions')
  LOOP
    -- BEFORE INSERT: auto-fill tenant_id from header/membership
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname = format('trg_%s_set_tenant_id', r.table_name)
        AND tgrelid = format('public.%I', r.table_name)::regclass
    ) THEN
      EXECUTE format(
        'CREATE TRIGGER trg_%I_set_tenant_id BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id_default()',
        r.table_name, r.table_name
      );
    END IF;

    -- BEFORE UPDATE: forbid changing tenant_id
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname = format('trg_%s_forbid_tenant_change', r.table_name)
        AND tgrelid = format('public.%I', r.table_name)::regclass
    ) THEN
      EXECUTE format(
        'CREATE TRIGGER trg_%I_forbid_tenant_change BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.forbid_tenant_id_change()',
        r.table_name, r.table_name
      );
    END IF;
  END LOOP;
END $$;