
GRANT SELECT ON public.tenants TO anon;

CREATE POLICY "tenants public read"
ON public.tenants FOR SELECT
TO anon, authenticated
USING (true);
