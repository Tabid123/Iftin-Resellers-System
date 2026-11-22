import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import ShopSkeleton from "@/components/shop/ShopSkeleton";

const ShopPage = lazy(() => import("@/components/shop/ShopPage"));

// Tenant links such as /t/demo/providers must stay under the same tenant
// when the shop banner or its bottom navigation is opened.
export const Route = createFileRoute("/t/$slug/shop")({
  validateSearch: (search: Record<string, unknown>) => ({
    view:
      typeof search.view === "string" &&
      ["home", "search", "product", "cart", "checkout", "success", "orders"].includes(search.view)
        ? search.view
        : "home",
    category: typeof search.category === "string" ? search.category : undefined,
    product: typeof search.product === "string" ? search.product : undefined,
  }),
  component: () => (
    <Suspense fallback={<ShopSkeleton />}>
      <ShopPage />
    </Suspense>
  ),
});
