/**
 * Shared OTA ZIP is built without a VITE_TENANT_SLUG because it serves every
 * installed tenant APK. Old APKs keep their tenant slug in localStorage under
 * the same Capacitor localhost origin. Restore the correct storefront route
 * before React loads so installed APKs never accidentally show the platform.
 */
import fs from 'node:fs';
import path from 'node:path';

const dir = process.env.OTA_DIST_DIR || 'dist';
const file = path.resolve(dir, 'index.html');
const html = fs.readFileSync(file, 'utf8');
const marker = 'iftin-ota-native-tenant-route';

const bootstrap = [
  '<script id="' + marker + '">',
  '(function(){try{',
  'var h=location.hostname;',
  'if(h!=="localhost"&&h!=="127.0.0.1")return;',
  'if(location.pathname!=="/"&&location.pathname!=="/index.html"&&location.pathname!=="/packaged-app.html")return;',
  'var s=(localStorage.getItem("najax.tenant_slug")||"").trim().toLowerCase();',
  'if(!/^[a-z0-9-]+$/.test(s))return;',
  'history.replaceState(null,"","/t/"+encodeURIComponent(s)+"/"+location.search+location.hash);',
  '}catch(e){}})();',
  '</script>',
].join('');

if (!html.includes('<head>')) throw new Error('OTA index.html has no <head>; refusing to publish');
if (html.includes(marker)) throw new Error('OTA tenant-route bootstrap inserted twice');
const updated = html.replace('<head>', '<head>' + bootstrap);
if (!updated.includes(marker) || !updated.includes('tenant-bootstrap.js')) {
  throw new Error('Missing required native route or tenant bootstrap markers');
}
fs.writeFileSync(file, updated);
console.log('Generic native OTA route restoration installed for all tenant APKs');
