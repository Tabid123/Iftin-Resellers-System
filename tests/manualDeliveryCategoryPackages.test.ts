import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { packagesForSystemCode } from '../src/lib/packagesForSystemCode';

const source = readFileSync(new URL('../src/components/admin/AddManualDeliveryDialog.tsx', import.meta.url), 'utf8');
const packages = [
  { id: 'daily', provider_id: 'somtel', category_id: 'social', is_active: true },
  { id: 'weekly', provider_id: 'somtel', category_id: 'social', is_active: true },
  { id: 'monthly', provider_id: 'somtel', category_id: 'social', is_active: true },
  { id: 'unlimited', provider_id: 'somtel', category_id: 'unlimited', is_active: true },
  { id: 'other', provider_id: 'somnet', category_id: 'social', is_active: true },
];

describe('Manual delivery provider/category/package selection', () => {
  it('lists only packages in the selected provider and category', () => {
    expect(packagesForSystemCode(packages, 'somtel', 'social').map(pkg => pkg.id))
      .toEqual(['daily', 'weekly', 'monthly']);
    expect(packagesForSystemCode(packages, 'somtel', 'unlimited').map(pkg => pkg.id))
      .toEqual(['unlimited']);
  });

  it('preserves optional category behavior without showing other providers', () => {
    expect(packagesForSystemCode(packages, 'somtel', '').map(pkg => pkg.id))
      .toEqual(['daily', 'weekly', 'monthly', 'unlimited']);
    expect(packagesForSystemCode(packages, '', 'social')).toEqual([]);
  });

  it('loads category IDs for manual orders and renders only filtered packages', () => {
    expect(source).toContain("from('package_categories')");
    expect(source).toContain(".select('id, category_name, provider_id')");
    expect(source).toContain("packagesForSystemCode(packages, selectedProviderId, selectedCategoryId)");
    expect(source).toContain('{filteredPackages.map((pkg) => (');
  });

  it('clears outdated package selection on provider/category change', () => {
    expect(source).toContain("setSelectedProviderId(providerId);");
    expect(source).toContain("setSelectedCategoryId('');");
    expect(source).toContain("setSelectedCategoryId(categoryId === '__all__' ? '' : categoryId);");
    expect(source.match(/setSelectedPackageId\(''\);/g)?.length).toBeGreaterThanOrEqual(3);
    expect(source).toContain('!filteredPackages.some(pkg => pkg.id === selectedPackageId)');
  });

  it('does not activate inactive draft packages when sending manually', () => {
    expect(source).toContain(".eq('is_active', true)");
    expect(source).toContain("if (cancelled) return;");
    expect(source).toContain("const selectedPackage = filteredPackages.find(p => p.id === selectedPackageId)");
  });
});
