import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
const ShopPage = lazy(() => import("@/components/shop/ShopPage"));
export const Route = createFileRoute("/shop")({
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
    <Suspense fallback={<p className="p-8">Sug...</p>}>
      <ShopPage />
    </Suspense>
  ),
});
