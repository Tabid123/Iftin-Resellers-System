import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolveSupportContacts, normalizeSupportPhone } from '../src/hooks/useSupportPhone';

const source = (name: string) =>
  readFileSync(new URL('../' + name, import.meta.url), 'utf8');

describe('APK FAB supports tenant-managed independent WhatsApp and Call numbers', () => {
  it('uses new numbers from tenant_fab_contacts for both distinct APK links', () => {
    const numbers = resolveSupportContacts({
      support_whatsapp: '+252619111111',
      support_call: '0629222222',
    }, '619535029');
    expect(numbers.whatsappHref).toBe('https://wa.me/252619111111');
    expect(numbers.telHref).toBe('tel:+252629222222');
    expect(numbers.display).toBe('+252629222222');
    expect(numbers.phone).toBe('629222222');
  });

  it('uses tenant default phone when no new numbers are configured', () => {
    const phone = resolveSupportContacts(null, '619535029');
    expect(phone.whatsappHref).toBe('https://wa.me/252619535029');
    expect(phone.telHref).toBe('tel:+252619535029');
    expect(normalizeSupportPhone('0619535029')).toBe('619535029');
  });

  it('uses a configured WhatsApp separately even if call is left empty', () => {
    const result = resolveSupportContacts({ support_whatsapp: '615555555', support_call: '' }, '626666666');
    expect(result.whatsappHref).toBe('https://wa.me/252615555555');
    expect(result.telHref).toBe('tel:+252626666666');
  });

  it('has a tenant-scoped live query with offline cache and foreground refresh', () => {
    const hook = source('src/hooks/useSupportPhone.ts');
    expect(hook).toContain("['tenant-fab-contacts', tenantId]");
    expect(hook).toContain(".from('tenant_fab_contacts')");
    expect(hook).toContain(".eq('tenant_id', tenantId)");
    expect(hook).toContain('workspaceStorage.setJson(FAB_CACHE_KEY, resolved, tenantId)');
    expect(hook).toContain("refetchOnWindowFocus: 'always'");
    expect(hook).toContain("refetchOnReconnect: 'always'");
    expect(hook).toContain('refetchInterval: 30_000');
  });

  it('wires the real installed APK FAB and support screens to the shared hook', () => {
    const providers = source('src/components/pages/ProviderSelection.tsx');
    const categories = source('src/components/pages/CategorySelection.tsx');
    const profile = source('src/components/pages/Profile.tsx');
    const chat = source('src/components/StorefrontAIChat.tsx');
    for (const file of [providers, categories, profile, chat]) {
      expect(file).toContain('useSupportPhone()');
      expect(file).toContain('support.telHref');
      expect(file).toContain('support.whatsappHref');
    }
  });

  it('invalidates the same contacts query when tenant admin saves new numbers', () => {
    const editor = source('src/components/admin/TenantFabSettings.tsx');
    expect(editor).toContain("queryKey: ['tenant-fab-contacts', tenantId]");
    expect(editor).toContain("queryKey: ['tenant-fab-contacts', tenantId] });");
  });
});
