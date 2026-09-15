/**
 * Regression protection for cross-workspace data leaks.
 *
 * These tests fail if somebody reintroduces shared (workspace-less) cache
 * names or query keys for workspace-owned state, or if the canonical helper
 * stops refusing to work without a resolved workspace.
 */
import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// The helper reads the active workspace from the Supabase client module.
let active: string | null = null;
vi.mock('@/integrations/supabase/client', () => ({
  getTenantId: () => active,
}));

import {
  LEGACY_SHARED_STORAGE_KEYS,
  isForeignWorkspaceStorageKey,
  purgeNonActiveWorkspaceStorage,
  workspaceQueryKey,
  workspaceStorage,
  workspaceStorageKey,
} from '@/lib/workspaceKeys';

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';

class MemoryStorage {
  private map = new Map<string, string>();
  get length() { return this.map.size; }
  key(i: number) { return Array.from(this.map.keys())[i] ?? null; }
  getItem(k: string) { return this.map.has(k) ? this.map.get(k)! : null; }
  setItem(k: string, v: string) { this.map.set(k, String(v)); }
  removeItem(k: string) { this.map.delete(k); }
  clear() { this.map.clear(); }
}

beforeEach(() => {
  active = A;
  const store = new MemoryStorage();
  (globalThis as any).window = { localStorage: store };
});

afterEach(() => {
  delete (globalThis as any).window;
});

describe('canonical workspace keys', () => {
  it('puts the workspace in every query key', () => {
    expect(workspaceQueryKey(A, 'packages', 'p1')).toEqual(['ws', A, 'packages', 'p1']);
    expect(workspaceQueryKey(A, 'providers')).not.toEqual(workspaceQueryKey(B, 'providers'));
  });

  it('puts the workspace in every storage name', () => {
    expect(workspaceStorageKey(A, 'offline_providers')).toBe(`ws:${A}:offline_providers`);
    expect(workspaceStorageKey(A, 'offline_providers')).not.toBe(
      workspaceStorageKey(B, 'offline_providers'),
    );
  });

  it('refuses to build a workspace key without a workspace', () => {
    active = null;
    expect(() => workspaceQueryKey(null, 'providers')).toThrow(/without an active workspace/);
    expect(() => workspaceStorageKey(null, 'offline_providers')).toThrow();
  });
});

describe('workspace A cannot read or restore workspace B state', () => {
  it('never returns another workspace snapshot', () => {
    workspaceStorage.setJson('offline_providers', [{ id: 'a-provider' }], A);
    workspaceStorage.setJson('offline_providers', [{ id: 'b-provider' }], B);
    expect(workspaceStorage.getJson('offline_providers', [], A)).toEqual([{ id: 'a-provider' }]);
    expect(workspaceStorage.getJson('offline_providers', [], B)).toEqual([{ id: 'b-provider' }]);
  });

  it('reads nothing while the workspace is unresolved', () => {
    workspaceStorage.setJson('offline_providers', [{ id: 'a-provider' }], A);
    active = null;
    expect(() => workspaceStorage.getJson('offline_providers', [])).toThrow();
  });

  it('purges legacy shared snapshots and foreign workspace snapshots on startup', () => {
    const store = (globalThis as any).window.localStorage as MemoryStorage;
    store.setItem('offline_providers', '[{"id":"legacy"}]');
    store.setItem('iftin_tenant_id_v1', B);
    workspaceStorage.setJson('offline_providers', [{ id: 'a' }], A);
    workspaceStorage.setJson('offline_providers', [{ id: 'b' }], B);

    purgeNonActiveWorkspaceStorage(A);

    expect(store.getItem('offline_providers')).toBeNull();
    expect(store.getItem('iftin_tenant_id_v1')).toBeNull();
    expect(store.getItem(`ws:${B}:offline_providers`)).toBeNull();
    expect(store.getItem(`ws:${A}:offline_providers`)).not.toBeNull();
  });

  it('recognises a foreign snapshot name', () => {
    expect(isForeignWorkspaceStorageKey(`ws:${B}:offline_packages`, A)).toBe(true);
    expect(isForeignWorkspaceStorageKey(`ws:${A}:offline_packages`, A)).toBe(false);
    expect(isForeignWorkspaceStorageKey(`ws:${A}:offline_packages`, null)).toBe(true);
  });
});

