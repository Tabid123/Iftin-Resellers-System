import { createFileRoute } from "@tanstack/react-router";
import { PageSuspense, lazyPage } from "@/lib/lazyPages";
const Page = lazyPage("OfflineMode");
import ProtectedRoute from "@/components/ProtectedRoute";

export const Route = createFileRoute("/offline-mode")({
  head: () => ({
    meta: [
      { title: "Offline Mode — Iftin Agents" },
      { name: "description", content: "Order data bundles by SMS when you have no internet connection." },
      { property: "og:title", content: "Offline Mode — Iftin Agents" },
      { property: "og:description", content: "Order data bundles by SMS when you have no internet connection." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: OfflineModeRoute,
});

function OfflineModeRoute() {
  return (<ProtectedRoute><PageSuspense><Page /></PageSuspense></ProtectedRoute>);
}
