import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

describe('tenant admin loading and permission fallback', () => {
  it('waits for auth and delivery mode before deciding a section is denied', () => {
    const detail = read('src/components/pages/SimpleAdminDetail.tsx');
    const loadingPosition = detail.indexOf("if (tenantState.status === 'loading' || checkingAccess)");
    const deniedPosition = detail.indexOf('if (!allowed) {', loadingPosition);
    expect(loadingPosition).toBeGreaterThan(0);
    expect(deniedPosition).toBeGreaterThan(loadingPosition);
    expect(detail).toContain('AdminDetailSkeleton');
    expect(detail).toContain('permissionsError || modeError');
  });

  it('uses tenant-scoped permission state and does not misclassify network failure', () => {
    const permissions = read('src/hooks/useAdminPermissions.ts');
    expect(permissions).toContain('state.tenantId !== tenantId');
    expect(permissions).toContain('permissionsError');
    expect(permissions).toContain('retryPermissions');
    expect(permissions).toContain("if (loadingPermissions || permissionsError) return false");
  });

  it('resolves partner mode from tenant context instead of defaulting to Android', () => {
    const capabilities = read('src/hooks/useTenantCapabilities.ts');
    expect(capabilities).toContain("tenant?.delivery_mode === 'api_partner'");
    expect(capabilities).toContain('loadingMode');
    expect(capabilities).toContain('modeError');
    expect(capabilities).not.toContain("return 'android_device';");
    expect(capabilities).toContain("'daily-orders': 'manage_orders'");
  });

  it('shows dashboard skeleton until first data load and keeps cards during refetch', () => {
    const dashboard = read('src/components/pages/SimpleAdminDashboard.tsx');
    expect(dashboard).toContain('AdminDashboardSkeleton');
    expect(dashboard).toContain('showInitialSkeleton');
    expect(dashboard).toContain('loadedTenantId !== tenant?.id');
    expect(dashboard).toContain('if (!readyForStats || !tenant?.id) return');
    expect(dashboard).toContain('isPartner ? emptyDeviceData');
    expect(dashboard).toContain('setDataError(');
  });

  it('shows sidebar placeholders while permissions and tenant mode are pending', () => {
    const sidebar = read('src/components/admin/SimpleAdminSidebar.tsx');
    expect(sidebar).toContain('accessPending = loadingPermissions || loadingMode');
    expect(sidebar).toContain('Menu-ga waa la soo akhrinayaa');
    expect(read('src/components/admin/AdminLoadingSkeleton.tsx')).toContain('<Skeleton');
  });
});
