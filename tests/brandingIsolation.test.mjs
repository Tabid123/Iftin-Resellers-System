import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

test('Najax imagery is absent from all default favicon/PWA surfaces', () => {
  const root = read('src/routes/__root.tsx');
  const meta = read('src/components/TenantPwaMeta.tsx');
  const manifest = JSON.parse(read('public/manifest.json'));
  const dynamicManifest = read('src/routes/api/public/manifest.ts');
  const fallbackIcon = read('src/routes/api/public/tenant-icon.ts');
  const platformIcon = read('src/routes/api/public/platform-icon.ts');
  assert.match(root, /PLATFORM_ICON_URL/);
  assert.doesNotMatch(root, /href:\s*["']\/(?:favicon|icon-192|icon-512|apple-touch-icon)/);
  assert.match(meta, /tenant\?\.logo_url/);
  assert.match(meta, /\/api\/public\/tenant-icon/);
  assert.match(meta, /PLATFORM_ICON_URL/);
  assert.ok(manifest.icons.every((i) => i.src.startsWith('/iftin-resellers-') && i.type === 'image/png'));
  assert.match(dynamicManifest, /\/iftin-resellers-favicon\.png/);
  assert.match(fallbackIcon, /\/api\/public\/platform-icon/);
  assert.match(platformIcon, /PLATFORM_ICON_URL/);

  for (const file of [
    'public/favicon.png', 'public/apple-touch-icon.png',
    'public/icon-192.png', 'public/icon-512.png', 'public/images/najax-splash-logo.png',
    'src/assets/najax-logo.jpeg', 'src/assets/najax-logo-source.jpeg',
  ]) {
    assert.equal(fs.existsSync(file), false, `Legacy Najax icon still present: ${file}`);
  }
});

test('tenant admin, login, and storefront use own logo with neutral fallback', () => {
  const component = read('src/components/TenantBrandMark.tsx');
  assert.match(component, /logoUrl/);
  assert.doesNotMatch(component, /najax-logo/);
  for (const file of [
    'src/components/HeroSection.tsx',
    'src/components/pages/AdminLogin.tsx',
    'src/components/admin/SimpleAdminSidebar.tsx',
    'src/components/pages/SimpleAdminDashboard.tsx',
    'src/components/pages/SimpleAdminDetail.tsx',
    'src/components/PhoneVerification.tsx',
    'src/components/pages/OfflineMode.tsx',
  ]) {
    const source = read(file);
    assert.match(source, /TenantBrandMark/, file);
    assert.doesNotMatch(source, /najaxLogo|najax-logo/, file);
  }
});

test('provider selection never loads a shared Najax logo', () => {
  const provider = read('src/components/pages/ProviderSelection.tsx');
  assert.doesNotMatch(provider, /najaxLogo|najax-logo/);
});

test('offline fallback no longer paints Najax logo', () => {
  assert.doesNotMatch(read('public/sw.js'), /\/icon-192\.png/);
  assert.doesNotMatch(read('public/offline.html'), /\/icon-192\.png/);
});
