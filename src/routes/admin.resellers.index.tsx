import { createFileRoute } from "@tanstack/react-router";
import { PageSuspense, lazyPage } from "@/lib/lazyPages";
const Page = lazyPage("ResellersPage");


export const Route = createFileRoute("/admin/resellers/")({
  head: () => ({
    meta: [
      { title: "Resellers — Platform Console" },
      { name: "description", content: "Browse and manage all reseller tenants on the platform." },
      { property: "og:title", content: "Resellers — Platform Console" },
      { property: "og:description", content: "Browse and manage all reseller tenants on the platform." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ResellersRoute,
});

function ResellersRoute() {
  
  return <PageSuspense><Page /></PageSuspense>;
}
