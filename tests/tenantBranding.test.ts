/**
 * Verifies that the "Splash / status bar color (hex)" input of the Run workflow
 * form consistently drives the native splash screen, status bar and navigation
 * bar for every tenant build.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
const workflowPath = path.join(root, '.github/workflows/build-tenant-android.yml');
const workflow = fs.readFileSync(workflowPath, 'utf8');
const colorsXml = fs.readFileSync(
  path.join(root, 'android/app/src/main/res/values/colors.xml'),
  'utf8',
);
const stylesXml = fs.readFileSync(
  path.join(root, 'android/app/src/main/res/values/styles.xml'),
  'utf8',
);

/** Runs the exact python patch embedded in the workflow against a temp copy. */
function runWorkflowColorPatch(splashColor: string) {
  const match = workflow.match(/python3 - <<'PY'\n([\s\S]*?)\n\s*PY/);
  if (!match) throw new Error('color patch script not found in workflow');
  const script = match[1]
    .split('\n')
    .map((l) => l.replace(/^ {10}/, ''))
    .join('\n');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tenant-'));
  const values = path.join(dir, 'android/app/src/main/res/values');
  fs.mkdirSync(values, { recursive: true });
  fs.copyFileSync(path.join(root, 'android/app/src/main/res/values/colors.xml'), path.join(values, 'colors.xml'));
  fs.writeFileSync(
    path.join(values, 'strings.xml'),
    `<resources><string name="app_name">x</string><string name="title_activity_main">x</string></resources>`,
  );
  const scriptPath = path.join(dir, 'patch.py');
  fs.writeFileSync(scriptPath, script);
  execFileSync('python3', [scriptPath], {
    cwd: dir,
    env: { ...process.env, APP_NAME: 'Tenant App', SPLASH_COLOR: splashColor },
  });
  return fs.readFileSync(path.join(values, 'colors.xml'), 'utf8');
}

const TENANT_COLORS = ['#0F4C81', '#1A7F37', '#8E44AD', '#ff5722', '#000000'];

describe('workflow wiring', () => {
  it('exposes the splash color input', () => {
    expect(workflow).toMatch(/splash_color:/);
  });

  it('passes the color into the web build as VITE_SPLASH_COLOR', () => {
    expect(workflow).toMatch(/VITE_SPLASH_COLOR:\s*\$\{\{\s*inputs\.splash_color\s*\}\}/);
  });

  it('passes the color to the native asset generator', () => {
    expect(workflow).toMatch(/--iconBackgroundColor "\$SPLASH_COLOR"/);
    expect(workflow).toMatch(/--splashBackgroundColor "\$SPLASH_COLOR"/);
  });
});

describe('android resources', () => {
  it('declares splash, status bar and navigation bar colors', () => {
    for (const name of ['splash_background', 'status_bar_background', 'navigation_bar_background']) {
      expect(colorsXml).toContain(`<color name="${name}">`);
    }
  });

  it('binds the theme to those colors', () => {
    expect(stylesXml).toMatch(/windowSplashScreenBackground">@color\/splash_background/);
    expect(stylesXml).toMatch(/android:statusBarColor">@color\/status_bar_background/);
    expect(stylesXml).toMatch(/android:navigationBarColor">@color\/navigation_bar_background/);
  });
});

describe('per-tenant color patching', () => {
  it.each(TENANT_COLORS)('applies %s to every color entry', (color) => {
    const patched = runWorkflowColorPatch(color);
    const values = [...patched.matchAll(/<color name="[A-Za-z_]+">(#[0-9A-Fa-f]{6})<\/color>/g)].map(
      (m) => m[1],
    );
    expect(values.length).toBeGreaterThanOrEqual(6);
    for (const v of values) expect(v.toLowerCase()).toBe(color.toLowerCase());
  });

  it('falls back to the default brand color when the input is invalid or empty', () => {
    for (const bad of ['', 'blue', '#12345']) {
      const patched = runWorkflowColorPatch(bad);
      expect(patched).toContain('<color name="splash_background">#0F4C81</color>');
    }
  });
});

describe('runtime status/navigation bar color', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('prefers the build-time workflow color over the theme color', async () => {
    vi.stubEnv('VITE_SPLASH_COLOR', '#8E44AD');
    const mod = await import('../src/lib/nativeStatusBar');
    expect(mod.BUILD_BAR_COLOR).toBe('#8E44AD');
  });

  it('is null when no workflow color was supplied, so the theme color is used', async () => {
    vi.stubEnv('VITE_SPLASH_COLOR', '');
    const mod = await import('../src/lib/nativeStatusBar');
    expect(mod.BUILD_BAR_COLOR).toBeNull();
  });

  it('does nothing outside a native app', async () => {
    vi.stubEnv('VITE_SPLASH_COLOR', '#1A7F37');
    vi.doMock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));
    const statusBar = vi.fn();
    vi.doMock('@capacitor/status-bar', () => ({
      StatusBar: { setBackgroundColor: statusBar, setOverlaysWebView: statusBar, setStyle: statusBar },
      Style: { Light: 'LIGHT', Dark: 'DARK' },
    }));
    const mod = await import('../src/lib/nativeStatusBar');
    await mod.applyNativeStatusBarColor('#ffffff');
    expect(statusBar).not.toHaveBeenCalled();
  });
});
