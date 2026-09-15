
-- 1) Forbid tenant_id mutation on UPDATE (super_admin is also blocked from changing it — they should re-insert)
CREATE OR REPLACE FUNCTION public.forbid_tenant_id_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'tenant_id is immutable (cannot move row between tenants)';
  END IF;
  RETURN NEW;
END;
$$;

-- 2) Apply triggers to every public table that has a tenant_id column
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN pg_class pc ON pc.relname = c.table_name
    JOIN pg_namespace pn ON pn.oid = pc.relnamespace AND pn.nspname = 'public'
    WHERE c.table_schema = 'public'
      AND c.column_name = 'tenant_id'
      AND pc.relkind = 'r'
  LOOP
    -- Drop dup of insert-default trigger if both exist
    EXECUTE format('DROP TRIGGER IF EXISTS trg_set_tenant_id ON public.%I', r.table_name);

    -- Install (or refresh) the immutability trigger
    EXECUTE format('DROP TRIGGER IF EXISTS forbid_tenant_id_change ON public.%I', r.table_name);
    EXECUTE format(
      'CREATE TRIGGER forbid_tenant_id_change BEFORE UPDATE OF tenant_id ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.forbid_tenant_id_change()',
      r.table_name
    );
  END LOOP;
END $$;
