import { createHash } from 'node:crypto';
import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const serviceKey = process.env.SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const tenantSlug = (process.env.TENANT_SLUG || '').trim();

if (!supabaseUrl || !serviceKey || !tenantSlug) {
  throw new Error('SUPABASE_URL, SERVICE_KEY and TENANT_SLUG are required to build the offline tenant snapshot.');
}

const headers = (tenantId) => ({
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  'Content-Type': 'application/json',
  ...(tenantId ? { 'x-tenant-id': tenantId } : {}),
});

async function rpc(name, args = {}, tenantId = null) {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: headers(tenantId),
    body: JSON.stringify(args),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${name} failed (${response.status}): ${body.slice(0, 500)}`);
  }
  return response.json();
}

function asArray(value) {
  return Array.isArray(value) ? value : value == null ? [] : [value];
}

function extFrom(contentType, rawUrl) {
  const byType = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/webp': '.webp',
    'image/svg+xml': '.svg',
    'image/gif': '.gif',
  }[String(contentType || '').split(';')[0].trim().toLowerCase()];
  if (byType) return byType;
  try {
    const ext = path.extname(new URL(rawUrl).pathname).toLowerCase();
    if (/^\.(png|jpe?g|webp|svg|gif)$/.test(ext)) return ext === '.jpeg' ? '.jpg' : ext;
  } catch {}
  return '.img';
}

const assetDir = path.resolve('public/offline-assets');
await mkdir(assetDir, { recursive: true });
const downloaded = new Map();

async function packageImage(rawUrl) {
  if (typeof rawUrl !== 'string' || !/^https?:\/\//i.test(rawUrl)) return rawUrl;
  if (downloaded.has(rawUrl)) return downloaded.get(rawUrl);
  try {
    const response = await fetch(rawUrl, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length) throw new Error('empty image');
    const name = `${createHash('sha1').update(rawUrl).digest('hex').slice(0, 20)}${extFrom(response.headers.get('content-type'), rawUrl)}`;
    await writeFile(path.join(assetDir, name), bytes);
    const local = `/offline-assets/${name}`;
    downloaded.set(rawUrl, local);
    return local;
  } catch (error) {
    console.warn(`[offline-bootstrap] Could not package image ${rawUrl}: ${error?.message || error}`);
    downloaded.set(rawUrl, rawUrl);
    return rawUrl;
  }
}

async function rewriteImages(rows, fields) {
  return Promise.all(asArray(rows).map(async (row) => {
    const copy = { ...row };
    for (const field of fields) {
      if (copy[field]) copy[field] = await packageImage(copy[field]);
    }
    return copy;
  }));
}

const tenantResult = await rpc('get_tenant_by_slug', { p_slug: tenantSlug });
const tenant = Array.isArray(tenantResult) ? tenantResult[0] : tenantResult;
if (!tenant?.id) throw new Error(`Tenant not found for slug: ${tenantSlug}`);
const tenantId = String(tenant.id);

const [providersRaw, paymentProvidersRaw, deliveryInstructions, featuredPackages, appSettings, bannersRaw] = await Promise.all([
  rpc('get_active_providers', {}, tenantId),
  rpc('get_active_payment_providers', {}, tenantId),
  rpc('get_tenant_delivery_instructions', {}, tenantId),
  rpc('get_featured_packages', {}, tenantId),
  rpc('get_tenant_app_settings', {}, tenantId),
  rpc('get_tenant_banners', {}, tenantId),
]);

const providers = await rewriteImages(providersRaw, ['provider_logo', 'logo_url', 'image_url']);
const paymentProviders = await rewriteImages(paymentProvidersRaw, ['provider_logo', 'logo_url', 'image_url']);
const banners = await rewriteImages(bannersRaw, ['banner_image', 'image_url']);
const categories = [];
const packages = {};

for (const provider of providers) {
  const providerId = String(provider.id || '');
  if (!providerId) continue;
  const [providerCategoriesRaw, providerPackages] = await Promise.all([
    rpc('get_active_categories', { p_provider_id: providerId }, tenantId),
    rpc('get_public_packages', { p_provider_id: providerId }, tenantId),
  ]);
  const providerCategories = await rewriteImages(providerCategoriesRaw, ['category_image', 'image_url']);
  categories.push(...providerCategories);
  packages[providerId] = asArray(providerPackages);
}

const tenantWithLocalLogo = {
  ...tenant,
  logo_url: await packageImage(tenant.logo_url),
};

const snapshot = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  tenant: tenantWithLocalLogo,
  resources: {
    providers,
    categories,
    packages,
    paymentProviders,
    deliveryInstructions: asArray(deliveryInstructions),
    appSettings: asArray(appSettings).filter((item) => ['payment_number', 'payment_prefix'].includes(item?.setting_key)),
    featuredPackages: asArray(featuredPackages),
    popularPackages: [],
    banners,
  },
};

await writeFile('public/tenant-bootstrap.json', `${JSON.stringify(snapshot)}\n`, 'utf8');

if (process.env.GITHUB_ENV) {
  await appendFile(process.env.GITHUB_ENV, `VITE_TENANT_ID=${tenantId}\n`, 'utf8');
}

console.log(`[offline-bootstrap] tenant=${tenantSlug} id=${tenantId} providers=${providers.length} categories=${categories.length} packagedImages=${downloaded.size}`);
