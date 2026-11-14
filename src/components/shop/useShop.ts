import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";

// New schema is deployed by the accompanying migration before enabling any shop.
export const shopDb = supabase as any;
export function useShop() {
  const { tenant } = useTenant();
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
    staleTime: 0,
    refetchInterval: 15000,
    retry: false,
  });
  return {
    tenant,
    enabled: query.data === true && !query.isError,
    loading: query.isLoading,
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
