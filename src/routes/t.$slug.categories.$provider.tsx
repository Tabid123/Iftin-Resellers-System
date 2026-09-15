import { createFileRoute } from "@tanstack/react-router";
import { PageSuspense, lazyPage } from "@/lib/lazyPages";
const Page = lazyPage("CategorySelection");
import ProtectedRoute from "@/components/ProtectedRoute";

export const Route = createFileRoute("/t/$slug/categories/$provider")({
  head: () => ({
    meta: [
      { title: "Bundle Categories — Iftin Agents" },
      { name: "description", content: "Browse data, voice and combo bundle categories for your network." },
      { property: "og:title", content: "Bundle Categories — Iftin Agents" },
      { property: "og:description", content: "Browse data, voice and combo bundle categories for your network." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CategoriesRoute,
});

function CategoriesRoute() {
  return (<ProtectedRoute><PageSuspense><Page /></PageSuspense></ProtectedRoute>);
}
