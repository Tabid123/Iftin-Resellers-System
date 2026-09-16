import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

async function readDotEnv() {
  try {
    const text = await fs.readFile(path.resolve('.env'), 'utf8');
    const out = {};
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

const dotEnv = await readDotEnv();
const supabaseUrl = String(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || dotEnv.VITE_SUPABASE_URL || '',
).replace(/\/$/, '');
const serviceKey = String(process.env.SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const publicKey = String(
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    dotEnv.VITE_SUPABASE_PUBLISHABLE_KEY ||
    dotEnv.VITE_SUPABASE_ANON_KEY ||
    '',
).trim();
const apiKey = serviceKey || publicKey;
const tenantSlug = String(process.env.TENANT_SLUG || process.env.VITE_TENANT_SLUG || '').trim().toLowerCase();

if (!supabaseUrl || !apiKey || !tenantSlug) {
  console.error('Supabase URL/key and TENANT_SLUG are required for tenant offline bootstrap');
  process.exit(1);
}

const headers = {
  apikey: apiKey,
  Authorization: `Bearer ${apiKey}`,
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
    headers: tenantId ? { 'x-tenant-id': tenantId } : {},
    body: JSON.stringify(body),
  });
}

let tenantRow;
if (serviceKey) {
  const tenantRows = await fetchJson(
    `${supabaseUrl}/rest/v1/tenants?slug=eq.${encodeURIComponent(tenantSlug)}&select=id,slug,name,logo_url,primary_color,accent_color,status,trial_ends_at,current_period_end,support_phone&limit=1`,
  );
  tenantRow = tenantRows?.[0];
} else {
  const resolved = await rpc('get_tenant_by_slug', null, { p_slug: tenantSlug });
  tenantRow = Array.isArray(resolved) ? resolved[0] : resolved;
}

if (!tenantRow?.id) throw new Error(`Tenant not found for slug: ${tenantSlug}`);

// Keep the APK snapshot strictly to storefront-safe identity fields. Internal
// notes, billing metadata, credit state and suspension details are never baked
// into a customer APK.
const tenant = {
  id: tenantRow.id,
  slug: tenantRow.slug,
  name: tenantRow.name,
  logo_url: tenantRow.logo_url ?? null,
  primary_color: tenantRow.primary_color ?? null,
  accent_color: tenantRow.accent_color ?? null,
  status: tenantRow.status,
  plan_id: null,
  trial_ends_at: tenantRow.trial_ends_at ?? null,
  current_period_end: tenantRow.current_period_end ?? null,
  support_phone: tenantRow.support_phone ?? null,
};

const tenantId = String(tenant.id);

// A tenant-dedicated OneSignal App ID takes precedence over the legacy global
// build secret. The App ID itself is public and safe to compile into the APK;
// REST API credentials are never read here and remain server-side in Vault.
if (serviceKey) {
  try {
    const pushRows = await fetchJson(
      `${supabaseUrl}/rest/v1/tenant_push_config?tenant_id=eq.${encodeURIComponent(tenantId)}&select=onesignal_app_id,enabled&limit=1`,
    );
    const pushConfig = pushRows?.[0];
    const tenantOneSignalAppId = String(pushConfig?.onesignal_app_id || '').trim();
    if (pushConfig?.enabled === true && /^[0-9a-f-]{36}$/i.test(tenantOneSignalAppId)) {
      process.env.VITE_ONESIGNAL_APP_ID = tenantOneSignalAppId;
      console.log(`Using tenant-specific OneSignal App ID for ${tenant.slug}`);
    }
  } catch (error) {
    // Keep the existing global VITE_ONESIGNAL_APP_ID as a migration fallback.
    console.warn('Tenant push App ID lookup skipped:', error?.message || error);
  }
}

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
  popularPackages: [],
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

let bundledImageCount = 0;
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
    bundledImageCount += 1;
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

// Capacitor loads this script before React. It seeds only tenant-scoped local
// storage, so TenantContext starts with the authoritative id and the storefront
// can hydrate providers/categories/packages on a brand-new offline install.
const bootstrapScript = `(() => {\n` +
  `  const snapshot = ${JSON.stringify(snapshot)};\n` +
  `  try {\n` +
  `    const tenant = snapshot.tenant;\n` +
  `    if (!tenant || !tenant.id || !tenant.slug) return;\n` +
  `    const id = String(tenant.id);\n` +
  `    const slug = String(tenant.slug).toLowerCase();\n` +
  `    const prefix = 'ws:' + id + ':';\n` +
  `    localStorage.setItem('najax.tenant_slug', slug);\n` +
  `    localStorage.setItem('najax.cache_owner_slug', slug);\n` +
  `    localStorage.setItem('najax.tenant_cache.' + slug, JSON.stringify(tenant));\n` +
  `    localStorage.setItem(prefix + 'offline_providers', JSON.stringify(snapshot.providers || []));\n` +
  `    localStorage.setItem(prefix + 'offline_categories', JSON.stringify(snapshot.categories || []));\n` +
  `    localStorage.setItem(prefix + 'offline_packages', JSON.stringify(snapshot.packages || {}));\n` +
  `    localStorage.setItem(prefix + 'offline_payment_providers', JSON.stringify(snapshot.paymentProviders || []));\n` +
  `    localStorage.setItem(prefix + 'offline_delivery_instructions', JSON.stringify(snapshot.deliveryInstructions || []));\n` +
  `    localStorage.setItem(prefix + 'offline_app_settings', JSON.stringify(snapshot.appSettings || []));\n` +
  `    localStorage.setItem(prefix + 'offline_featured_packages', JSON.stringify(snapshot.featuredPackages || []));\n` +
  `    localStorage.setItem(prefix + 'offline_popular_packages_v2', JSON.stringify(snapshot.popularPackages || []));\n` +
  `    localStorage.setItem(prefix + 'offline_banners', JSON.stringify(snapshot.banners || []));\n` +
  `    localStorage.setItem(prefix + 'offline_banners_at', String(Date.now()));\n` +
  `    localStorage.setItem(prefix + 'offline_cache_timestamp', String(Date.now()));\n` +
  `    localStorage.setItem(prefix + 'offline_bootstrap_version', String(snapshot.version || 1));\n` +
  `  } catch (_) {}\n` +
  `})();\n`;

await fs.writeFile(path.resolve('public/tenant-bootstrap.js'), bootstrapScript, 'utf8');
await fs.writeFile(path.resolve('public/tenant-bootstrap.json'), JSON.stringify(snapshot), 'utf8');

const packageCount = Object.values(snapshot.packages).reduce((total, list) => total + list.length, 0);
console.log(
  `Offline bootstrap generated for ${tenant.slug}: ${snapshot.providers.length} providers, ` +
  `${snapshot.categories.length} categories, ${packageCount} packages, ${bundledImageCount} bundled images`,
);
