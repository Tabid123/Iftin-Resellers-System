import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const supabaseUrl = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const serviceKey = String(process.env.SERVICE_KEY || '');
const tenantSlug = String(process.env.TENANT_SLUG || '').trim();

if (!supabaseUrl || !serviceKey || !tenantSlug) {
  console.error('SUPABASE_URL, SERVICE_KEY and TENANT_SLUG are required');
  process.exit(1);
}

const headers = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  'Content-Type': 'application/json',
};

async function fetchJson(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`${response.status} ${response.statusText}: ${text.slice(0, 500)}`);
  }
  return response.json();
}

async function rpc(name, tenantId, body = {}) {
  return fetchJson(`${supabaseUrl}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { 'x-tenant-id': tenantId },
    body: JSON.stringify(body),
  });
}

const tenantRows = await fetchJson(
  `${supabaseUrl}/rest/v1/tenants?slug=eq.${encodeURIComponent(tenantSlug)}&select=id,slug,name,logo_url,primary_color,accent_color,status,plan_id,trial_ends_at,current_period_end,support_phone,suspension_reason,suspended_at&limit=1`,
);
const tenant = tenantRows?.[0];
if (!tenant?.id) {
  throw new Error(`Tenant not found for slug: ${tenantSlug}`);
}

const tenantId = tenant.id;
const [providers, paymentProviders, deliveryInstructions, featuredPackages, appSettingsRaw, banners] = await Promise.all([
  rpc('get_active_providers', tenantId),
  rpc('get_active_payment_providers', tenantId),
  rpc('get_tenant_delivery_instructions', tenantId),
  rpc('get_featured_packages', tenantId),
  rpc('get_tenant_app_settings', tenantId),
  rpc('get_tenant_banners', tenantId),
]);

const categories = [];
const packages = {};
for (const provider of Array.isArray(providers) ? providers : []) {
  const providerId = String(provider?.id || '');
  if (!providerId) continue;
  const [providerCategories, providerPackages] = await Promise.all([
    rpc('get_active_categories', tenantId, { p_provider_id: providerId }),
    rpc('get_public_packages', tenantId, { p_provider_id: providerId }),
  ]);
  if (Array.isArray(providerCategories)) categories.push(...providerCategories);
  packages[providerId] = Array.isArray(providerPackages) ? providerPackages : [];
}

const appSettings = Array.isArray(appSettingsRaw)
  ? appSettingsRaw.filter((item) => ['payment_number', 'payment_prefix'].includes(String(item?.setting_key || '')))
  : [];

const snapshot = {
  version: 1,
  generated_at: new Date().toISOString(),
  tenant,
  providers: Array.isArray(providers) ? providers : [],
  categories,
  packages,
  paymentProviders: Array.isArray(paymentProviders) ? paymentProviders : [],
  deliveryInstructions: Array.isArray(deliveryInstructions) ? deliveryInstructions : [],
  appSettings,
  featuredPackages: Array.isArray(featuredPackages) ? featuredPackages : [],
  banners: Array.isArray(banners) ? banners : [],
};

const assetsDir = path.resolve('public/offline-assets/tenant-bootstrap');
await fs.rm(assetsDir, { recursive: true, force: true });
await fs.mkdir(assetsDir, { recursive: true });

const fields = [
  [snapshot.tenant, 'logo_url'],
  ...snapshot.providers.map((item) => [item, 'provider_logo']),
  ...snapshot.categories.map((item) => [item, 'category_image']),
  ...snapshot.paymentProviders.map((item) => [item, 'provider_logo']),
  ...snapshot.banners.filter((item) => item?.media_type !== 'video').map((item) => [item, 'banner_image']),
];

for (const [object, field] of fields) {
  const url = String(object?.[field] || '').trim();
  if (!/^https?:\/\//i.test(url)) continue;
  try {
    const response = await fetch(url);
    if (!response.ok) continue;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.length || bytes.length > 4 * 1024 * 1024) continue;
    const contentType = response.headers.get('content-type') || '';
    const ext = contentType.includes('png') ? '.png'
      : contentType.includes('webp') ? '.webp'
      : contentType.includes('svg') ? '.svg'
      : contentType.includes('gif') ? '.gif'
      : contentType.includes('jpeg') || contentType.includes('jpg') ? '.jpg'
      : path.extname(new URL(url).pathname).slice(0, 8) || '.img';
    const name = `${crypto.createHash('sha256').update(url).digest('hex').slice(0, 20)}${ext}`;
    await fs.writeFile(path.join(assetsDir, name), bytes);
    object[field] = `/offline-assets/tenant-bootstrap/${name}`;
  } catch (error) {
    console.warn(`Could not bundle offline image ${url}:`, error?.message || error);
  }
}

const generatedFile = path.resolve('src/generated/tenantOfflineBootstrap.ts');
await fs.mkdir(path.dirname(generatedFile), { recursive: true });
await fs.writeFile(
  generatedFile,
  `// Generated during tenant Android build. Contains public storefront data only.\nexport const tenantOfflineBootstrap = ${JSON.stringify(snapshot)} as const;\n`,
  'utf8',
);

console.log(`Offline bootstrap generated for ${tenant.slug}: ${snapshot.providers.length} providers, ${snapshot.categories.length} categories`);
