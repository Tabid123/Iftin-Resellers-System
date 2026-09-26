import { createFileRoute } from "@tanstack/react-router";
import { PageSuspense, lazyPage } from "@/lib/lazyPages";
const Index = lazyPage("Index");

export const Route = createFileRoute("/t/$slug/")({
  head: () => ({
    meta: [
      { title: "Iftin Agents — Buy Mobile Data & Airtime in Somalia" },
      { name: "description", content: "Buy mobile data bundles and airtime instantly from Somali networks with fast, secure mobile-money payments." },
      { property: "og:title", content: "Iftin Agents — Buy Mobile Data & Airtime in Somalia" },
      { property: "og:description", content: "Buy mobile data bundles and airtime instantly from Somali networks with fast, secure mobile-money payments." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (<PageSuspense><Index /></PageSuspense>),
});
