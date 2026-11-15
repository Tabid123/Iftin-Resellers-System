import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';

const script = path.resolve('scripts/prepare-native-ota-route.mjs');
const workflow = fs.readFileSync('.github/workflows/publish-live-web-update.yml', 'utf8');

test('shared OTA is triggered by storefront changes and bypasses versionCode equality on existing APKs', () => {
  assert.match(workflow, /- "src\/\*\*"/);
  assert.match(workflow, /- "public\/\*\*"/);
  assert.match(workflow, /"nativeVersionCode":0/);
  assert.match(workflow, /prepare-native-ota-route\.mjs/);
});

test('generic OTA restores correct tenant route without touching online website', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'iftin-ota-'));
  try {
    fs.writeFileSync(path.join(dir, 'index.html'),
      '<html><head><meta charset="utf-8"></head><body><script src="/tenant-bootstrap.js"></script></body></html>');
    execFileSync(process.execPath, [script], { env: { ...process.env, OTA_DIST_DIR: dir } });
    const output = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
    const match = output.match(/<script id="iftin-ota-native-tenant-route">([\s\S]*?)<\/script>/);
    assert.ok(match, 'bootstrap script inserted before other scripts');

    function simulate({ hostname, pathname, tenant }) {
      let redirected = null;
      const sandbox = {
        location: { hostname, pathname, search: '?from=apk', hash: '#status' },
        localStorage: { getItem: key => key === 'najax.tenant_slug' ? tenant : null },
        history: { replaceState: (_state, _title, url) => { redirected = url; } },
      };
      vm.runInNewContext(match[1], sandbox);
      return redirected;
    }
    assert.equal(simulate({ hostname: 'localhost', pathname: '/', tenant: 'faanoole' }),
      '/t/faanoole/?from=apk#status');
    assert.equal(simulate({ hostname: '127.0.0.1', pathname: '/index.html', tenant: 'sharfaan' }),
      '/t/sharfaan/?from=apk#status');
    assert.equal(simulate({ hostname: 'iftinagents.com', pathname: '/', tenant: 'faanoole' }), null);
    assert.equal(simulate({ hostname: 'localhost', pathname: '/', tenant: '../../other' }), null);
    assert.equal(simulate({ hostname: 'localhost', pathname: '/', tenant: null }), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
