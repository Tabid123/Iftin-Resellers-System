/**
 * Keep Supabase Free storage under control without touching published APKs.
 * Deletes only superseded, commit-addressed OTA ZIPs in apks/live-updates.
 *
 * Runs with the existing GitHub Actions service-role secret; never ship this
 * file or the secret to a browser/mobile application.
 */
import { createClient } from '@supabase/supabase-js';

const projectUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SERVICE_KEY;
if (!projectUrl || !serviceRoleKey) {
  throw new Error('SUPABASE_URL and SERVICE_KEY are required');
}

const supabase = createClient(projectUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const bucket = supabase.storage.from('apks');
const folder = 'live-updates';
const { data: manifestBlob, error: manifestError } = await bucket.download(`${folder}/manifest.json`);
if (manifestError || !manifestBlob) {
  throw new Error('Refusing OTA cleanup: current manifest cannot be read');
}
const manifest = JSON.parse(await manifestBlob.text());
if (!/^[0-9a-f]{40}$/i.test(manifest.version ?? '')) {
  throw new Error('Refusing OTA cleanup: manifest version is invalid');
}

// Paginate; never accidentally prune when listing was partial or failed.
const files = [];
const pageSize = 100;
for (let offset = 0; offset < 5000; offset += pageSize) {
  const { data, error } = await bucket.list(folder, {
    limit: pageSize,
    offset,
    sortBy: { column: 'created_at', order: 'desc' },
  });
  if (error || !data) throw new Error(`Cannot enumerate OTA bundles: ${error?.message || 'unknown'}`);
  files.push(...data);
  if (data.length < pageSize) break;
}

const zips = files
  .filter((file) => /^[0-9a-f]{40}\.zip$/i.test(file.name))
  .sort((a, b) => Date.parse(b.created_at || b.updated_at || '') -
                  Date.parse(a.created_at || a.updated_at || ''));

// Keep the manifest version, recent rollback versions, and 48 hours of
// in-flight downloads. No changes to other files, APKs or manifest.
const preserved = new Set(zips.slice(0, 8).map((file) => file.name));
preserved.add(`${manifest.version}.zip`);
const cutoff = Date.now() - 48 * 60 * 60 * 1000;
for (const file of zips) {
  if (Date.parse(file.created_at || file.updated_at || '') >= cutoff) {
    preserved.add(file.name);
  }
}
const obsolete = zips
  .filter((file) => !preserved.has(file.name))
  .map((file) => `${folder}/${file.name}`);

for (let i = 0; i < obsolete.length; i += 50) {
  const batch = obsolete.slice(i, i + 50);
  const { error } = await bucket.remove(batch);
  if (error) throw new Error(`OTA cleanup failed: ${error.message}`);
}
console.log(
  `OTA cleanup: kept ${zips.length - obsolete.length} ZIPs, removed ${obsolete.length} old ZIPs; published APKs untouched.`,
);
