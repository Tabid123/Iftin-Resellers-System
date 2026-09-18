/**
 * Canonical workspace-scoped key API.
 *
 * Every cache entry and every saved snapshot that belongs to one workspace
 * MUST be created through these helpers. Hand-written keys such as
 * `['providers']` or `'offline_providers'` are how another workspace's data
 * ended up on screen, so they are forbidden for workspace-owned state and are
 * covered by regression tests.
 *
 * Rules enforced here:
 *  - the active workspace id is part of every key;
 *  - while the workspace is unknown, reads return nothing and writes are
 *    dropped — tenant-owned state can never be restored before resolution;
 *  - in development, using a workspace-owned key without a workspace throws so
 *    the mistake is caught before it ships. Production degrades quietly.
 */
import { getTenantId } from '@/integrations/supabase/client';

const IS_DEV = Boolean(import.meta.env?.DEV);

export const WORKSPACE_KEY_PREFIX = 'ws';
export const WORKSPACE_STORAGE_PREFIX = 'ws:';

/** Legacy shared names. Never read again — only removed. */
export const LEGACY_SHARED_STORAGE_KEYS = [
  'offline_providers',
  'offline_categories',
  'offline_packages',
  'offline_payment_providers',
  'offline_delivery_instructions',
  'offline_app_settings',
  'offline_featured_packages',
  'offline_popular_packages_v2',
  'offline_popular_packages_v3',
  'offline_cache_timestamp',
  'offline_banners',
  'iftin_catalog_v3_local_images',
  'iftin_tenant_id_v1',
];

export class MissingWorkspaceError extends Error {
  constructor(context: string) {
    super(
      `Workspace-owned operation "${context}" ran without an active workspace. ` +
        'Wait for the workspace to be resolved before querying, caching or subscribing.',
    );
    this.name = 'MissingWorkspaceError';
  }
}

/** The workspace currently scoping all requests, or null while unresolved. */
export function activeWorkspaceId(): string | null {
  const id = getTenantId();
  return id && id.length > 0 ? id : null;
}

/**
 * Development fail-fast. Returns null in production so the app degrades to
 * "no data yet" instead of crashing for a real user.
 */
export function requireWorkspace(context: string, workspaceId?: string | null): string | null {
  const id = workspaceId ?? activeWorkspaceId();
  if (id) return id;
  if (IS_DEV) throw new MissingWorkspaceError(context);
  return null;
}

/**
 * Cache key for workspace-owned data.
 * `workspaceQueryKey(id, 'packages', providerId)` → `['ws', id, 'packages', providerId]`.
 * Without a workspace the key degrades to an unusable, never-matching key and
 * throws in development.
 */
export function workspaceQueryKey(
  workspaceId: string | null | undefined,
  resource: string,
  ...parts: Array<string | number | null | undefined>
): readonly unknown[] {
  const id = requireWorkspace(`queryKey:${resource}`, workspaceId);
  return [WORKSPACE_KEY_PREFIX, id ?? '__no_workspace__', resource, ...parts];
}

/**
 * Same as `workspaceQueryKey`, but tolerates a workspace that is still being
 * resolved: it returns an inert key instead of throwing. Use it for queries
 * that are rendered before resolution and gated with `enabled`.
 */
export function optionalWorkspaceQueryKey(
  workspaceId: string | null | undefined,
  resource: string,
  ...parts: Array<string | number | null | undefined>
): readonly unknown[] {
  const id = workspaceId ?? activeWorkspaceId();
  if (!id) return [WORKSPACE_KEY_PREFIX, '__pending__', resource, ...parts];
  return workspaceQueryKey(id, resource, ...parts);
}

/** Saved-data name for workspace-owned data, or null when unresolved. */
export function workspaceStorageKey(
  workspaceId: string | null | undefined,
  resource: string,
): string | null {
  const id = requireWorkspace(`storageKey:${resource}`, workspaceId);
  if (!id) return null;
  return `${WORKSPACE_STORAGE_PREFIX}${id}:${resource}`;
}

/** True when the given key belongs to a workspace other than the active one. */
export function isForeignWorkspaceStorageKey(key: string, activeId: string | null): boolean {
  if (!key.startsWith(WORKSPACE_STORAGE_PREFIX)) return false;
  const rest = key.slice(WORKSPACE_STORAGE_PREFIX.length);
  const owner = rest.slice(0, rest.indexOf(':'));
  return !activeId || owner !== activeId;
}

function safeLocalStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export const workspaceStorage = {
  get(resource: string, workspaceId?: string | null): string | null {
    const store = safeLocalStorage();
    const key = workspaceStorageKey(workspaceId ?? activeWorkspaceId(), resource);
    if (!store || !key) return null;
    try {
      return store.getItem(key);
    } catch {
      return null;
    }
  },

  getJson<T>(resource: string, fallback: T, workspaceId?: string | null): T {
    const raw = workspaceStorage.get(resource, workspaceId);
    if (!raw) return fallback;
    try {
      const parsed = JSON.parse(raw);
      return (parsed ?? fallback) as T;
    } catch {
      return fallback;
    }
  },

  set(resource: string, value: string, workspaceId?: string | null): void {
    const store = safeLocalStorage();
    const key = workspaceStorageKey(workspaceId ?? activeWorkspaceId(), resource);
    if (!store || !key) return;
    try {
      store.setItem(key, value);
    } catch {
      /* quota or private mode */
    }
  },

  setJson(resource: string, value: unknown, workspaceId?: string | null): void {
    try {
      workspaceStorage.set(resource, JSON.stringify(value), workspaceId);
    } catch {
      /* circular structure */
    }
  },

  remove(resource: string, workspaceId?: string | null): void {
    const store = safeLocalStorage();
    const key = workspaceStorageKey(workspaceId ?? activeWorkspaceId(), resource);
    if (!store || !key) return;
    try {
      store.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

/**
 * Startup hygiene: delete every legacy shared snapshot and every snapshot that
 * belongs to another workspace. Local cache only — no remote data is touched.
 */
export function purgeNonActiveWorkspaceStorage(activeId: string | null): void {
  const store = safeLocalStorage();
  if (!store) return;
  try {
    const doomed: string[] = [];
    for (const key of LEGACY_SHARED_STORAGE_KEYS) {
      if (store.getItem(key) !== null) doomed.push(key);
    }
    for (let i = 0; i < store.length; i += 1) {
      const key = store.key(i);
      if (!key) continue;
      if (isForeignWorkspaceStorageKey(key, activeId)) doomed.push(key);
      // Older unscoped storefront snapshots from previous app versions.
      else if (
        key.startsWith('offline_') ||
        key.startsWith('iftin_catalog') ||
        key.startsWith('najax.banners') ||
        key.startsWith('banners_')
      ) {
        doomed.push(key);
      }
    }
    doomed.forEach((key) => store.removeItem(key));
  } catch {
    /* ignore storage restrictions */
  }
}
