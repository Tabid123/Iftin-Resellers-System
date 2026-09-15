import { createFileRoute } from "@tanstack/react-router";
import { PageSuspense, lazyPage } from "@/lib/lazyPages";
const Page = lazyPage("ProviderSelection");
import ProtectedRoute from "@/components/ProtectedRoute";

export const Route = createFileRoute("/t/$slug/providers")({
  head: () => ({
    meta: [
      { title: "Choose Network — Iftin Agents" },
      { name: "description", content: "Pick your mobile network to browse available data and airtime bundles." },
      { property: "og:title", content: "Choose Network — Iftin Agents" },
      { property: "og:description", content: "Pick your mobile network to browse available data and airtime bundles." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProvidersRoute,
});

function ProvidersRoute() {
  return (<ProtectedRoute><PageSuspense><Page /></PageSuspense></ProtectedRoute>);
}