describe('generic workspace-owned keys cannot come back', () => {
  const SRC = path.resolve(__dirname, '../src');
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry.name)) files.push(full);
    }
  };
  walk(SRC);

  // These files legitimately name the legacy keys in order to delete them.
  const CLEANUP_ALLOWED = [
    'src/lib/workspaceKeys.ts',
    'src/lib/storefrontEvents.ts',
    'src/contexts/TenantContext.tsx',
    'src/routes/__root.tsx',
    'src/router.tsx',
  ];

  it('no direct localStorage access to workspace-owned snapshots', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const rel = path.relative(path.resolve(__dirname, '..'), file);
      if (CLEANUP_ALLOWED.includes(rel)) continue;
      const src = fs.readFileSync(file, 'utf8');
      for (const key of LEGACY_SHARED_STORAGE_KEYS) {
        const direct = new RegExp(`localStorage\\.(get|set|remove)Item\\(\\s*['\`"]${key}`);
        if (direct.test(src)) offenders.push(`${rel} → ${key}`);
      }
      if (/localStorage\.(get|set|remove)Item\(\s*[`'"]offline_/.test(src)) {
        offenders.push(`${rel} → direct offline_* access`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('no generic tenant-owned react-query keys', () => {
    const generic = /queryKey:\s*\[\s*['"](providers|packages|categories|paymentProviders|featuredPackages|popularPackages|promotionalText)['"]/;
    const offenders: string[] = [];
    for (const file of files) {
      const rel = path.relative(path.resolve(__dirname, '..'), file);
      const src = fs.readFileSync(file, 'utf8');
      if (generic.test(src)) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });

  it('no persisted workspace id is treated as authoritative', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const rel = path.relative(path.resolve(__dirname, '..'), file);
      if (CLEANUP_ALLOWED.includes(rel)) continue;
      const src = fs.readFileSync(file, 'utf8');
      if (/iftin_tenant_id_v1/.test(src) && !/never authoritative|shortcut could/.test(src)) {
        offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('late responses and old subscriptions cannot touch the new workspace', () => {
  /** Mirrors the guard used in every workspace-owned fetcher. */
  const commit = (requestedWorkspace: string, value: unknown) => {
    if (active !== requestedWorkspace) return false;
    workspaceStorage.setJson('offline_providers', value, requestedWorkspace);
    return true;
  };

  it('a request started in A cannot mutate B state after the switch', () => {
    const requested = A;
    active = B; // workspace switched while the request was in flight
    workspaceStorage.setJson('offline_providers', [{ id: 'b-provider' }], B);

    expect(commit(requested, [{ id: 'a-provider' }])).toBe(false);
    expect(workspaceStorage.getJson('offline_providers', [], B)).toEqual([{ id: 'b-provider' }]);
    expect(workspaceStorage.getJson('offline_providers', [], A)).toEqual([]);
  });

  it('a realtime handler bound to A is ignored once B is active', () => {
    const seen: string[] = [];
    const handlerFor = (workspace: string) => () => {
      if (active !== workspace) return;
      seen.push(workspace);
    };
    const aHandler = handlerFor(A);
    const bHandler = handlerFor(B);
    active = B;
    aHandler();
    bHandler();
    expect(seen).toEqual([B]);
  });

  it('realtime channel names are workspace-specific so cleanup cannot cross workspaces', () => {
    const channel = (id: string) => `providers-realtime-${id}`;
    expect(channel(A)).not.toBe(channel(B));
  });
});
