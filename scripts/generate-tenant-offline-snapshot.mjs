import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_KEY || '';
const TENANT_SLUG = (process.env.TENANT_SLUG || '').trim();

if (!SUPABASE_URL || !SERVICE_KEY || !TENANT_SLUG) {
  console.error('SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and TENANT_SLUG are required');
  process.exit(1);
}

const headers = (tenantId) => ({
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
  ...(tenantId ? { 'x-tenant-id': tenantId } : {}),
});

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) {
    throw new Error(`Snapshot request failed (${response.status}) for ${new URL(url).pathname}`);
  }
  return data;
}

async function rpc(name, tenantId, body = {}) {
  return requestJson(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: headers(tenantId),
    body: JSON.stringify(body),
  });
}

const select = [
  'id', 'slug', 'name', 'logo_url', 'primary_color', 'accent_color', 'status',
  'plan_id', 'trial_ends_at', 'current_period_end', 'support_phone', 'delivery_mode',
].join(',');
const tenants = await requestJson(
  `${SUPABASE_URL}/rest/v1/tenants?slug=eq.${encodeURIComponent(TENANT_SLUG)}&select=${encodeURIComponent(select)}&limit=1`,
  { headers: headers() },
);
const tenant = Array.isArray(tenants) ? tenants[0] : null;
if (!tenant?.id) throw new Error(`Tenant not found: ${TENANT_SLUG}`);
if (tenant.delivery_mode && tenant.delivery_mode !== 'android_device') {
  throw new Error(`Offline snapshot generator does not yet support delivery_mode=${tenant.delivery_mode}`);
}

const [
  providers,
  paymentProviders,
  deliveryInstructions,
  featuredPackages,
  appSettingsRaw,
  banners,
] = await Promise.all([
  rpc('get_active_providers', tenant.id),
  rpc('get_active_payment_providers', tenant.id),
  rpc('get_tenant_delivery_instructions', tenant.id),
  rpc('get_featured_packages', tenant.id),
  rpc('get_tenant_app_settings', tenant.id),
  rpc('get_tenant_banners', tenant.id),
]);

if (!Array.isArray(providers)) throw new Error('get_active_providers returned invalid data');

const providerSnapshots = await Promise.all(
  providers.map(async (provider) => {
    const [categories, packages] = await Promise.all([
      rpc('get_active_categories', tenant.id, { p_provider_id: provider.id }),
      rpc('get_public_packages', tenant.id, { p_provider_id: provider.id }),
    ]);
    return {
      providerId: String(provider.id),
      categories: Array.isArray(categories) ? categories : [],
      packages: Array.isArray(packages) ? packages : [],
    };
  }),
);

const categories = providerSnapshots.flatMap((item) => item.categories);
const packages = Object.fromEntries(
  providerSnapshots.map((item) => [item.providerId, item.packages]),
);
const appSettings = Array.isArray(appSettingsRaw)
  ? appSettingsRaw.filter((setting) => ['payment_number', 'payment_prefix'].includes(setting?.setting_key))
  : [];

const snapshot = {
  version: 1,
  generatedAt: new Date().toISOString(),
  tenant: {
    id: tenant.id,
    slug: tenant.slug,
    name: tenant.name,
    logo_url: tenant.logo_url ?? null,
    primary_color: tenant.primary_color ?? null,
    accent_color: tenant.accent_color ?? null,
    status: tenant.status,
    plan_id: tenant.plan_id ?? null,
    trial_ends_at: tenant.trial_ends_at ?? null,
    current_period_end: tenant.current_period_end ?? null,
    support_phone: tenant.support_phone ?? null,
  },
  providers: Array.isArray(providers) ? providers : [],
  categories,
  packages,
  paymentProviders: Array.isArray(paymentProviders) ? paymentProviders : [],
  deliveryInstructions: Array.isArray(deliveryInstructions) ? deliveryInstructions : [],
  appSettings,
  featuredPackages: Array.isArray(featuredPackages) ? featuredPackages : [],
  banners: Array.isArray(banners) ? banners : [],
};

// Bundle remote storefront imagery into the APK as local assets. If an image is
// unavailable at build time we keep its original URL; functionality remains
// offline even though that particular visual may need the network.
const assetDir = path.resolve('public/offline-assets');
await fs.rm(assetDir, { recursive: true, force: true });
await fs.mkdir(assetDir, { recursive: true });

function extensionFor(contentType, url) {
  const type = (contentType || '').split(';')[0].trim().toLowerCase();
  const byType = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'image/svg+xml': '.svg',
    'image/avif': '.avif',
  };
  if (byType[type]) return byType[type];
  try {
    const ext = path.extname(new URL(url).pathname).toLowerCase();
    if (/^\.(png|jpe?g|webp|gif|svg|avif)$/.test(ext)) return ext === '.jpeg' ? '.jpg' : ext;
  } catch { /* ignore */ }
  return '.img';
}

const downloaded = new Map();
async function localizeImage(url) {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return url;
  if (downloaded.has(url)) return downloaded.get(url);

  try {
    const response = await fetch(url, { redirect: 'follow' });
    if (!response.ok) throw new Error(String(response.status));
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > 8 * 1024 * 1024) throw new Error('invalid image size');
    const hash = crypto.createHash('sha256').update(url).digest('hex').slice(0, 20);
    const ext = extensionFor(response.headers.get('content-type'), url);
    const fileName = `${hash}${ext}`;
    await fs.writeFile(path.join(assetDir, fileName), bytes);
    const localUrl = `/offline-assets/${fileName}`;
    downloaded.set(url, localUrl);
    return localUrl;
  } catch {
    console.warn(`Offline image could not be bundled: ${new URL(url).hostname}`);
    downloaded.set(url, url);
    return url;
  }
}

snapshot.tenant.logo_url = await localizeImage(snapshot.tenant.logo_url);
for (const provider of snapshot.providers) {
  provider.provider_logo = await localizeImage(provider.provider_logo);
}
for (const category of snapshot.categories) {
  category.category_image = await localizeImage(category.category_image);
}
for (const payment of snapshot.paymentProviders) {
  payment.provider_logo = await localizeImage(payment.provider_logo);
}
for (const featured of snapshot.featuredPackages) {
  if ('provider_logo' in featured) featured.provider_logo = await localizeImage(featured.provider_logo);
  if ('package_image' in featured) featured.package_image = await localizeImage(featured.package_image);
}
for (const banner of snapshot.banners) {
  if (banner?.media_type !== 'video') banner.banner_image = await localizeImage(banner.banner_image);
}

await fs.mkdir(path.resolve('src/generated'), { recursive: true });
await fs.writeFile(
  path.resolve('src/generated/tenant-offline-snapshot.json'),
  JSON.stringify(snapshot, null, 2) + '\n',
  'utf8',
);

const packageCount = Object.values(snapshot.packages).reduce((sum, list) => sum + list.length, 0);
console.log(
  `Offline snapshot ready for ${tenant.slug}: ${snapshot.providers.length} providers, ` +
  `${snapshot.categories.length} categories, ${packageCount} packages, ${downloaded.size} localized image references`,
);
