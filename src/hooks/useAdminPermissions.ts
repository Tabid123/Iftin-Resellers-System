import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';

/**
 * Tenant staff permissions. An owner or platform super-admin is never restricted.
 * Legacy staff with no permission rows retain full access; new/edit forms write
 * explicit rows (or the NO_ACCESS_KEY marker), so an empty selection is unambiguous.
 */
export const NO_ACCESS_KEY = 'no_access';
export const RESTRICTED_ACCESS_KEY = 'restricted_access';

export const ADMIN_PERMISSION_KEYS = [
  { key: 'view_sales_today', label: 'Sales Today', labelSo: 'Dakhliga Maanta Arag' },
  { key: 'view_profit', label: 'View Profit', labelSo: "Faa'iidada Arag" },
  { key: 'manual_transactions', label: 'Manual Transactions', labelSo: 'Dalab Manual Samee' },
  { key: 'manage_packages', label: 'Manage Packages', labelSo: 'Xirmooyinka Maaree' },
  { key: 'manage_providers', label: 'Manage Providers', labelSo: 'Shirkadaha Maaree' },
  { key: 'manage_orders', label: 'Manage Orders', labelSo: 'Dalabyada Maaree' },
  { key: 'view_transactions', label: 'View Transactions', labelSo: 'Lacagaha Arag' },
  { key: 'manage_users', label: 'Manage Users', labelSo: 'Isticmaalayaasha Maaree' },
  { key: 'manage_settings', label: 'Manage Settings', labelSo: 'Settings Maaree' },
  { key: 'manage_devices', label: 'Manage Devices', labelSo: 'Devices Maaree' },
  { key: 'manage_bulk_sms', label: 'Bulk SMS', labelSo: 'Bulk SMS' },
  { key: 'view_audit_log', label: 'View Audit Log', labelSo: 'Audit Log Arag' },
  { key: 'manage_admins', label: 'Manage Admins', labelSo: 'Admins Maaree' },
] as const;

export function serializeAdminPermissions(selected: string[]): string[] {
  return [RESTRICTED_ACCESS_KEY, ...(selected.length > 0 ? selected : [NO_ACCESS_KEY])];
}

type AccessState = {
  loading: boolean;
  fullAccess: boolean;
  keys: string[];
};

export function useAdminPermissions() {
  const { tenant } = useTenant();
  const tenantId = tenant?.id ?? null;
  const [state, setState] = useState<AccessState>({ loading: true, fullAccess: false, keys: [] });

  useEffect(() => {
    let active = true;
    setState({ loading: true, fullAccess: false, keys: [] });
    if (!tenantId) return () => { active = false; };

    (async () => {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) throw authError || new Error('Not signed in');
        const [membershipResult, platformRoleResult] = await Promise.all([
          supabase.from('tenant_members').select('role')
            .eq('tenant_id', tenantId).eq('user_id', user.id).maybeSingle(),
          supabase.from('user_roles').select('role')
            .eq('user_id', user.id).eq('role', 'super_admin').maybeSingle(),
        ]);
        if (membershipResult.error) throw membershipResult.error;
        if (platformRoleResult.error) throw platformRoleResult.error;
        if (platformRoleResult.data?.role === 'super_admin' || membershipResult.data?.role === 'owner') {
          if (active) setState({ loading: false, fullAccess: true, keys: [] });
          return;
        }
        if (membershipResult.data?.role !== 'admin') throw new Error('No tenant staff membership');

        const { data, error } = await supabase.from('admin_permissions')
          .select('permission_key').eq('tenant_id', tenantId).eq('user_id', user.id);
        if (error) throw error;
        const keys = (data || []).map((row) => row.permission_key);
        // Backward compatibility: older admin accounts were created with no rows
        // and the management screen explicitly described them as Full Access.
        if (active) setState({ loading: false, fullAccess: keys.length === 0, keys });
      } catch (error) {
        console.error('Unable to load tenant staff permissions:', error);
        if (active) setState({ loading: false, fullAccess: false, keys: [] });
      }
    })();
    return () => { active = false; };
  }, [tenantId]);

  const can = (key: string): boolean => {
    if (state.loading) return false;
    return state.fullAccess || state.keys.includes(key);
  };

  return { can, fullAccess: state.fullAccess, loadingPermissions: state.loading };
}
