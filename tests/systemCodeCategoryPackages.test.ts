import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { packagesForSystemCode } from '../src/lib/packagesForSystemCode';

const packages = [
  { id: 'daily', provider_id: 'somtel', category_id: 'social', package_name: 'Social Daily 100MB', is_active: false },
  { id: 'weekly', provider_id: 'somtel', category_id: 'social', package_name: 'Social Weekly 1.8GB', is_active: false },
  { id: 'monthly', provider_id: 'somtel', category_id: 'social', package_name: 'Social Monthly 8GB', is_active: false },
  { id: 'other', provider_id: 'somtel', category_id: 'unlimited', package_name: 'Unlimited Data 24 Saac', is_active: true },
  { id: 'none', provider_id: 'somtel', category_id: null, package_name: 'Uncategorized', is_active: true },
  { id: 'hormuud', provider_id: 'hormuud', category_id: 'social', package_name: 'Another Provider', is_active: true },
];

describe('System Codes package dropdown', () => {
  it('shows only selected category packages, including OFF packages for code setup', () => {
    expect(packagesForSystemCode(packages, 'somtel', 'social').map(p => p.id))
      .toEqual(['daily', 'weekly', 'monthly']);
  });

  it('supports an optional category while remaining scoped to the provider', () => {
    expect(packagesForSystemCode(packages, 'somtel', '').map(p => p.id))
      .toEqual(['daily', 'weekly', 'monthly', 'other', 'none']);
    expect(packagesForSystemCode(packages, 'hormuud', '').map(p => p.id)).toEqual(['hormuud']);
    expect(packagesForSystemCode(packages, '', 'social')).toEqual([]);
  });

  it('never includes packages from a different category or provider', () => {
    expect(packagesForSystemCode(packages, 'somtel', 'unlimited').map(p => p.id)).toEqual(['other']);
    expect(packagesForSystemCode(packages, 'somtel', 'missing')).toEqual([]);
  });

  it('clears outdated package selection and reads category_id from the database', () => {
    const config = readFileSync(
      new URL('../src/components/admin/simple/ConfigViews.tsx', import.meta.url),
      'utf8',
    );
    expect(config).toContain("packagesForSystemCode(pkgs, newCode.provider_id, newCode.category_id)");
    expect(config).toContain("category_id: e.target.value, package_id: ''");
    expect(config).toContain(".select('id, package_name, provider_id, category_id')");
    expect(config).toContain("newCode.package_id && !filteredProvPackages.some(");
  });
});
