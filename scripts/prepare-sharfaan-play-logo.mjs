import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const expectedSha256 = 'd890616e1933efb827f485a1cb9501a7da969cce2b053d4ee045029749b79c3f';
const supabaseUrl = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const serviceKey = String(process.env.SERVICE_KEY || '');
if (!supabaseUrl || !serviceKey) throw new Error('Missing Supabase URL/service key for Sharfaan Play artwork');

const url = new URL(supabaseUrl + '/rest/v1/tenants');
url.searchParams.set('slug', 'eq.sharfaan');
url.searchParams.set('select', 'logo_url');
url.searchParams.set('limit', '1');
const response = await fetch(url, {
  headers: { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey },
});
if (!response.ok) throw new Error('Unable to load Sharfaan artwork (' + response.status + ')');
const [tenant] = await response.json();
const logoUrl = String(tenant?.logo_url || '');
const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/i.exec(logoUrl);
if (!match) throw new Error('Expected Sharfaan tenant logo to be a JPEG, PNG, or WebP data URI');
const bytes = Buffer.from(match[2], 'base64');
const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
if (sha256 !== expectedSha256) {
  throw new Error('Sharfaan logo has changed. Review the current artwork before replacing the existing Play icon.');
}
await fs.mkdir('assets', { recursive: true });
const ext = match[1].toLowerCase() === 'jpeg' ? 'jpg' : match[1].toLowerCase();
const target = 'assets/sharfaan-play-original.' + ext;
await fs.writeFile(target, bytes);
console.log('Verified Sharfaan tenant artwork for Play release');
await fs.writeFile('assets/sharfaan-play-logo-path.txt', target + '\n');
