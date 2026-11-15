import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

function dimensions(path) {
  const bytes = fs.readFileSync(path);
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

test('platform PNG logo, favicon, and real .ico are available in public assets', () => {
  assert.deepEqual(dimensions('public/iftin-resellers-brand.png'), {width: 1024, height: 1024});
  assert.deepEqual(dimensions('public/iftin-resellers-favicon.png'), {width: 192, height: 192});
  const ico = fs.readFileSync('public/favicon.ico');
  assert.deepEqual([...ico.subarray(0,6)], [0,0,1,0,1,0]);
  assert.equal(ico[6], 192);
  assert.equal(ico[7], 192);
  assert.deepEqual([...ico.subarray(22,30)], [137,80,78,71,13,10,26,10]);
  assert.equal(ico.readUInt32LE(14), ico.length - 22);
});

test('browser and PWA metadata reference new URLs, not the old broken JPG imports', () => {
  const brand = read('src/lib/platformBrand.ts');
  const root = read('src/routes/__root.tsx');
  const meta = read('src/components/TenantPwaMeta.tsx');
  const login = read('src/components/pages/platform/PlatformAuth.tsx');
  const sidebar = read('src/components/pages/platform/PlatformLayout.tsx');
  const endpoint = read('src/routes/api/public/platform-icon.ts');
  const manifest = JSON.parse(read('public/manifest.json'));

  assert.match(brand, /iftin-resellers-brand\.png\?v=/);
  assert.match(brand, /iftin-resellers-favicon\.png\?v=/);
  assert.match(root, /href: PLATFORM_ICON_URL/);
  assert.match(meta, /PLATFORM_ICON_URL/);
  assert.match(login, /src=\{PLATFORM_LOGO_URL\}/);
  assert.match(sidebar, /src=\{PLATFORM_ICON_URL\}/);
  assert.match(endpoint, /new URL\(PLATFORM_ICON_URL, request\.url\)/);
  for (const file of [root,meta,login,sidebar,endpoint]) {
    assert.doesNotMatch(file, /iftin-resellers-(?:icon|logo)\.jpg/);
  }
  assert.ok(manifest.icons.some((item) => item.src.startsWith('/iftin-resellers-favicon.png')));
});

test('tenant admin PWA routing and customer logo are preserved', () => {
  const meta = read('src/components/TenantPwaMeta.tsx');
  const manifest = read('src/routes/api/public/manifest.ts');
  assert.match(meta, /tenantAdminManifestHref\(slug\)/);
  assert.match(meta, /tenantCustomerManifestHref\(slug\)/);
  assert.match(meta, /tenant\.logo_url/);
  assert.match(manifest, /if \(tenant\.logo_url\)/);
  assert.match(manifest, /\/api\/public\/tenant-icon/);
});
