import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const isCapacitorBuild = process.env.CAPACITOR_BUILD === 'true';

if (isCapacitorBuild) {
  await import('./generate-tenant-offline-bootstrap.mjs');

  // Add a machine-readable marker to the APK stamp without disturbing the
  // existing build metadata written by the Android workflow.
  const stampPath = path.resolve('public/apk-build.json');
  try {
    const stamp = JSON.parse(fs.readFileSync(stampPath, 'utf8'));
    stamp.offlineBootstrap = 'packaged-v1';
    fs.writeFileSync(stampPath, `${JSON.stringify(stamp)}\n`);
  } catch {
    // Local Capacitor builds may not have the CI stamp yet.
  }
}

const viteBin = path.resolve(
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'vite.cmd' : 'vite',
);

const result = spawnSync(viteBin, ['build'], {
  stdio: 'inherit',
  env: process.env,
  shell: process.platform === 'win32',
});

if (result.error) throw result.error;
if ((result.status ?? 1) !== 0) process.exit(result.status ?? 1);

if (isCapacitorBuild) {
  const candidates = [
    path.resolve('dist'),
    path.resolve('.output/public'),
    path.resolve('dist/client'),
    path.resolve('dist/public'),
    path.resolve('build/client'),
    path.resolve('build'),
  ];

  const output = candidates.find((dir) => fs.existsSync(path.join(dir, 'index.html')));
  if (!output) {
    console.error('Capacitor build verification failed: no static index.html output found');
    process.exit(1);
  }

  // TanStack's SPA prerender writes the final index.html after Vite's
  // transformIndexHtml hook has run. Ensure the bootstrap script is therefore
  // present in the actual prerendered shell, before any module script starts.
  const indexPath = path.join(output, 'index.html');
  let indexHtml = fs.readFileSync(indexPath, 'utf8');
  if (!indexHtml.includes('tenant-bootstrap.js')) {
    const bootstrapTag = '<script src="/tenant-bootstrap.js"></script>';
    if (indexHtml.includes('</head>')) {
      indexHtml = indexHtml.replace('</head>', `${bootstrapTag}</head>`);
    } else {
      indexHtml = `${bootstrapTag}${indexHtml}`;
    }
    fs.writeFileSync(indexPath, indexHtml, 'utf8');
  }

  if (!fs.existsSync(path.join(output, 'tenant-bootstrap.js'))) {
    console.error('Capacitor build verification failed: tenant-bootstrap.js is missing from static assets');
    process.exit(1);
  }

  if (!fs.existsSync(path.join(output, 'tenant-bootstrap.json'))) {
    console.error('Capacitor build verification failed: tenant-bootstrap.json is missing from static assets');
    process.exit(1);
  }

  indexHtml = fs.readFileSync(indexPath, 'utf8');
  const bootstrapIndex = indexHtml.indexOf('tenant-bootstrap.js');
  const firstModuleIndex = indexHtml.search(/<script[^>]*type=["']module["']/i);
  if (bootstrapIndex < 0 || (firstModuleIndex >= 0 && bootstrapIndex > firstModuleIndex)) {
    console.error('Capacitor build verification failed: tenant bootstrap does not run before the app module');
    process.exit(1);
  }

  const snapshot = JSON.parse(fs.readFileSync(path.join(output, 'tenant-bootstrap.json'), 'utf8'));
  const expectedSlug = String(process.env.TENANT_SLUG || process.env.VITE_TENANT_SLUG || '').trim().toLowerCase();
  if (!snapshot?.tenant?.id || !snapshot?.tenant?.slug || String(snapshot.tenant.slug).toLowerCase() !== expectedSlug) {
    console.error('Capacitor build verification failed: packaged tenant snapshot identity does not match this build');
    process.exit(1);
  }

  console.log(
    `Capacitor offline bootstrap verified: ${snapshot.providers?.length || 0} providers, ` +
      `${snapshot.categories?.length || 0} categories`,
  );
}

process.exit(0);
