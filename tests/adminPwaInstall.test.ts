import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  isTenantAdminPath,
  tenantAdminManifestHref,
  tenantCustomerManifestHref,
  adminManifestIdentity,
} from '../src/lib/tenantPwaManifest';

const read = (name: string) => readFileSync(new URL('../' + name, import.meta.url), 'utf8');

describe('separate tenant admin PWA install', () => {
  it('uses a unique PWA id and launches only the admin dashboard', () => {
    const admin = adminManifestIdentity('luubaan');
    expect(admin).toEqual({
      start_url: '/t/luubaan/dashboard/',
      scope: '/t/luubaan/dashboard/',
      id: '/t/luubaan/admin-pwa',
    });
    expect(admin.id).not.toBe('/t/luubaan/');
    expect(admin.start_url).not.toBe('/t/luubaan/');
    expect(adminManifestIdentity(null)).toEqual({
      start_url: '/dashboard/',
      scope: '/dashboard/',
      id: '/admin-pwa',
    });
    expect(adminManifestIdentity('../wrong').start_url).toBe('/dashboard/');
  });

  it('keeps the buyer app manifest unchanged and uses an admin-specific manifest', () => {
    expect(tenantCustomerManifestHref('luubaan')).toBe('/api/public/manifest?tenant=luubaan');
    expect(tenantCustomerManifestHref(null)).toBe('/manifest.json');
    expect(tenantAdminManifestHref('luubaan')).toBe('/api/public/manifest?app=admin&tenant=luubaan');
    expect(tenantAdminManifestHref(null)).toBe('/api/public/manifest?app=admin');
    const manifestEndpoint = read('src/routes/api/public/manifest.ts');
    expect(manifestEndpoint).toContain("url.searchParams.get('app') === 'admin'");
    expect(manifestEndpoint).toContain('start_url: isAdminApp ? adminIdentity.start_url : scope');
    expect(manifestEndpoint).toContain('id: isAdminApp ? adminIdentity.id : scope');
  });

  it('identifies tenant admin pages without confusing store or platform routes', () => {
    expect(isTenantAdminPath('/dashboard')).toBe(true);
    expect(isTenantAdminPath('/dashboard/login')).toBe(true);
    expect(isTenantAdminPath('/t/luubaan/dashboard/')).toBe(true);
    expect(isTenantAdminPath('/t/luubaan/dashboard/daily-orders')).toBe(true);
    expect(isTenantAdminPath('/')).toBe(false);
    expect(isTenantAdminPath('/t/luubaan/')).toBe(false);
    expect(isTenantAdminPath('/providers')).toBe(false);
    expect(isTenantAdminPath('/admin')).toBe(false);
  });

  it('updates manifest on each route, and initializes admin metadata before hydration', () => {
    const tenantMeta = read('src/components/TenantPwaMeta.tsx');
    expect(tenantMeta).toContain('isTenantAdminPath(pathname)');
    expect(tenantMeta).toContain('tenantAdminManifestHref(slug)');
    expect(tenantMeta).toContain('tenantCustomerManifestHref(slug)');
    const root = read('src/routes/__root.tsx');
    expect(root).toContain('earlyAdminManifestScript');
    expect(root).toContain('initAdminInstallPromptListener()');
  });

  it('only prompts for verified admin manifest, and offers browser installation instructions otherwise', () => {
    const install = read('src/lib/adminPwaInstall.ts');
    const button = read('src/components/admin/AdminPwaInstall.tsx');
    const dashboard = read('src/components/pages/SimpleAdminDashboard.tsx');
    expect(install).toContain('if (!isAdminInstallContext()) return');
    expect(install).toContain("url.searchParams.get('app') === 'admin'");
    expect(button).toContain('requestAdminPwaInstall()');
    expect(button).toContain('Add to Home Screen');
    expect(button).toContain('Download Admin App');
    expect(button).toContain('/dashboard/');
    expect(dashboard).toContain('<AdminPwaInstall');
  });
});
