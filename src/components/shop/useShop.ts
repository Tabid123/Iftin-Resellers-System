import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";

// New schema is deployed by the accompanying migration before enabling any shop.
export const shopDb = supabase as any;
export function useShop() {
  const tenantState = useTenant();
  const { tenant } = tenantState;
  const query = useQuery({
    queryKey: ["shop-enabled", tenant?.id],
    enabled: !!tenant?.id,
    queryFn: async () => {
      const { data, error } = await shopDb
        .from("tenant_shop_features")
        .select("enabled")
        .eq("tenant_id", tenant!.id)
        .maybeSingle();
      if (error) throw error;
      return data?.enabled === true;
    },
    // Show the tenant's recently verified storefront immediately on repeat visits,
    // but always revalidate in the background. Server-side feature gating is authoritative.
    initialData: () => {
      if (!tenant?.id) return undefined;
      try {
        const cached = JSON.parse(localStorage.getItem(`shop:enabled:${tenant.id}`) || "null");
        return cached?.tenantId === tenant.id &&
          typeof cached.enabled === "boolean" &&
          typeof cached.savedAt === "number" &&
          Date.now() - cached.savedAt < 120_000
          ? cached.enabled as boolean
          : undefined;
      } catch {
        return undefined;
      }
    },
    staleTime: 0,
    refetchOnMount: "always",
    refetchInterval: 15000,
    retry: false,
  });
  useEffect(() => {
    if (!tenant?.id || !query.isSuccess || query.isFetching || typeof query.data !== "boolean") return;
    try {
      localStorage.setItem(`shop:enabled:${tenant.id}`, JSON.stringify({
        tenantId: tenant.id, enabled: query.data, savedAt: Date.now(),
      }));
    } catch {
      // Private / quota-limited browsing must continue to work.
    }
  }, [tenant?.id, query.isSuccess, query.isFetching, query.data]);
  return {
    tenant,
    enabled: query.data === true && !query.isError,
    loading: tenantState.status === "loading" || query.isLoading,
    error: query.error,
  };
}
export const money = (n: number) => `$${Number(n).toFixed(2)}`;
export const orderStatuses = {
  received: "Waa la helay",
  preparing: "Waa la diyaarinayaa",
  dispatched: "Waa la soo diray",
  delivered: "Waa la keenay",
  cancelled: "Waa la joojiyay",
};
