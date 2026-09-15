import { spawnSync } from 'node:child_process';
import path from 'node:path';

if (process.env.CAPACITOR_BUILD === 'true') {
  await import('./generate-tenant-offline-bootstrap.mjs');
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
process.exit(result.status ?? 1);
