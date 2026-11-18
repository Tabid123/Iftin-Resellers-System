import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { supportPhoneE164 } from '../src/components/shop/ShopSupportFab';

const source = (p: string) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

describe('Tenant FAB Support in general Settings', () => {
  it('normalizes local and international WhatsApp/Call links', () => {
    expect(supportPhoneE164('619535029')).toBe('+252619535029');
    expect(supportPhoneE164('+252619535029')).toBe('+252619535029');
    expect(supportPhoneE164('0619535029')).toBe('+252619535029');
  });

  it('renders separate tenant WhatsApp and Call number inputs in App Settings', () => {
    const settings = source('src/components/admin/AppSettings.tsx');
    const controls = source('src/components/admin/TenantFabSettings.tsx');
    expect(settings).toContain('<TenantFabSettings />');
    expect(controls).toContain("tenant-fab-contacts");
    expect(controls).toContain("onConflict: 'tenant_id'");
    expect(controls).toContain("support_whatsapp: whatsapp");
    expect(controls).toContain("support_call: call");
    expect(controls).toContain('WhatsApp number');
    expect(controls).toContain('Call number');
  });

  it('loads tenant-owned contacts in the existing storefront FAB', () => {
    const page = source('src/components/shop/ShopPage.tsx');
    expect(page).toContain('.from("tenant_fab_contacts")');
    expect(page).toContain('.eq("tenant_id", tenantId)');
    expect(page).toContain('fabContacts.data.support_whatsapp');
    expect(page).toContain('fabContacts.data.support_call');
    expect(page).toContain('<ShopSupportFab');
    expect(page).toContain('whatsapp={supportWhatsApp}');
    expect(page).toContain('call={supportCall}');
    expect(page).toContain('onOpen={() => { void fabContacts.refetch(); }}');
    expect(page).toContain('isRefreshing={fabContacts.isFetching}');
  });

  it('preserves old shop payment and support settings without duplicate FAB inputs', () => {
    const existing = source('src/components/shop/ShopCheckoutSettings.tsx');
    expect(existing).toContain('.from("shop_checkout_settings")');
    expect(existing).toContain('Tag FAB WhatsApp & Call Settings');
    expect(existing).not.toContain('onChange={e => update("support_whatsapp"');
    expect(existing).not.toContain('onChange={e => update("support_call"');
  });

  it('isolates contact writes to the current tenant and preserves previous numbers', () => {
    const sql = source('supabase/migrations/20261115191500_tenant_fab_contacts.sql');
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('public.effective_tenant_id()');
    expect(sql).toContain('private.shop_owner(tenant_id)');
    expect(sql).toContain('manage_settings');
    expect(sql).toContain('FROM public.shop_checkout_settings');
    expect(sql).toContain('ON CONFLICT (tenant_id) DO NOTHING');
  });
});
