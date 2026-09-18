import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { brokeredPreviewStorage } from './previewAuthStorage';

const SUPABASE_URL = "https://bpkddmxpyeyxvjyebull.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJwa2RkbXhweWV5eHZqeWVidWxsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3NTQ5NzEsImV4cCI6MjA5NjMzMDk3MX0.vHVvxVI2x87aWeiNlzwIoCqU1y-tNlvbc0j_PJcRuvk";

const TENANT_STORAGE_KEY = 'iftin:tenant-id';

type TenantChangeListener = (prev: string | null, next: string | null) => void;

/**
 * Never authoritative: a workspace id left over from a previous run must not
 * scope a single request. The active workspace is always re-derived from the
 * authoritative slug/domain/build by TenantContext, which calls
 * `setTenantHeader` before any workspace-owned request. Starting at `null`
 * closes the startup window in which workspace A's id could still be attached
 * while workspace B is being resolved.
 */
let currentTenantId: string | null = null;

const tenantListeners = new Set<TenantChangeListener>();

/** Current tenant id used for the `x-tenant-id` header. */
export function getTenantId(): string | null {
  return currentTenantId;
}

/** Sets (or clears) the tenant scoping every Supabase request. */
export function setTenantHeader(tenantId: string | null) {
  const prev = currentTenantId;
  if (prev === tenantId) return;
  currentTenantId = tenantId;
  if (typeof window !== 'undefined') {
    try {
      if (tenantId) window.localStorage.setItem(TENANT_STORAGE_KEY, tenantId);
      else window.localStorage.removeItem(TENANT_STORAGE_KEY);
    } catch {
      /* storage unavailable */
    }
  }
  for (const listener of tenantListeners) {
    try {
      listener(prev, tenantId);
    } catch {
      /* listener errors must not break the app */
    }
  }
}

/** Subscribes to tenant switches. Returns an unsubscribe function. */
export function registerTenantChangeListener(listener: TenantChangeListener): () => void {
  tenantListeners.add(listener);
  return () => {
    tenantListeners.delete(listener);
  };
}

/** fetch wrapper that attaches the current tenant header. */
export function tenantAwareFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const headers = new Headers(init.headers ?? {});
  if (currentTenantId) headers.set('x-tenant-id', currentTenantId);
  return fetch(input, { ...init, headers });
}

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

// NOTE: tenant_id is filled in by a database trigger (set_tenant_id_default),
// so inserts legitimately omit it. The generated types mark it required, which
// would break every insert — we relax the insert typing here.
const rawClient = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: brokeredPreviewStorage(),
    persistSession: true,
    autoRefreshToken: true,
  },
  global: {
    fetch: tenantAwareFetch,
  },
});

export const supabase = rawClient as unknown as ReturnType<typeof createClient<any, 'public', any>>;

/**
 * Calls a public Edge Function without the storefront x-tenant-id header.
 * This is for anonymous storefront actions whose tenant identity is carried in
 * the JSON body and verified server-side. Using rawClient.functions.invoke()
 * would inherit tenantAwareFetch and trigger a browser CORS preflight failure
 * because x-tenant-id is intentionally not accepted by public Edge Functions.
 */
export async function invokePublicEdgeFunction<T = unknown>(
  functionName: string,
  body: Record<string, unknown>,
): Promise<{ data: T | null; error: Error | null }> {
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = typeof payload?.error === 'string'
        ? payload.error
        : `Edge Function error (${response.status})`;
      return { data: payload as T, error: new Error(message) };
    }

    return { data: payload as T, error: null };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Edge Function request failed'),
    };
  }
}

/**
 * Calls an authenticated Edge Function without the storefront `x-tenant-id`
 * request header. The tenant is still supplied explicitly in the JSON body and
 * verified server-side. This avoids browser CORS preflight failures on Edge
 * Functions that do not opt into the storefront-only header.
 */
export async function invokeEdgeFunction<T = unknown>(
  functionName: string,
  body: Record<string, unknown>,
): Promise<{ data: T | null; error: Error | null }> {
  const { data: { session }, error: sessionError } = await rawClient.auth.getSession();
  if (sessionError) return { data: null, error: sessionError };
  if (!session?.access_token) return { data: null, error: new Error('Session-ka admin-ka lama helin') };

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: SUPABASE_PUBLISHABLE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = typeof payload?.error === 'string'
        ? payload.error
        : `Edge Function error (${response.status})`;
      return { data: payload as T, error: new Error(message) };
    }

    return { data: payload as T, error: null };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Edge Function request failed'),
    };
  }
}

/**
 * Tenant guard: tenant kasta wuxuu arkaa xogtiisa oo keliya.
 * Super admin RLS wuu dhaafaa, sidaas darteed halkan ayaan ku xannibaynaa
 * dhinaca client-ka: hadduu tenant furan yahay, `tenant_id` filter ayaa
 * si toos ah loogu darayaa select/update/delete kasta.
 */
const CROSS_TENANT_TABLES = new Set([
  'tenants',
  'tenant_members',
  'user_roles',
  'subscription_plans',
  'platform_apps',
]);

function withTenantFilter(builder: any, tenantId: string) {
  for (const method of ['select', 'update', 'delete'] as const) {
    const original = builder[method]?.bind(builder);
    if (!original) continue;
    builder[method] = (...args: any[]) => {
      const query = original(...args);
      return typeof query?.eq === 'function' ? query.eq('tenant_id', tenantId) : query;
    };
  }
  return builder;
}

const originalFrom = rawClient.from.bind(rawClient);
(rawClient as any).from = (table: string) => {
  const builder = originalFrom(table as any);
  const tid = currentTenantId;
  if (!tid || CROSS_TENANT_TABLES.has(table)) return builder;
  return withTenantFilter(builder, tid);
};

/** Platform (super admin) oo keliya: xog dhammaan tenant-yada leh. */
export const supabaseAllTenants = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: brokeredPreviewStorage(),
    persistSession: true,
    autoRefreshToken: true,
  },
}) as unknown as ReturnType<typeof createClient<any, 'public', any>>;
