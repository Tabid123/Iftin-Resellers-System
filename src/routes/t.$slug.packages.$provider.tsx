import { createFileRoute } from "@tanstack/react-router";
import { PageSuspense, lazyPage } from "@/lib/lazyPages";
const Page = lazyPage("DataPackages");
import ProtectedRoute from "@/components/ProtectedRoute";

export const Route = createFileRoute("/t/$slug/packages/$provider")({
  head: () => ({
    meta: [
      { title: "Data Packages — Iftin Agents" },
      { name: "description", content: "Compare and buy data packages for your Somali mobile network." },
      { property: "og:title", content: "Data Packages — Iftin Agents" },
      { property: "og:description", content: "Compare and buy data packages for your Somali mobile network." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PackagesRoute,
});

function PackagesRoute() {
  return (<ProtectedRoute><PageSuspense><Page /></PageSuspense></ProtectedRoute>);
}
