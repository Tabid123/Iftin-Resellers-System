import { QueryClient, hashKey } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { getTenantId } from "./integrations/supabase/client";
import "./mobile-stability.css";

/**
 * The storefront cache used to be hydrated here, synchronously, from shared
 * `offline_*` names — before the active workspace was known. That is exactly
 * how another workspace's companies appeared for a frame on startup.
 *
 * Hydration now happens in `useOfflineCache`, only after the workspace is
 * resolved, and only from workspace-scoped snapshots. In addition every cache
 * entry is partitioned by the active workspace id, so an entry written for one
 * workspace can never be read by another even if the key literal matches.
 */

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000,
        gcTime: 60 * 60 * 1000,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        retry: 1,
        queryKeyHashFn: (queryKey) => hashKey([getTenantId() ?? "__no_workspace__", ...queryKey]),
      },
    },
  });


  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadDelay: 0,
    defaultPreloadStaleTime: 5 * 60 * 1000,
  });

  return router;
};
