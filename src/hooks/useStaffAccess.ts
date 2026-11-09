import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { mayViewStaffPage, RESTRICTED_ACCESS_MARKER } from '@/lib/staffAccessRules';

type AccessMode = 'loading' | 'full' | 'restricted' | 'denied';
interface AccessState {
  mode: AccessMode;
  keys: ReadonlySet<string>;
}

const INITIAL: AccessState = { mode: 'loading', keys: new Set<string>() };

/**
 * Fetch access using the authenticated user and CURRENT tenant, not profile
 * metadata or a cached tenant ID. Owners / platform super admins are unrestricted.
 * Legacy admins with no permission rows retain their historical full access;
 * restricted accounts always include the marker row.
 *
 * UI guard only: Supabase RLS and privileged server endpoints must separately
 * authorize sensitive reads/writes.
 */
export function useStaffAccess() {
  const tenantState = useTenant();
  const tenantId = tenantState.tenant?.id ?? null;
  const [access, setAccess] = useState<AccessState>(INITIAL);

  const refresh = useCallback(async () => {
    setAccess(INITIAL);
    if (!tenantId) {
      setAccess({ mode: 'denied', keys: new Set() });
      return;
    }

    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) throw authError ?? new Error('No authenticated user');

      const [membershipResult, platformResult, permissionResult] = await Promise.all([
        supabase.from('tenant_members').select('role')
          .eq('tenant_id', tenantId).eq('user_id', user.id).maybeSingle(),
        supabase.from('user_roles').select('role')
          .eq('user_id', user.id).eq('role', 'super_admin').maybeSingle(),
        supabase.from('admin_permissions').select('permission_key')
          .eq('tenant_id', tenantId).eq('user_id', user.id),
      ]);

      if (membershipResult.error || platformResult.error || permissionResult.error) {
        throw membershipResult.error ?? platformResult.error ?? permissionResult.error;
      }

      if (membershipResult.data?.role === 'owner' || platformResult.data?.role === 'super_admin') {
        setAccess({ mode: 'full', keys: new Set() });
        return;
      }
      if (membershipResult.data?.role !== 'admin') {
        setAccess({ mode: 'denied', keys: new Set() });
        return;
      }

      const keys = new Set((permissionResult.data ?? []).map((row) => row.permission_key));
      // Previous accounts can have no permission records, meaning Full Access.
      // New restricted staff ALWAYS receive the explicit marker row.
      const restricted = keys.has(RESTRICTED_ACCESS_MARKER) || keys.size > 0;
      setAccess({ mode: restricted ? 'restricted' : 'full', keys });
    } catch {
      // Never treat an RPC/RLS/network error as Full Access.
      setAccess({ mode: 'denied', keys: new Set() });
    }
  }, [tenantId]);

  useEffect(() => {
    void refresh();
    const onFocus = () => { void refresh(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refresh]);

  const can = useCallback((key: string) =>
    access.mode === 'full' || (access.mode === 'restricted' && access.keys.has(key)),
    [access],
  );

  const canView = useCallback((view?: string) =>
    mayViewStaffPage(view, access.mode, access.keys), [access]);

  return { ...access, ready: access.mode !== 'loading', isOwnerOrPlatform: access.mode === 'full', can, canView, refresh };
}
