import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

describe('Super Admin navigation does not refresh the document', () => {
  it('keeps tabs as client-side router links, not hard navigation', () => {
    const platform = read('src/components/pages/platform/PlatformLayout.tsx');
    const router = read('src/lib/router-compat.tsx');
    assert.match(platform, /<NavLink/);
    assert.match(router, /<TSLink/);
    assert.doesNotMatch(platform, /window\.location\.reload\(\)|navigate\(0\)|location\.href\s*=/);
    assert.match(platform, /function PlatformSidebar\(/);
    assert.ok(platform.indexOf('function PlatformSidebar(') < platform.indexOf('export default function PlatformLayout()'));
  });

  it('never uses the tenant splash for lazy /admin tabs', () => {
    const lazy = read('src/lib/lazyPages.tsx');
    const start = lazy.indexOf('function PageLoading()');
    const guard = lazy.indexOf("if (/^\\/admin(?:\\/|$)/.test(route.pathname))", start);
    const splash = lazy.indexOf('<TenantSplash', start);
    assert.ok(guard > start && guard < splash, 'platform guard precedes tenant splash');
    assert.match(lazy, /Loading Super Admin tab/);
  });

  it('preloads platform tabs and keeps page suspension inside the route outlet', () => {
    const lazy = read('src/lib/lazyPages.tsx');
    const layout = read('src/components/pages/platform/PlatformLayout.tsx');
    for (const page of ['PlatformDashboard', 'ResellersPage', 'PlansPage', 'FeaturesPage', 'AppsPage']) {
      assert.match(lazy, new RegExp('platformLoaders\\.' + page + '\\(\\)'));
    }
    assert.match(layout, /warmPlatformPages\(\)/);
    assert.match(layout, /<Outlet\s*\/>/);
  });

  it('allows login to update state without reload and avoids auth callback lock reentry', () => {
    const platform = read('src/components/pages/platform/PlatformLayout.tsx');
    assert.match(platform, /onSuccess=\{\(\) => refreshAuthRef\.current\(\)\}/);
    assert.match(platform, /onAuthStateChange\(\(\) => \{/);
    assert.match(platform, /setTimeout\(\(\) => \{/);
    assert.match(platform, /request !== checkNumber/);
    assert.doesNotMatch(platform, /onSuccess=\{\(\) => window\.location\.reload/);
  });
});
