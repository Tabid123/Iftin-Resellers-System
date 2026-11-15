-- One tenant-owned source for the storefront WhatsApp and Call FAB numbers.
-- Existing eCommerce settings are copied into the new common tenant Settings area.
-- No pre-existing support or payment details are deleted.
CREATE TABLE public.tenant_fab_contacts (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  support_whatsapp text NOT NULL DEFAULT ''
    CHECK (support_whatsapp = '' OR support_whatsapp ~ '^\+?[0-9]{7,15}$'),
  support_call text NOT NULL DEFAULT ''
    CHECK (support_call = '' OR support_call ~ '^\+?[0-9]{7,15}$'),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tenant_fab_contacts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tenant_fab_contacts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.tenant_fab_contacts TO anon, authenticated;
GRANT INSERT, UPDATE ON public.tenant_fab_contacts TO authenticated;
GRANT ALL ON public.tenant_fab_contacts TO service_role;

-- Customers may only see the two phone numbers for the currently selected tenant.
-- Logged-in tenant members may see their own row even with a missing public header.
CREATE POLICY tenant_fab_contacts_read ON public.tenant_fab_contacts
FOR SELECT TO anon, authenticated
USING (
  tenant_id = public.current_request_tenant_id()
  OR (auth.uid() IS NOT NULL AND tenant_id = public.effective_tenant_id())
);

-- Never trust a client-supplied tenant ID: verify both the authenticated tenant
-- and the user's tenant-owner or explicit manage_settings permission.
CREATE POLICY tenant_fab_contacts_insert ON public.tenant_fab_contacts
FOR INSERT TO authenticated
WITH CHECK (
  tenant_id = public.effective_tenant_id()
  AND (
    private.shop_owner(tenant_id)
    OR EXISTS (
      SELECT 1 FROM public.admin_permissions p
      WHERE p.tenant_id = tenant_fab_contacts.tenant_id
        AND p.user_id = auth.uid()
        AND p.permission_key = 'manage_settings'
    )
  )
);

CREATE POLICY tenant_fab_contacts_update ON public.tenant_fab_contacts
FOR UPDATE TO authenticated
USING (
  tenant_id = public.effective_tenant_id()
  AND (
    private.shop_owner(tenant_id)
    OR EXISTS (
      SELECT 1 FROM public.admin_permissions p
      WHERE p.tenant_id = tenant_fab_contacts.tenant_id
        AND p.user_id = auth.uid()
        AND p.permission_key = 'manage_settings'
    )
  )
)
WITH CHECK (
  tenant_id = public.effective_tenant_id()
  AND (
    private.shop_owner(tenant_id)
    OR EXISTS (
      SELECT 1 FROM public.admin_permissions p
      WHERE p.tenant_id = tenant_fab_contacts.tenant_id
        AND p.user_id = auth.uid()
        AND p.permission_key = 'manage_settings'
    )
  )
);

-- Preserve the support contacts configured through old eCommerce settings.
INSERT INTO public.tenant_fab_contacts (tenant_id, support_whatsapp, support_call)
SELECT tenant_id, support_whatsapp, support_call
FROM public.shop_checkout_settings
WHERE support_whatsapp <> '' OR support_call <> ''
ON CONFLICT (tenant_id) DO NOTHING;
