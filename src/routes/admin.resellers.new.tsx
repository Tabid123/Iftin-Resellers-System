import { createFileRoute } from "@tanstack/react-router";
import { PageSuspense, lazyPage } from "@/lib/lazyPages";
const Page = lazyPage("ResellerNewPage");


export const Route = createFileRoute("/admin/resellers/new")({
  head: () => ({
    meta: [
      { title: "New Reseller — Platform Console" },
      { name: "description", content: "Create a new reseller tenant with its own branding and plan." },
      { property: "og:title", content: "New Reseller — Platform Console" },
      { property: "og:description", content: "Create a new reseller tenant with its own branding and plan." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ResellerNewRoute,
});

function ResellerNewRoute() {
  
  return <PageSuspense><Page /></PageSuspense>;
}
