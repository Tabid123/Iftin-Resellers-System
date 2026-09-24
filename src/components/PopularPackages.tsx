import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp, Wifi, AlertCircle } from 'lucide-react';
import { Card } from './ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from "@/lib/router-compat";
import { formatPrice } from '@/lib/utils';
import { fetchIftinCatalog, isApiPartnerTenant, mapPopularPackages, type PopularPackageDTO } from '@/lib/iftinCatalog';
import CachedImage from '@/components/CachedImage';
import { useTenant } from '@/contexts/TenantContext';
import { activeWorkspaceId, workspaceQueryKey, workspaceStorage } from '@/lib/workspaceKeys';

const POPULAR_RESOURCE = 'offline_popular_packages_v3';

/**
 * Workspace-scoped only. The old shared snapshot is never read again — it was
 * one of the ways another workspace's catalog could appear for a moment.
 */
function readOffline(workspaceId: string | null): PopularPackageDTO[] {
  if (!workspaceId) return [];
  const parsed = workspaceStorage.getJson<PopularPackageDTO[]>(POPULAR_RESOURCE, [], workspaceId);
  return Array.isArray(parsed) ? parsed : [];
}

function writeOffline(workspaceId: string | null, list: PopularPackageDTO[]) {
  if (!workspaceId || list.length === 0) return;
  workspaceStorage.setJson(POPULAR_RESOURCE, list, workspaceId);
}

const SectionShell = ({ children }: { children: React.ReactNode }) => (
  <div className="space-y-3">
    <div className="flex items-center gap-2">
      <TrendingUp className="w-5 h-5 text-primary" />
      <h2 className="text-base font-bold text-foreground">Xirmooyinka ugu Caansan</h2>
    </div>
    {children}
  </div>
);

const PopularPackages = () => {
  const navigate = useNavigate();
  const tenantState = useTenant();
  const tenant = tenantState.status === 'ready' || tenantState.status === 'suspended'
    ? tenantState.tenant
    : null;
  const workspaceId = tenant?.id ?? null;
  const offline = React.useMemo(() => readOffline(workspaceId), [workspaceId]);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: workspaceQueryKey(workspaceId, 'popularPackages', 'v3'),
    enabled: Boolean(workspaceId),
    queryFn: async (): Promise<PopularPackageDTO[]> => {
      if (!workspaceId) return offline;

      const partner = await isApiPartnerTenant(workspaceId).catch(() => false);
      if (activeWorkspaceId() !== workspaceId) return offline;

      if (partner) {
        const catalog = await fetchIftinCatalog();
        if (activeWorkspaceId() !== workspaceId) return offline;
        const mapped = mapPopularPackages(catalog);
        if (mapped.length > 0) writeOffline(workspaceId, mapped);
        return mapped.length > 0 ? mapped : offline;
      }

      const { data, error } = await (supabase as any).rpc('get_featured_packages');
      if (error || activeWorkspaceId() !== workspaceId) return offline;
      const fresh = Array.isArray(data) ? (data as PopularPackageDTO[]) : [];
      if (fresh.length > 0) writeOffline(workspaceId, fresh);
      return fresh.length > 0 ? fresh : offline;
    },
    initialData: offline.length > 0 ? offline : undefined,
    staleTime: 30 * 1000,
    gcTime: 60 * 60 * 1000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    retry: false,
  });

  const packages = data && data.length > 0 ? data : offline;

  if (isLoading && packages.length === 0) {
    return (
      <SectionShell>
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <Card key={i} className="p-3">
              <div className="flex items-center gap-3 animate-pulse">
                <div className="w-10 h-10 rounded-full bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-muted rounded w-24" />
                  <div className="h-3 bg-muted rounded w-32" />
                </div>
                <div className="h-5 w-12 bg-muted rounded" />
              </div>
            </Card>
          ))}
        </div>
      </SectionShell>
    );
  }

  if (isError && packages.length === 0) {
    return (
      <SectionShell>
        <Card className="p-4 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0" />
          <p className="text-sm text-muted-foreground">
            Xirmooyinka lama soo dejin karin{(error as any)?.message ? ` — ${(error as any).message}` : ''}.
          </p>
        </Card>
      </SectionShell>
    );
  }

  if (packages.length === 0) {
    return (
      <SectionShell>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Weli xirmo caan ah lama dejin.</p>
        </Card>
      </SectionShell>
    );
  }

  return (
    <SectionShell>
      <div className="space-y-2">
        {packages.map((pkg, idx) => (
          <Card
            key={`${pkg.package_id}-${pkg.provider_id}-${idx}`}
            className="p-3 rounded-2xl bg-card hover:shadow-md transition-shadow cursor-pointer border touch-manipulation"
            onClick={() => navigate(`/packages/${pkg.provider_id}`, {
              state: { providerName: pkg.provider_name, selectedPackageId: pkg.package_id },
            })}
          >
            <div className="flex items-center justify-between gap-3 overflow-hidden">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-11 h-11 rounded-full overflow-hidden flex-shrink-0 bg-white flex items-center justify-center">
                  <CachedImage
                    src={pkg.provider_logo}
                    alt={pkg.provider_name}
                    bundledName={pkg.provider_name}
                    className="w-9 h-9 object-contain"
                    fallback={
                      <span className="flex h-full w-full items-center justify-center bg-primary text-sm font-black text-primary-foreground">
                        {(pkg.provider_name || '?').trim().charAt(0).toUpperCase()}
                      </span>
                    }
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Wifi className="w-4 h-4 text-primary flex-shrink-0" />
                    <p className="font-semibold text-sm text-foreground truncate">
                      {pkg.data_amount || pkg.package_name}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {pkg.provider_name} - {pkg.package_name}
                  </p>
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="font-bold text-primary text-base whitespace-nowrap">${formatPrice(pkg.selling_price)}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </SectionShell>
  );
};

export default PopularPackages;
